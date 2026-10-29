"""Vercel's Python entrypoint; Cloud Run imports the same Flask app directly."""

from backend.flask_gateway.app import app
