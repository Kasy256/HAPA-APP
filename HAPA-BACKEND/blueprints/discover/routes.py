from __future__ import annotations

from datetime import datetime
from math import cos, radians, sqrt
from typing import Any, Dict, List

from flask import jsonify, request

from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import get_supabase, limiter
from models.post import post_to_dict
from models.venue import venue_to_dict
from blueprints.discover import bp


@bp.get("/feed")
@jwt_required(optional=True)
@limiter.limit("60 per minute")
def feed():
    """
    Discovery feed near a location.
    Query params:
      - lat, lng, radius_km (optional)
    """
    supabase = get_supabase()
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius_km = request.args.get("radius_km", default=10, type=float)

    # Fetch venues
    venues_resp = supabase.table("venues").select("*").execute()
    venues_list: List[Dict[str, Any]] = venues_resp.data or []




    # If a location is provided, filter/sort by approximate distance in Python
    if lat is not None and lng is not None:
        def haversine_approx(v: Dict[str, Any]) -> float:
            v_lat = v.get("lat")
            v_lng = v.get("lng")
            if v_lat is None or v_lng is None:
                # If venue has no location, treat as "nearby" (distance 0) so it appears in feed
                return 0.0
            # Simple equirectangular approximation for small distances
            x = (radians(v_lng) - radians(lng)) * cos(radians((v_lat + lat) / 2.0))
            y = radians(v_lat) - radians(lat)
            return sqrt(x * x + y * y)

        venues_list = sorted(venues_list, key=haversine_approx)
        # Rough filter by radius: keep first N that are within radius_km
        # 1 radian on Earth ~ 6371 km
        max_rad = radius_km / 6371.0
        venues_list = [v for v in venues_list if haversine_approx(v) <= max_rad][:50]
    else:
        venues_list = venues_list[:50]

    # Fetch posts for these venues
    venue_ids = [v["id"] for v in venues_list]
    posts_list: List[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat()
    if venue_ids:
        posts_resp = (
            supabase.table("posts")
            .select("*")
            .in_("venue_id", venue_ids)
            .gt("expires_at", now)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        posts_list = posts_resp.data or []

    return jsonify(
        {
            "venues": [venue_to_dict(v) for v in venues_list],
            "posts": [post_to_dict(p) for p in posts_list],
        }
    ), 200


@bp.get("/search")
@limiter.limit("60 per minute")
def search():
    """
    Text / city / area search.
    Query params:
      - q (search term)
      - city
      - area
    """
    supabase = get_supabase()
    q = request.args.get("q", "").strip()
    city = request.args.get("city", "").strip()
    area = request.args.get("area", "").strip()

    query = supabase.table("venues").select("*")

    if city:
        query = query.eq("city", city)
    if area:
        query = query.eq("area", area)

    if q:
        # Case-insensitive match on name OR type
        # PostgREST syntax for OR with ilike: name.ilike.%pattern%,type.ilike.%pattern%
        # IMPORTANT: We must wrap the pattern in double quotes because the query may contain commas/spaces
        # which PostgREST treats as delimiters.
        query = query.or_(f'name.ilike."%{q}%",type.ilike."%{q}%"')

    resp = query.limit(50).execute()
    venues_list = resp.data or []

    return jsonify({"venues": [venue_to_dict(v) for v in venues_list]}), 200


