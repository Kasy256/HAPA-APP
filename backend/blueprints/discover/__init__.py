from flask import Blueprint

bp = Blueprint("discover", __name__)

from . import routes  # noqa: E402,F401

