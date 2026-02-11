from flask import Blueprint

bp = Blueprint("auth", __name__)

from blueprints.auth import routes  # noqa: E402,F401

