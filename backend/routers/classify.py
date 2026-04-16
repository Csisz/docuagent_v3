"""
Email osztályozás és válaszgenerálás.

v3.4 változások:
  - Feedback tenant isolation: get_feedback_context() kap tenant_id-t
  - agent_runs: minden classify és reply_generate fut loggolva
  - tenant_id a ClassifyRequest.tenant_id mezőből jön (ingest pipeline állítja be)

v3.3 változások:
  - Email-specifikus prompt optimalizálás: ügyfélszolgálati kontextus,
    pontosabb kategóriák, hangnem szabályok
  - generate_reply logol a rag_logs táblába (latency, lang, confidence)
  - Fallback logika: ha alacsony confidence → NEEDS_ATTENTION marad,
    nem generál gyenge választ

v3.16 (Phase 4 Part 2):
  - 5-rétegű agent architektúra: Intake → Knowledge → Drafting → Compliance → Action
  - asyncio.gather: intake + knowledge párhuzamosan fut
  - Policy engine: BASE_POLICY + DB tenant overrides
  - Backward-compatible response shape megőrzve
"""
import asyncio
import time
import logging
from fastapi import APIRouter
from services import openai_service, learning_service
from services.file_service import detect_language
from services.policy_engine import get_policy
import db.queries as q
import db.run_queries as rq
from models.schemas import (
    ClassifyRequest, ClassifyResponse, ReplyRequest,
    EmailCategory, EmailStatus, AiDecision
)
from core.config import OPENAI_API_KEY, CONF_THRESHOLD, COMPANY_NAME

# ── Agent layers ───────────────────────────────────────────────
import agents.intake as intake_layer
import agents.knowledge as knowledge_layer
import agents.drafting as drafting_layer
import agents.compliance as compliance_layer
import agents.action as action_layer

router = APIRouter(prefix="/api", tags=["AI"])
log    = logging.getLogger("docuagent")

# ── Nyelv → hangnem utasítás ──────────────────────────────────
_LANG_INSTRUCTION = {
    "HU": (
        "Válaszolj magyarul. Legyen udvarias, empatikus és szakmai az üzenet. "
        "Szólítsd meg az ügyfelet tegező helyett magázva. "
        "Kerüld a túl formális vagy bürokratikus fogalmazást."
    ),
    "EN": (
        "Reply in English. Be polite, empathetic and professional. "
        "Use a warm but formal tone. Address the customer respectfully."
    ),
    "DE": (
        "Antworte auf Deutsch. Sei höflich, einfühlsam und professionell. "
        "Verwende die Sie-Form. Vermeide bürokratische Formulierungen."
    ),
}

# ── Válasz-generáló system prompt ─────────────────────────────
_REPLY_SYSTEM = """{COMPANY_NAME} ügyfélszolgálati asszisztense vagy.

{lang_instruction}

Fontos szabályok:
- Légy tömör: max 3-4 bekezdés
- Kezdd köszönettel a megkereséséért
- Válaszolj közvetlenül a feltett kérdésre
- Ha konkrét lépéseket kell tenni, sorold fel pontokba
- Fejezd be biztatással vagy következő lépés ajánlásával
- NE írj tárgyat, aláírást vagy "Üdvözlettel" sort – ezt a rendszer hozzáadja
- NE találj ki adatokat, amiről nem vagy biztos"""


@router.post("/classify", response_model=ClassifyResponse)
async def classify_email(req: ClassifyRequest):
    if not OPENAI_API_KEY:
        return ClassifyResponse(
            can_answer=False, confidence=0.0,
            category=EmailCategory.OTHER, reason="No API key",
            status=EmailStatus.NEEDS_ATTENTION
        )

    t_start   = time.monotonic()
    tenant_id = req.tenant_id  # may be None for external callers

    # ── agent_run start ────────────────────────────────────────
    run_id = None
    if tenant_id:
        run_id = await rq.create_run(
            tenant_id=tenant_id,
            trigger_type="email_classify",
            trigger_ref=req.email_id,
            input_summary=f"Subject: {req.subject[:80]}",
        )

    # ── Load tenant policy ─────────────────────────────────────
    policy = await get_policy(tenant_id)

    # ── Layer 1+2: Intake & Knowledge (parallel) ───────────────
    intake_ctx, knowledge_ctx = await asyncio.gather(
        intake_layer.process(req.subject, req.body or "", policy, tenant_id),
        knowledge_layer.retrieve(req.subject, req.body or "", policy, tenant_id),
    )

    # ── Learned override shortcut ──────────────────────────────
    if (
        policy.get("learning_enabled", True)
        and knowledge_ctx.forced_override
        and knowledge_ctx.forced_sim >= learning_service.EMBED_OVERRIDE_THRESHOLD
    ):
        forced  = knowledge_ctx.forced_override
        sim     = knowledge_ctx.forced_sim
        conf    = round(0.50 + sim * 0.45, 2)
        can     = forced == EmailStatus.AI_ANSWERED.value
        cat     = EmailCategory.COMPLAINT if forced == EmailStatus.NEEDS_ATTENTION.value else EmailCategory.INQUIRY
        status  = EmailStatus(forced)
        decision = AiDecision(can_answer=can, confidence=conf,
                              reason=f"learned sim={sim:.2f}", learned_override=True)
        if req.email_id:
            await q.update_email_classification(
                req.email_id, cat.value, status.value, decision.model_dump(), conf
            )
        if run_id:
            await rq.finish_run(run_id, "success",
                                latency_ms=int((time.monotonic() - t_start) * 1000),
                                result_summary=f"learned_override → {status.value} sim={sim:.2f}")
        log.info(f"Classify LEARNED: {req.subject[:40]} → {status} sim={sim:.3f}")
        return ClassifyResponse(can_answer=can, confidence=conf, category=cat,
                                reason=f"Tanult egyezés ({sim:.0%})",
                                status=status, learned_override=True)

    # ── Layer 3: Drafting ──────────────────────────────────────
    try:
        draft_result = await drafting_layer.classify(
            req.subject, req.body or "",
            knowledge_ctx, intake_ctx,
            policy, tenant_id,
        )
    except Exception as e:
        if run_id:
            await rq.finish_run(run_id, "failed",
                                latency_ms=int((time.monotonic() - t_start) * 1000),
                                error_message=str(e))
        log.error(f"Classify drafting error: {e}")
        return ClassifyResponse(
            can_answer=False, confidence=0.0, category=EmailCategory.OTHER,
            reason=str(e), status=EmailStatus.NEEDS_ATTENTION
        )

    out = draft_result.output

    # booking_intent: appointment category OR explicit flag from AI
    booking_intent = bool(out.booking_intent) or out.category == "appointment"

    # ── Layer 4: Compliance ────────────────────────────────────
    compliance = compliance_layer.evaluate(
        out, intake_ctx, req.subject, req.body or "", policy
    )

    # ── Layer 5: Action ────────────────────────────────────────
    action_result = await action_layer.execute(
        email_id=req.email_id,
        subject=req.subject,
        sender=getattr(req, "sender", "") or "",
        draft=draft_result,
        compliance=compliance,
        intake=intake_ctx,
        policy=policy,
        tenant_id=tenant_id,
    )

    # ── Finish run ─────────────────────────────────────────────
    latency_ms = int((time.monotonic() - t_start) * 1000)
    if run_id:
        case_info = f" case={action_result.case_id}" if action_result.case_linked else ""
        await rq.finish_run(
            run_id, "success",
            latency_ms=latency_ms,
            result_summary=(
                f"{compliance.status} conf={out.confidence} "
                f"urgency={out.urgency_score}{case_info}"
            ),
        )

    log.info(
        f"Classify: '{req.subject[:40]}' → {compliance.status} "
        f"conf={out.confidence} urgency={out.urgency_score} "
        f"sentiment={out.sentiment} booking={booking_intent} "
        f"domain={compliance.domain_tag} case_linked={action_result.case_linked}"
    )

    return ClassifyResponse(
        can_answer=compliance.can_answer,
        confidence=out.confidence,
        category=EmailCategory(out.category),
        reason=compliance.veto_reason or out.reason,
        status=EmailStatus(compliance.status),
        urgency_score=out.urgency_score,
        sentiment=out.sentiment,
        booking_intent=booking_intent,
    )


@router.post("/generate-reply")
async def generate_reply(req: ReplyRequest):
    if not OPENAI_API_KEY:
        from fastapi import HTTPException
        raise HTTPException(503, "No API key")

    t_start  = time.monotonic()
    lang     = req.language or detect_language(req.body or req.subject)
    lang_instr = _LANG_INSTRUCTION.get(lang, _LANG_INSTRUCTION["HU"])

    sys_prompt = _REPLY_SYSTEM.format(
        COMPANY_NAME=COMPANY_NAME,
        lang_instruction=lang_instr
    )

    try:
        reply = await openai_service.chat(
            [{"role": "system", "content": sys_prompt},
             {"role": "user",   "content": (
                 f"Kategória: {req.category.value}\n"
                 f"Tárgy: {req.subject}\n\n"
                 f"{req.body[:3000]}"
             )}],
            max_tokens=600, task_type="reply",
        )
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(500, str(e))

    latency_ms = int((time.monotonic() - t_start) * 1000)

    if req.email_id:
        await q.update_email_reply(req.email_id, reply)

    await q.insert_rag_log(
        email_id=req.email_id,
        query=f"{req.subject}\n\n{(req.body or '')[:500]}",
        answer=reply,
        fallback_used=False,
        confidence=1.0,
        source_docs=[],
        collection="email-reply",
        lang=lang,
        latency_ms=latency_ms
    )

    log.info(f"Reply generated [{lang}] {latency_ms}ms: '{req.subject[:50]}'")
    return {"reply": reply, "email_id": req.email_id, "language": lang, "latency_ms": latency_ms}
