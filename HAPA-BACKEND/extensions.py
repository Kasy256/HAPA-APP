from datetime import timedelta

from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from supabase import Client, create_client

jwt = JWTManager()
cors = CORS()
limiter = Limiter(key_func=get_remote_address, default_limits=[])
supabase_client: Client | None = None


def init_supabase(app) -> None:
    """
    Initialize the Supabase client.

    Uses the SUPABASE_URL and SUPABASE_SERVICE_KEY values from app config.
    """
    global supabase_client
    url = app.config.get("SUPABASE_URL")
    key = app.config.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured")
    supabase_client = create_client(url, key)


def get_supabase() -> Client:
    """Return the global Supabase client instance."""
    if supabase_client is None:
        raise RuntimeError("Supabase client not initialized. Call init_supabase(app) first.")
    return supabase_client


def init_jwt(app) -> None:
    access_minutes = app.config["JWT_ACCESS_TOKEN_EXPIRES_MINUTES"]
    refresh_days = app.config["JWT_REFRESH_TOKEN_EXPIRES_DAYS"]

    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=access_minutes)
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=refresh_days)

    jwt.init_app(app)


def init_cors(app) -> None:
    origins = app.config["CORS_ORIGINS"]
    cors.init_app(app, resources={r"/api/*": {"origins": origins}})


def init_rate_limiter(app) -> None:
    # Apply default rate limit from config if provided
    default_limit = app.config.get("RATELIMIT_DEFAULT")
    if default_limit:
        limiter.default_limits = [default_limit]
    limiter.init_app(app)

