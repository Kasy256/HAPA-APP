from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict


def create_otp(phone_number: str, code: str, purpose: str = "login", ttl_minutes: int = 5) -> Dict[str, Any]:
    """
    Build a new OTP row for insertion into Supabase.
    We let Supabase generate the primary key.
    """
    # Use ISO 8601 strings so the Supabase client can JSON-encode the payload.
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)
    return {
        "phone_number": phone_number,
        "code": code,
        "purpose": purpose,
        "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    }


