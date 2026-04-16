"""
Drafting Layer — AI classification with structured output + retry.

Uses Pydantic for validation. Retries once on parse failure.
"""
import json
import logging
from dataclasses import dataclass
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator

from services import openai_service
from agents.knowledge import KnowledgeContext
from agents.intake import IntakeContext

log = logging.getLogger("docuagent")

# ── Validated output schema ───────────────────────────────────

class ClassificationOutput(BaseModel):
    can_answer: bool
    confidence: float
    category: str
    reason: str
    urgency_score: int = 0
    sentiment: str = "neutral"
    booking_intent: bool = False

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v):
        return round(max(0.0, min(1.0, float(v))), 2)

    @field_validator("urgency_score")
    @classmethod
    def clamp_urgency(cls, v):
        return max(0, min(100, int(v)))

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        allowed = {"complaint", "inquiry", "appointment", "other"}
        return v if v in allowed else "other"

    @field_validator("sentiment")
    @classmethod
    def valid_sentiment(cls, v):
        allowed = {"positive", "neutral", "negative", "angry"}
        return v if v in allowed else "neutral"


# ── System prompt template ────────────────────────────────────

_CLASSIFY_SYSTEM = """You are an expert email classifier for a customer service team.

Classify the incoming email and respond ONLY with valid JSON:
{{"can_answer": true/false, "confidence": 0.0-1.0, "category": "complaint|inquiry|appointment|other", "reason": "1 sentence", "urgency_score": 0-100, "sentiment": "positive|neutral|negative|angry", "booking_intent": true/false}}

Category rules:
- "complaint":    customer expresses dissatisfaction, reports a problem, requests refund/compensation
- "inquiry":      customer asks a question, requests information, needs help or guidance
- "appointment":  customer requests a meeting, demo, consultation, or callback
- "other":        newsletter, spam, internal, out-of-scope

Urgency score rules (0-100):
- 0-20:  routine, no deadline, low stakes
- 21-50: moderate, should be addressed today
- 51-75: time-sensitive, references deadline or waiting
- 76-100: critical — legal threat, service outage, VIP, explicit urgency ("sürgős", "azonnal", "urgent", "asap")

Sentiment rules:
- "positive": satisfied, grateful, complimentary tone
- "neutral":  factual, no strong emotion
- "negative": frustrated, disappointed, complaining
- "angry":    aggressive, threatening, uses strong language

Decision rules:
- can_answer=true ONLY IF: confidence >= {threshold} AND category != "complaint"
- Complaints always → can_answer=false (need human empathy)
- Uncertainty or ambiguity → lower confidence, can_answer=false
- Short/vague emails → confidence max 0.65{feedback_ctx}"""


@dataclass
class DraftResult:
    output: ClassificationOutput
    model_used: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


async def classify(
    subject: str,
    body: str,
    knowledge: KnowledgeContext,
    intake: IntakeContext,
    policy: dict,
    tenant_id: Optional[str] = None,
) -> DraftResult:
    """
    Run AI classification with Pydantic validation.
    Retries once if JSON parse fails.
    Raises on second failure.
    """
    threshold = policy.get("conf_threshold", 0.72)
    use_smart = policy.get("use_smart_model_for_reply", True)
    smart_thresh = policy.get("smart_model_threshold", 0.80)

    model = openai_service.MODEL_SMART if use_smart else openai_service.MODEL_MINI

    sys_prompt = _CLASSIFY_SYSTEM.format(
        threshold=threshold,
        feedback_ctx=knowledge.feedback_ctx,
    )

    # Enrich user message with extracted entities if present
    entity_hint = ""
    if intake.invoice_ids:
        entity_hint += f"\nDetected invoice IDs: {', '.join(intake.invoice_ids)}"
    if intake.urgency_signals:
        entity_hint += f"\nUrgency signals detected: {', '.join(intake.urgency_signals)}"
    if intake.amounts:
        entity_hint += f"\nMonetary amounts mentioned: {', '.join(intake.amounts)}"

    user_text = f"Subject: {subject}\n\n{(body or '')[:3000]}{entity_hint}"

    last_error = None
    for attempt in range(2):
        try:
            raw = await openai_service.chat(
                [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user",   "content": user_text},
                ],
                max_tokens=300,
                json_mode=True,
                task_type="classify",
                model=model,
                tenant_id=tenant_id,
            )
            parsed = json.loads(raw)
            output = ClassificationOutput(**parsed)
            return DraftResult(output=output, model_used=model)
        except Exception as e:
            last_error = e
            log.warning(f"Drafting classify attempt {attempt + 1} failed: {e}")
            if attempt == 0:
                model = openai_service.MODEL_MINI  # fallback to mini on retry

    raise RuntimeError(f"Drafting classify failed after 2 attempts: {last_error}")
