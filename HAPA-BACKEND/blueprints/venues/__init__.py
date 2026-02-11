from flask import Blueprint

bp = Blueprint("venues", __name__)

from blueprints.venues import routes  # noqa: E402,F401

