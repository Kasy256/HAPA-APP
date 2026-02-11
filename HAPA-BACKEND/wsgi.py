"""
WSGI entry point for production deployment.
This file is used by gunicorn to start the Flask application.
"""
import sys
from pathlib import Path

# Add current directory to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()
