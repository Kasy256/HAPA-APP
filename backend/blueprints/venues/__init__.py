from flask import Blueprint

bp = Blueprint("venues", __name__)

from . import routes  # noqa: E402,F401

