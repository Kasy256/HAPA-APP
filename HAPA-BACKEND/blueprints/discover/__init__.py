from flask import Blueprint

bp = Blueprint("discover", __name__)

from blueprints.discover import routes  # noqa: E402,F401

