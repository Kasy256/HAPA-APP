"""
WSGI entry point for production deployment.
This file is used by gunicorn to start the Flask application.
"""
import sys
from pathlib import Path

# Add parent directory to Python path so 'backend' package can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()
