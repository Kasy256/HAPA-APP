from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify

from .config import get_config
from .extensions import init_cors, init_jwt, init_rate_limiter, init_supabase
from .blueprints.auth import bp as auth_bp
from .blueprints.venues import bp as venues_bp
from .blueprints.posts import bp as posts_bp
from .blueprints.discover import bp as discover_bp
from .blueprints.locations import bp as locations_bp


def create_app() -> Flask:
    # Load backend/.env so GOOGLE_MAPS_API_KEY and other settings are available
    base_dir = Path(__file__).resolve().parent
    load_dotenv(base_dir / ".env")

    app = Flask(__name__)
    app_config = get_config()
    app.config.from_object(app_config)

    # Extensions
    init_supabase(app)
    init_jwt(app)
    init_cors(app)
    init_rate_limiter(app)

    # Blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(venues_bp, url_prefix="/api/venues")
    app.register_blueprint(posts_bp, url_prefix="/api/posts")
    app.register_blueprint(discover_bp, url_prefix="/api/discover")
    app.register_blueprint(locations_bp, url_prefix="/api/locations")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000)

