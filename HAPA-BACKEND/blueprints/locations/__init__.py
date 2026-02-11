from flask import Blueprint

bp = Blueprint("locations", __name__)

from blueprints.locations import routes  # noqa: E402,F401

