from __future__ import annotations

from typing import Any, Dict, List

from flask import jsonify, request

from services.maps import GoogleMapsClient
from extensions import get_supabase
from blueprints.locations import bp


@bp.get("/suggest")
def suggest_locations():
    """
    Lightweight location suggestions for city/area/search inputs.
    Uses Google Places Text Search under the hood.
    Query params:
      - q: free text input
      - lat, lng (optional): for biasing results near the user
    """
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"suggestions": []}), 200

    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)

    maps_client = GoogleMapsClient()
    suggestions = maps_client.search_places(q, lat=lat, lng=lng, limit=5)

    return jsonify({"suggestions": suggestions}), 200

