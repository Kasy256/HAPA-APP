from __future__ import annotations

from datetime import datetime

from typing import Any, Dict, List

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from extensions import get_supabase, limiter
from models.post import create_post, post_to_dict
from blueprints.posts import bp


def _require_venue_owner():
    claims = get_jwt()
    if claims.get("role") != "venue_owner":
        return False
    return True


@bp.post("/")
@jwt_required()
@limiter.limit("30 per hour")
def create_post_route():
    if not _require_venue_owner():
        return jsonify({"error": "Forbidden"}), 403

    user_id = get_jwt_identity()
    supabase = get_supabase()

    # Find the owner's venue
    venue_resp = (
        supabase.table("venues")
        .select("*")
        .eq("owner_id", user_id)
        .limit(1)
        .execute()
    )
    venues = venue_resp.data or []
    if not venues:
        return jsonify({"error": "No venue found for this owner"}), 400
    venue = venues[0]

    data = request.get_json() or {}
    media_type = data.get("media_type")
    media_url = data.get("media_url")
    caption = data.get("caption")

    if media_type not in ("image", "video") or not media_url:
        return jsonify({"error": "media_type ('image' or 'video') and media_url are required"}), 400

    post_row: Dict[str, Any] = create_post(
        venue_id=str(venue["id"]),
        media_type=media_type,
        media_url=media_url,
        caption=caption,
    )
    insert_resp = supabase.table("posts").insert(post_row).execute()
    inserted_rows: List[Dict[str, Any]] = insert_resp.data or []
    created = inserted_rows[0] if inserted_rows else post_row

    return jsonify({"post": post_to_dict(created)}), 201


@bp.get("/venue/<venue_id>")
@jwt_required(optional=True)
def get_posts_for_venue(venue_id: str):
    supabase = get_supabase()
    now = datetime.utcnow().isoformat()
    resp = (
        supabase.table("posts")
        .select("*")
        .eq("venue_id", venue_id)
        .gt("expires_at", now)
        .order("created_at", desc=True)
        .execute()
    )
    posts = resp.data or []
    
    # Check for likes if user is logged in
    user_id = get_jwt_identity()
    if user_id:
        liked_post_ids = set()
        # Optimization: Fetch likes for these posts only? 
        # For simplicity, fetch all user's post likes or just for these posts.
        # Let's fetch for these posts.
        post_ids = [p["id"] for p in posts]
        if post_ids:
            likes_resp = (
                supabase.table("post_likes")
                .select("post_id")
                .eq("user_id", user_id)
                .in_("post_id", post_ids)
                .execute()
            )
            for row in (likes_resp.data or []):
                liked_post_ids.add(row["post_id"])
        
        for p in posts:
            p["is_liked"] = p["id"] in liked_post_ids

    return jsonify({"posts": [post_to_dict(p) for p in posts]}), 200


@bp.get("/<post_id>")
@jwt_required(optional=True)
def get_post(post_id: str):
    """Get a single post (story/vibe) by id, including basic venue info."""
    supabase = get_supabase()

    post_resp = (
        supabase.table("posts")
        .select("*")
        .eq("id", post_id)
        .limit(1)
        .execute()
    )
    posts = post_resp.data or []
    if not posts:
        return jsonify({"error": "Post not found"}), 404
    post = posts[0]

    # Check is_liked
    user_id = get_jwt_identity()
    if user_id:
        like_check = (
            supabase.table("post_likes")
            .select("post_id")
            .eq("user_id", user_id)
            .eq("post_id", post_id)
            .limit(1)
            .execute()
        )
        if like_check.data:
            post["is_liked"] = True

    venue_resp = (
        supabase.table("venues")
        .select("*")
        .eq("id", post["venue_id"])
        .limit(1)
        .execute()
    )
    venues = venue_resp.data or []
    venue_payload = None
    if venues:
        venue = venues[0]
        venue_payload = {
            "id": str(venue["id"]),
            "name": venue.get("name"),
            "type": venue.get("type"),
            "city": venue.get("city"),
            "area": venue.get("area"),
            "images": venue.get("images", []),
        }

    return jsonify({"post": post_to_dict(post), "venue": venue_payload}), 200


@bp.post("/<post_id>/like")
@jwt_required()
@limiter.limit("60 per minute")
def toggle_like_post(post_id: str):
    user_id = get_jwt_identity()
    supabase = get_supabase()

    try:
        resp = supabase.rpc(
            "toggle_post_like", 
            {"target_post_id": post_id, "target_user_id": user_id}
        ).execute()
        
        # resp.data is the new metrics json
        new_metrics = resp.data or {"likes": 0, "views": 0}
        return jsonify({"metrics": new_metrics}), 200
    except Exception as e:
        print(f"Error toggling post like: {e}")
        return jsonify({"error": "Failed to toggle like"}), 500


@bp.post("/<post_id>/view")
@jwt_required(optional=True)
@limiter.limit("60 per minute")
def track_view_post(post_id: str):
    user_id = get_jwt_identity()
    supabase = get_supabase()

    try:
        supabase.rpc(
            "track_post_view", 
            {"target_post_id": post_id, "viewer_user_id": user_id}
        ).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error tracking post view: {e}")
        return jsonify({"success": False}), 200


@bp.delete("/<post_id>")
@jwt_required()
def delete_post(post_id: str):
    print(f"Attempting to delete post: {post_id}")
    if not _require_venue_owner():
        print("Delete failed: Not a venue owner")
        return jsonify({"error": "Forbidden"}), 403

    user_id = get_jwt_identity()
    print(f"User ID: {user_id}")
    supabase = get_supabase()

    # 1. Verify ownership
    # We need to ensure the post belongs to a venue owned by this user
    # Join posts -> venues -> owner_id = user_id
    
    try:
        # First get the post to find the venue_id
        post_resp = (
            supabase.table("posts")
            .select("venue_id, venues!inner(owner_id)")
            .eq("id", post_id)
            .limit(1)
            .execute()
        )
        posts = post_resp.data or []
        print(f"Post fetch result: {posts}")
        
        if not posts:
            print("Delete failed: Post not found")
            return jsonify({"error": "Post not found"}), 404
            
        post = posts[0]
        # Check if the joined venue's owner_id matches the current user
        # Supabase outer joins might return venue as a dict
        venue_data = post.get("venues")
        print(f"Venue data: {venue_data}")
        
        # Handle case where venues might be a list (if one-to-many inferred improperly) or dict
        owner_id = None
        if isinstance(venue_data, dict):
            owner_id = venue_data.get("owner_id")
        elif isinstance(venue_data, list) and len(venue_data) > 0:
            owner_id = venue_data[0].get("owner_id")
            
        print(f"Owner ID from DB: {owner_id}, Current User: {user_id}")

        if str(owner_id) != str(user_id):
            print("Delete failed: Ownership mismatch")
            return jsonify({"error": "Unauthorized to delete this post"}), 403

        # 2. Delete the post
        print("Executing delete...")
        delete_resp = (
            supabase.table("posts")
            .delete()
            .eq("id", post_id)
            .execute()
        )
        print(f"Delete response: {delete_resp}")
        
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Delete Exception: {e}")
        return jsonify({"error": str(e)}), 500



