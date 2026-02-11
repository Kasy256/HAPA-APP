from datetime import datetime, timezone
import os

from flask import jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from extensions import get_supabase, limiter
from models.otp_code import create_otp
from models.user import create_user, normalize_phone, user_to_dict
from services.sms import generate_otp_code, send_otp
from blueprints.auth import bp


@bp.post("/request-otp")
@limiter.limit("5 per minute")
def request_otp():
    data = request.get_json() or {}
    phone = data.get("phone_number")
    if not phone:
        return jsonify({"error": "phone_number is required"}), 400

    phone = normalize_phone(phone)
    supabase = get_supabase()

    code = generate_otp_code()
    otp_row = create_otp(phone_number=phone, code=code, purpose="login")
    supabase.table("otp_codes").insert(otp_row).execute()

    send_otp(phone, code)
    
    # In development mode (log provider), return the code in the response 
    # so the frontend can display it in a popup for convenience.
    response_data = {"success": True}
    if os.getenv("SMS_PROVIDER", "log").lower() == "log":
        response_data["otp"] = code

    return jsonify(response_data), 200


@bp.post("/verify-otp")
@limiter.limit("10 per minute")
def verify_otp():
    data = request.get_json() or {}
    phone = data.get("phone_number")
    code = data.get("code")

    if not phone or not code:
        return jsonify({"error": "phone_number and code are required"}), 400

    phone = normalize_phone(phone)
    supabase = get_supabase()

    # Find latest matching OTP for this phone/code
    otp_resp = (
        supabase.table("otp_codes")
        .select("*")
        .eq("phone_number", phone)
        .eq("code", code)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    otp_rows = otp_resp.data or []
    if not otp_rows:
        return jsonify({"error": "Invalid or expired code"}), 400

    otp_doc = otp_rows[0]

    # Check expiry
    expires_at = otp_doc.get("expires_at")
    if expires_at is not None:
        now = datetime.now(timezone.utc)
        # Supabase returns ISO timestamps; let Python parse via fromisoformat if needed
        if isinstance(expires_at, str):
            try:
                expires_at_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except ValueError:
                expires_at_dt = None
        else:
            expires_at_dt = expires_at

        if expires_at_dt and expires_at_dt < now:
            return jsonify({"error": "Invalid or expired code"}), 400

    # Increment attempts
    supabase.table("otp_codes").update(
        {"attempts": (otp_doc.get("attempts", 0) + 1)}
    ).eq("id", otp_doc["id"]).execute()

    # Find or create user
    user_resp = (
        supabase.table("users")
        .select("*")
        .eq("phone_number", phone)
        .eq("phone_number", phone)
        .limit(1)
        .execute()
    )

    # Some versions of the Supabase client may return None on error;
    # be defensive and treat that as "no user found".
    users = user_resp.data or []
    user_doc = users[0] if users else None

    if not user_doc:
        new_user = create_user(phone_number=phone)
        insert_resp = supabase.table("users").insert(new_user).execute()
        inserted_rows = getattr(insert_resp, "data", None) or []
        user_doc = inserted_rows[0] if inserted_rows else new_user
    else:
        supabase.table("users").update(
            {"last_login_at": datetime.utcnow().isoformat()}
        ).eq("id", user_doc["id"]).execute()

    user_id = str(user_doc["id"])
    claims = {"role": user_doc.get("role", "venue_owner")}

    access_token = create_access_token(identity=user_id, additional_claims=claims)
    refresh_token = create_refresh_token(identity=user_id, additional_claims=claims)

    user_payload = user_to_dict(user_doc)

    return (
        jsonify(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": user_payload,
            }
        ),
        200,
    )


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role", "venue_owner")
    new_access = create_access_token(identity=identity, additional_claims={"role": role})
    return jsonify({"access_token": new_access}), 200


@bp.get("/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    supabase = get_supabase()
    resp = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    users = resp.data or []
    user_doc = users[0] if users else None

    if not user_doc:
        return jsonify({"error": "User not found"}), 404

    return jsonify({"user": user_to_dict(user_doc)}), 200


@bp.post("/login-supabase")
@limiter.limit("20 per minute")
def login_supabase():
    """
    Exchange a Supabase Access Token for a Flask JWT.
    Used for Anonymous Auth (and potentially other Supabase auth methods).
    """
    data = request.get_json() or {}
    access_token = data.get("access_token")

    if not access_token:
        return jsonify({"error": "access_token is required"}), 400

    supabase = get_supabase()

    # 1. Verify the token with Supabase Auth
    try:
        user_resp = supabase.auth.get_user(access_token)
        sb_user = user_resp.user
        if not sb_user:
             return jsonify({"error": "Invalid Supabase token"}), 401
    except Exception as e:
        print(f"Supabase auth check failed: {e}")
        return jsonify({"error": "Invalid Supabase token"}), 401
    
    user_id = sb_user.id
    is_anon = sb_user.is_anonymous

    # 2. Check if user exists in public.users
    #    We use the SAME ID as Supabase Auth (sb_user.id)
    resp = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    existing_users = resp.data or []
    
    if existing_users:
        user_doc = existing_users[0]
        # Update last login
        supabase.table("users").update(
            {"last_login_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", user_id).execute()
    else:
        # 3. Create user in public.users if not exists
        role = "anonymous" if is_anon else "authenticated"
        # For anonymous users, we might not have a phone number.
        phone = sb_user.phone or None 
        
        new_user = create_user(phone_number=phone, role=role)
        # FORCE the ID to match Supabase Auth ID
        new_user["id"] = user_id
        
        insert_resp = supabase.table("users").insert(new_user).execute()
        inserted_rows = getattr(insert_resp, "data", None) or []
        user_doc = inserted_rows[0] if inserted_rows else new_user

    # 4. Issue Flask JWTs
    claims = {"role": user_doc.get("role", "anonymous")}
    
    flask_access_token = create_access_token(identity=user_id, additional_claims=claims)
    flask_refresh_token = create_refresh_token(identity=user_id, additional_claims=claims)
    
    return jsonify({
        "access_token": flask_access_token,
        "refresh_token": flask_refresh_token,
        "user": user_to_dict(user_doc)
    }), 200

