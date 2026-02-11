from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from extensions import get_supabase, limiter
from models.venue import create_venue, venue_to_dict
from blueprints.venues import bp


def _require_venue_owner():
    claims = get_jwt()
    if claims.get("role") != "venue_owner":
        return False
    return True


@bp.post("/")
@jwt_required()
@limiter.limit("10 per minute")
def create_venue_route():
    if not _require_venue_owner():
        return jsonify({"error": "Forbidden"}), 403

    user_id = get_jwt_identity()
    supabase = get_supabase()

    data = request.get_json() or {}
    name = data.get("name")
    venue_type = data.get("type")
    city = data.get("city")
    area = data.get("area")
    contact_phone = data.get("contact_phone")
    categories = data.get("categories") or []
    images = data.get("images") or []
    address = data.get("address")
    working_hours = data.get("working_hours")

    if not all([name, venue_type, city, area]):
        return jsonify({"error": "name, type, city, area are required"}), 400

    # Fetch user's phone number to use as contact_phone
    user_resp = supabase.table("users").select("phone_number").eq("id", user_id).limit(1).execute()
    users = user_resp.data or []
    user_doc = users[0] if users else None
    if not user_doc or not user_doc.get("phone_number"):
        return jsonify({"error": "User does not have a phone number"}), 400
    
    contact_phone = user_doc["phone_number"]

    # MVP: No automatic geocoding. 
    # Valid address string is whatever the user provided or composed.
    if address or city or area:
        if not address:
            address = f"{area}, {city}"

    venue_row: Dict[str, Any] = create_venue(
        owner_id=user_id,
        name=name,
        venue_type=venue_type,
        city=city,
        area=area,
        contact_phone=contact_phone,
        categories=categories,
        images=images,
        address=address,
        # lat=lat,
        # lng=lng,
    )
    if working_hours:
        venue_row["working_hours"] = working_hours

    insert_resp = supabase.table("venues").insert(venue_row).execute()
    inserted_rows: List[Dict[str, Any]] = insert_resp.data or []
    created = inserted_rows[0] if inserted_rows else venue_row

    return jsonify({"venue": venue_to_dict(created)}), 201


@bp.get("/me")
@jwt_required()
def get_my_venue():
    if not _require_venue_owner():
        return jsonify({"error": "Forbidden"}), 403

    user_id = get_jwt_identity()
    supabase = get_supabase()
    resp = (
        supabase.table("venues")
        .select("*")
        .eq("owner_id", user_id)
        .eq("owner_id", user_id)
        .limit(1)
        .execute()
    )

    venues = resp.data or []
    venue_doc = venues[0] if venues else None
    if not venue_doc:
        return jsonify({"venue": None}), 200

    # Calculate total post metrics (likes and views across all posts)
    posts_resp = (
        supabase.table("posts")
        .select("metrics")
        .eq("venue_id", venue_doc["id"])
        .execute()
    )
    posts = posts_resp.data or []
    
    total_likes = 0
    total_views = 0
    for post in posts:
        metrics = post.get("metrics", {})
        total_likes += metrics.get("likes", 0)
        total_views += metrics.get("views", 0)
    
    # Override venue metrics with post aggregates for dashboard display
    venue_doc["metrics"] = {
        "likes": total_likes,
        "views": total_views
    }

    return jsonify({"venue": venue_to_dict(venue_doc)}), 200


@bp.get("/<venue_id>")
def get_venue(venue_id: str):
    supabase = get_supabase()
    try:
        resp = (
            supabase.table("venues")
            .select("*")
            .eq("id", venue_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"Error fetching venue: {e}")
        return jsonify({"error": "Failed to fetch venue"}), 500
    
    venues = resp.data or []
    doc = venues[0] if venues else None
    if not doc:
        return jsonify({"error": "Venue not found"}), 404

    return jsonify({"venue": venue_to_dict(doc)}), 200


@bp.patch("/<venue_id>")
@jwt_required()
def update_venue(venue_id: str):
    if not _require_venue_owner():
        return jsonify({"error": "Forbidden"}), 403

    user_id = get_jwt_identity()
    supabase = get_supabase()

    # Ensure the venue exists and belongs to the current user
    existing_resp = (
        supabase.table("venues")
        .select("*")
        .eq("id", venue_id)
        .eq("owner_id", user_id)
        .eq("owner_id", user_id)
        .limit(1)
        .execute()
    )
    venues = existing_resp.data or []
    existing = venues[0] if venues else None
    if not existing:
        return jsonify({"error": "Venue not found or not owned by user"}), 404

    data = request.get_json() or {}
    updates = {}
    for field in ["name", "type", "city", "area", "contact_phone", "categories", "images", "address", "working_hours"]:
        if field in data:
            updates[field] = data[field]

    # MVP: No re-geocoding.
    # Just ensure address field is populated if missing
    if any(key in data for key in ["address", "city", "area"]):
        address_str = (
            updates.get("address")
            or existing.get("address")
            or f"{updates.get('area', existing.get('area'))}, {updates.get('city', existing.get('city'))}"
        )
        if not updates.get("address"):
            updates["address"] = address_str

    if not updates:
        return jsonify({"venue": venue_to_dict(existing)}), 200

    updates["updated_at"] = datetime.utcnow().isoformat()
    supabase.table("venues").update(updates).eq("id", venue_id).execute()

    refreshed = (
        supabase.table("venues")
        .select("*")
        .eq("id", venue_id)
        .eq("id", venue_id)
        .limit(1)
        .execute()
    )
    refreshed_venues = refreshed.data or []
    updated = refreshed_venues[0] if refreshed_venues else existing
    return jsonify({"venue": venue_to_dict(updated)}), 200






@bp.post("/<venue_id>/view")
@jwt_required(optional=True)
@limiter.limit("60 per minute")
def track_view(venue_id: str):
    user_id = get_jwt_identity() # None if not logged in
    supabase = get_supabase()

    try:
        supabase.rpc(
            "track_venue_view", 
            {"target_venue_id": venue_id, "viewer_user_id": user_id}
        ).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error tracking view: {e}")
        # Fail silently to client for analytics
        return jsonify({"success": False}), 200
