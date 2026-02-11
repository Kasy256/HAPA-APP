from flask import Blueprint

bp = Blueprint("locations", __name__)

from . import routes  # noqa: E402,F401

