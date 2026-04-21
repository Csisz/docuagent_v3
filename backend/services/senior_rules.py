"""
Senior approval keyword rule engine.

Called during email classification to flag emails that require
a senior agent or admin to manually approve before sending.
"""
from typing import Optional

_SENIOR_TRIGGERS: list[tuple[list[str], str]] = [
    # Legal / compliance
    (["felmondás", "felmondani", "jogi lépés", "bírság", "peres eljárás",
      "kártérítés", "kárigény", "fellebbezés", "panasz hatóság",
      "fogyasztóvédelmi hatóság", "lawsuit", "legal action", "compensation",
      "attorney", "court"], "legal"),

    # Financial escalation (large amounts)
    (["millió forint", "millió ft", "millió huf", "millió eur",
      "10 millió", "50 millió", "100 millió",
      "million", "m huf", "m eur"], "large_amount"),

    # Executive escalation
    (["ügyvezető", "vezérigazgató", "tulajdonos", "igazgató",
      "ceo", "managing director", "board"], "executive"),

    # Fraud / security
    (["csalás", "visszaélés", "adatlopás", "fraud", "hack",
      "security breach", "identity theft"], "security"),

    # Threat / negative PR
    (["sajtó", "média", "nyilvánosság", "közösségi média",
      "press", "media exposure", "public"], "pr_risk"),
]


def check_senior_required(
    subject: str,
    body: str,
    policy: dict,
) -> tuple[bool, Optional[str]]:
    """
    Returns (senior_required, reason_keyword).
    Respects policy key 'senior_keywords_enabled' (default True).
    """
    if not policy.get("senior_keywords_enabled", True):
        return False, None

    text = f"{subject} {body or ''}".lower()

    for keywords, reason in _SENIOR_TRIGGERS:
        for kw in keywords:
            if kw.lower() in text:
                return True, reason

    return False, None
