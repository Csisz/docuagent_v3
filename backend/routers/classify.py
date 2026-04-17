"""
Email osztĂˇlyozĂˇs Ă©s vĂˇlaszgenerĂˇlĂˇs.

v3.4 vĂˇltozĂˇsok:
  - Feedback tenant isolation: get_feedback_context() kap tenant_id-t
  - agent_runs: minden classify Ă©s reply_generate fut loggolva
  - tenant_id a ClassifyRequest.tenant_id mezĹ‘bĹ‘l jĂ¶n (ingest pipeline ĂˇllĂ­tja be)

v3.3 vĂˇltozĂˇsok:
  - Email-specifikus prompt optimalizĂˇlĂˇs: ĂĽgyfĂ©lszolgĂˇlati kontextus,
    pontosabb kategĂłriĂˇk, hangnem szabĂˇlyok
  - generate_reply logol a rag_logs tĂˇblĂˇba (latency, lang, confidence)
  - Fallback logika: ha alacsony confidence â†’ NEEDS_ATTENTION marad,
    nem generĂˇl gyenge vĂˇlaszt

v3.16 (Phase 4 Part 2):
  - 5-rĂ©tegĹ± agent architektĂşra: Intake â†’ Knowledge â†’ Drafting â†’ Compliance â†’ Action
  - asyncio.gather: intake + knowledge pĂˇrhuzamosan fut
  - Policy engine: BASE_POLICY + DB tenant overrides
  - Backward-compatible response shape megĹ‘rzve
"""
import asyncio
import time
import logging
from fastapi import APIRouter, HTTPException
from services import openai_service, learning_service
from services.file_service import detect_language
from services.policy_engine import get_policy
from services.metering import check_quota, increment_usage
import db.queries as q
import db.run_queries as rq
from models.schemas import (
    ClassifyRequest, ClassifyResponse, ReplyRequest,
    EmailCategory, EmailStatus, AiDecision
)
from core.config import OPENAI_API_KEY, CONF_THRESHOLD, COMPANY_NAME

# â”€â”€ Agent layers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import agents.intake as intake_layer
import agents.knowledge as knowledge_layer
import agents.drafting as drafting_layer
import agents.compliance as compliance_layer
import agents.action as action_layer

router = APIRouter(prefix="/api", tags=["AI"])
log    = logging.getLogger("docuagent")

# â”€â”€ Nyelv â†’ hangnem utasĂ­tĂˇs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_LANG_INSTRUCTION = {
    "HU": (
        "VĂˇlaszolj magyarul. Legyen udvarias, empatikus Ă©s szakmai az ĂĽzenet. "
        "SzĂłlĂ­tsd meg az ĂĽgyfelet tegezĹ‘ helyett magĂˇzva. "
        "KerĂĽld a tĂşl formĂˇlis vagy bĂĽrokratikus fogalmazĂˇst."
    ),
    "EN": (
        "Reply in English. Be polite, empathetic and professional. "
        "Use a warm but formal tone. Address the customer respectfully."
    ),
    "DE": (
        "Antworte auf Deutsch. Sei hĂ¶flich, einfĂĽhlsam und professionell. "
        "Verwende die Sie-Form. Vermeide bĂĽrokratische Formulierungen."
    ),
}

# â”€â”€ VĂˇlasz-generĂˇlĂł system prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_REPLY_SYSTEM = """{COMPANY_NAME} ĂĽgyfĂ©lszolgĂˇlati asszisztense vagy.

{lang_instruction}

Fontos szabĂˇlyok:
- LĂ©gy tĂ¶mĂ¶r: max 3-4 bekezdĂ©s
- Kezdd kĂ¶szĂ¶nettel a megkeresĂ©sĂ©Ă©rt
- VĂˇlaszolj kĂ¶zvetlenĂĽl a feltett kĂ©rdĂ©sre
- Ha konkrĂ©t lĂ©pĂ©seket kell tenni, sorold fel pontokba
- Fejezd be biztatĂˇssal vagy kĂ¶vetkezĹ‘ lĂ©pĂ©s ajĂˇnlĂˇsĂˇval
- NE Ă­rj tĂˇrgyat, alĂˇĂ­rĂˇst vagy "ĂśdvĂ¶zlettel" sort â€“ ezt a rendszer hozzĂˇadja
- NE talĂˇlj ki adatokat, amirĹ‘l nem vagy biztos"""


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

    # â”€â”€ Quota check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if tenant_id:
        allowed, remaining = await check_quota(tenant_id, "emails")
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Havi email kvĂłta elĂ©rve. KĂ©rjĂĽk lĂ©pjen magasabb csomagra.",
            )

    # â”€â”€ agent_run start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    run_id = None
    if tenant_id:
        run_id = await rq.create_run(
            tenant_id=tenant_id,
            trigger_type="email_classify",
            trigger_ref=req.email_id,
            input_summary=f"Subject: {req.subject[:80]}",
        )

    # â”€â”€ Load tenant policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    policy = await get_policy(tenant_id)

    # â”€â”€ Layer 1+2: Intake & Knowledge (parallel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    intake_ctx, knowledge_ctx = await asyncio.gather(
        intake_layer.process(req.subject, req.body or "", policy, tenant_id),
        knowledge_layer.retrieve(req.subject, req.body or "", policy, tenant_id),
    )

    # â”€â”€ Learned override shortcut â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                                result_summary=f"learned_override â†’ {status.value} sim={sim:.2f}")
        log.info(f"Classify LEARNED: {req.subject[:40]} â†’ {status} sim={sim:.3f}")
        return ClassifyResponse(can_answer=can, confidence=conf, category=cat,
                                reason=f"Tanult egyezĂ©s ({sim:.0%})",
                                status=status, learned_override=True)

    # â”€â”€ Layer 3: Drafting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    # â”€â”€ Layer 4: Compliance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    compliance = compliance_layer.evaluate(
        out, intake_ctx, req.subject, req.body or "", policy
    )

    # â”€â”€ Layer 5: Action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    # â”€â”€ Usage metering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if tenant_id:
        await increment_usage(tenant_id, "emails_processed")

    # â”€â”€ Finish run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        f"Classify: '{req.subject[:40]}' â†’ {compliance.status} "
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

    # RAG keresés a tenant dokumentumaiban
    tenant_id = getattr(req, "tenant_id", None)
    rag_results = []
    rag_context = ""
    try:
        from services import qdrant_service
        rag_results = await qdrant_service.search_multi(
            f"{req.subject} {(req.body or "")[:500]}",
            tenant_id=tenant_id,
            limit_per=3,
            score_threshold=0.35
        )
        if rag_results:
            rag_context = "\n\nRelevant knowledge base context:\n" + "\n---\n".join(
                f"[{r["filename"]}]: {r["text"]}" for r in rag_results[:4]
            )
    except Exception as e:
        log.warning(f"RAG search failed: {e}")

    try:
        reply = await openai_service.chat(
            [{"role": "system", "content": sys_prompt + rag_context},
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
    source_docs = [{"filename": r["filename"], "score": r["score"], "collection": r["collection"]} for r in rag_results]
    return {"reply": reply, "email_id": req.email_id, "language": lang, "latency_ms": latency_ms, "sources": source_docs}


