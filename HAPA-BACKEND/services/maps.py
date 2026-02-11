from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import requests

GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_PLACES_TEXT_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"

logger = logging.getLogger(__name__)


class GoogleMapsClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_MAPS_API_KEY", "")

    def geocode_address(self, address: str) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None

        params = {
            "address": address,
            "key": self.api_key,
        }
        resp = requests.get(GOOGLE_GEOCODE_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "OK" or not data.get("results"):
            return None
        result = data["results"][0]
        loc = result["geometry"]["location"]
        return {
            "lat": loc["lat"],
            "lng": loc["lng"],
            "formatted_address": result.get("formatted_address"),
        }

    def search_places(
        self,
        query: str,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Basic place search for suggestions / discovery.
        Uses Google Places Text Search.
        """
        if not self.api_key:
            logger.warning("GoogleMapsClient.search_places called without API key configured.")
            return []

        params: Dict[str, Any] = {
            "query": query,
            "key": self.api_key,
        }
        if lat is not None and lng is not None:
            params["location"] = f"{lat},{lng}"
            params["radius"] = 5000

        try:
            resp = requests.get(GOOGLE_PLACES_TEXT_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # network / HTTP errors
            logger.warning("Error calling Google Places Text Search: %s", exc)
            return []

        status = data.get("status")
        if status != "OK" or not data.get("results"):
            logger.warning(
                "Google Places Text Search returned non-OK status %s. error_message=%s",
                status,
                data.get("error_message"),
            )
            return []

        suggestions: List[Dict[str, Any]] = []
        for item in data.get("results", [])[:limit]:
            loc = item.get("geometry", {}).get("location", {})
            suggestions.append(
                {
                    "id": item.get("place_id"),
                    "name": item.get("name"),
                    "address": item.get("formatted_address"),
                    "lat": loc.get("lat"),
                    "lng": loc.get("lng"),
                }
            )

        return suggestions

