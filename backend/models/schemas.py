"""
Pydantic adatmodellek.

v3.2 vĂˇltozĂˇs: az ai_decision JSONB mezĹ‘ mostantĂłl tĂ­pusos
AiDecision modellel van kezelve, nem nyers dict-tel.
Az email stĂˇtuszok Ă©s kategĂłriĂˇk enum-kĂ©nt vannak definiĂˇlva,
Ă­gy a frontend nem tud Ă©rvĂ©nytelen Ă©rtĂ©ket kĂĽldeni.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


# â”€â”€ EnumerĂˇciĂłk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class EmailStatus(str, Enum):
    NEW              = "NEW"
    AI_ANSWERED      = "AI_ANSWERED"
    NEEDS_ATTENTION  = "NEEDS_ATTENTION"
    CLOSED           = "CLOSED"


class EmailCategory(str, Enum):
    COMPLAINT   = "complaint"
    INQUIRY     = "inquiry"
    APPOINTMENT = "appointment"
    OTHER       = "other"


# â”€â”€ AI dĂ¶ntĂ©s (tipizĂˇlt JSONB) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class AiDecision(BaseModel):
    """Az ai_decision JSONB mezĹ‘ tĂ­pusos reprezentĂˇciĂłja."""
    can_answer:       bool
    confidence:       float = Field(ge=0.0, le=1.0)
    reason:           str   = ""
    learned_override: bool  = False
    urgency_score:    int   = Field(default=0, ge=0, le=100)
    sentiment:        str   = "neutral"   # positive | neutral | negative | angry


# â”€â”€ Request modellek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ClassifyRequest(BaseModel):
    email_id:  Optional[str] = None
    subject:   str
    body:      str
    sender:    Optional[str] = ""
    tenant_id: Optional[str] = None   # internal: set by ingest pipeline, not exposed to external callers

    @field_validator("subject", "body")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Nem lehet ĂĽres")
        return v


class ReplyRequest(BaseModel):
    tenant_id: Optional[str] = None
    email_id: Optional[str]          = None
    subject:  str
    body:     str
    category: EmailCategory          = EmailCategory.OTHER
    language: Optional[str]          = None   # ha None â†’ auto-detect


class FeedbackRequest(BaseModel):
    email_id:            str
    original_ai_decision: str
    new_status:          EmailStatus
    note:                Optional[str] = ""


class StatusUpdateRequest(BaseModel):
    status: EmailStatus
    note:   Optional[str] = ""


class RagRequest(BaseModel):
    query: str

    @field_validator("query")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("A keresĂ©si kifejezĂ©s nem lehet ĂĽres")
        return v


# â”€â”€ Response modellek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ClassifyResponse(BaseModel):
    can_answer:       bool
    confidence:       float
    category:         EmailCategory
    reason:           str
    status:           EmailStatus
    learned_override: bool = False
    urgency_score:    int  = 0       # 0â€“100, AI Ăˇltal becsĂĽlt sĂĽrgĹ‘ssĂ©g
    sentiment:        str  = "neutral"  # positive | neutral | negative | angry
    booking_intent:   bool = False   # idĹ‘pont-foglalĂˇsi szĂˇndĂ©k jelzĹ‘je


# â”€â”€ RAG request bĹ‘vĂ­tĂ©s (v3.3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class RagQueryRequest(BaseModel):
    """BĹ‘vĂ­tett RAG kĂ©rĂ©s email_id-vel Ă©s nyelvi beĂˇllĂ­tĂˇssal."""
    query:    str
    email_id: Optional[str] = None
    language: Optional[str] = None   # HU / EN / DE, ha None â†’ auto-detect

    @field_validator("query")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("A keresĂ©si kifejezĂ©s nem lehet ĂĽres")
        return v


class SourceDoc(BaseModel):
    """Egy talĂˇlat forrĂˇs-dokumentum adatai."""
    filename:   str
    score:      float
    collection: str


class RagResponse(BaseModel):
    """RAG vĂ©gpont tipizĂˇlt vĂˇlasza."""
    found:      bool
    answer:     Optional[str]
    fallback:   bool = False
    confidence: float = 0.0
    sources:    list[SourceDoc] = []
    latency_ms: int = 0


# â”€â”€ Auth / Tenant sĂ©mĂˇk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "free"

class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None
    role: str = "agent"

class UserResponse(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    tenant: TenantResponse

