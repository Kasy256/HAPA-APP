import os
from pathlib import Path

from dotenv import load_dotenv

# Ensure backend/.env is loaded before reading environment variables
base_dir = Path(__file__).resolve().parent
load_dotenv(base_dir / ".env")


class Config:
    """Base configuration."""

    DEBUG = False
    TESTING = False

    # Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
    JWT_REFRESH_TOKEN_EXPIRES_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "30"))

    # Google Maps
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    # Rate limiting
    RATELIMIT_DEFAULT = "100 per minute"
    RATELIMIT_STORAGE_URL = os.getenv("RATELIMIT_STORAGE_URL", "memory://")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}


def get_config() -> type[Config]:
    env = os.getenv("FLASK_ENV", "development").lower()
    return config_by_name.get(env, DevelopmentConfig)

