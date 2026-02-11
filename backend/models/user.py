from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def normalize_phone(phone: str) -> str:
    """Very basic phone normalization. In production, use a proper library like `phonenumbers`."""
    phone = phone.strip()
    if phone.startswith("0"):
        # Example heuristic for UG numbers: replace leading 0 with +256
        return "+256" + phone[1:]
    return phone


def user_to_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map a Supabase `users` row to the public API payload.
    Expects `id`, `phone_number`, `role`, `status`, `created_at`, `last_login_at`.
    """
    return {
        "id": str(doc.get("id")),
        "role": doc.get("role"),
        "phone_number": doc.get("phone_number"),
        "status": doc.get("status", "active"),
        "created_at": doc.get("created_at"),
        "last_login_at": doc.get("last_login_at"),
    }


def create_user(phone_number: str | None = None, role: str = "venue_owner") -> Dict[str, Any]:
    """
    Build a new user row for insertion into Supabase.
    We let Supabase generate the primary key. Timestamps are stored as ISO strings
    so the Supabase client can JSON-encode the payload.
    """
    now = datetime.now(timezone.utc)
    return {
        "role": role,
        "phone_number": phone_number,
        "status": "active",
        "created_at": now.isoformat(),
        "last_login_at": now.isoformat(),
    }


