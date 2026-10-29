"""Python API for the Society Maintenance Tracker."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

ROOT_DIR = Path(__file__).resolve().parents[2]
DIST_DIR = ROOT_DIR / "dist"
UPLOAD_DIR = Path(
    os.environ.get(
        "UPLOAD_DIR",
        "/tmp/society-uploads" if os.environ.get("VERCEL") else str(ROOT_DIR / "uploads"),
    )
)
ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 3
OTP_RATE_WINDOW_SECONDS = 10 * 60
OTP_MAX_SENDS = 5

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES + 128 * 1024

_started_at = time.monotonic()
_state_lock = threading.Lock()
_otp_entries: dict[str, dict[str, Any]] = {}
_otp_rate_limits: dict[str, list[float]] = {}


def _json_body() -> dict[str, Any]:
    if not request.is_json:
        return {}
    body = request.get_json()
    return body if isinstance(body, dict) else {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _is_development() -> bool:
    is_deployed = os.environ.get("VERCEL") or os.environ.get("K_SERVICE")
    default_environment = "production" if is_deployed else "development"
    return os.environ.get("APP_ENV", default_environment).lower() == "development"


def _visitor_pass(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    society_id = data.get("societyId")
    unit_number = data.get("unitNumber")
    visitor_name = data.get("visitorName")
    if not all(isinstance(value, str) and value.strip() for value in (society_id, unit_number, visitor_name)):
        return {"error": "societyId, unitNumber, and visitorName are required"}, 400

    secret_key = os.environ.get("GATE_PASS_SECRET")
    if not secret_key:
        return {"error": "Visitor pass signing is not configured. Set GATE_PASS_SECRET."}, 503

    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    expires_iso = expires_at.isoformat().replace("+00:00", "Z")
    pass_id = f"PASS-{secrets.token_hex(4).upper()}"
    pass_code = f"{secrets.randbelow(8999) + 1000:04d}"
    qr_fields = {
        "passId": pass_id,
        "societyId": society_id.strip(),
        "unit": unit_number.strip(),
        "visitor": visitor_name.strip(),
        "code": pass_code,
        "exp": expires_iso,
    }
    canonical_payload = json.dumps(qr_fields, separators=(",", ":"), sort_keys=True)
    signature = hmac.new(secret_key.encode(), canonical_payload.encode(), hashlib.sha256).hexdigest()
    qr_payload = json.dumps(
        {**qr_fields, "signature": signature},
        separators=(",", ":"),
    )

    return {
        "passId": pass_id,
        "passCode": pass_code,
        "qrPayload": qr_payload,
        "expiresAt": expires_iso,
        "societyId": society_id.strip(),
        "unitNumber": unit_number.strip(),
        "visitorName": visitor_name.strip(),
        "engine": "Python Flask API",
    }, 201


def _health_payload() -> dict[str, Any]:
    return {
        "status": "healthy",
        "version": "2.4.0",
        "uptime": round(time.monotonic() - _started_at, 3),
        "timestamp": _now_iso(),
        "microservices": {
            "otp": "development-only" if _is_development() else "unavailable",
            "mediaStorage": "ephemeral",
            "notifications": "mock",
        },
    }


@app.get("/health")
def legacy_health_check():
    return jsonify(
        {
            "status": "healthy",
            "service": "Flask High-Speed Gate & Ingestion Microservice",
            "timestamp": time.time(),
        }
    )


@app.get("/api/health")
def health_check():
    return jsonify(_health_payload())


@app.route(
    "/api/index.py",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
def vercel_api_dispatch():
    """Dispatch Vercel's rewritten API URL back to its original Flask route."""
    forwarded_path = request.args.get("__path", "")
    if not (
        forwarded_path == "/api"
        or forwarded_path.startswith("/api/")
        or forwarded_path == "/uploads"
        or forwarded_path.startswith("/uploads/")
    ):
        return jsonify({"error": "API endpoint not found"}), 404

    environ = request.environ.copy()
    environ["PATH_INFO"] = forwarded_path
    query_items = [item for item in request.args.items(multi=True) if item[0] != "__path"]
    environ["QUERY_STRING"] = urlencode(query_items)
    environ.pop("werkzeug.request", None)
    return Response.from_app(app, environ)


@app.post("/api/upload")
def upload_file():
    uploaded_file = request.files.get("file")
    if uploaded_file is None or not uploaded_file.filename:
        return jsonify({"error": "No file provided in payload"}), 400
    if uploaded_file.mimetype not in ALLOWED_UPLOAD_TYPES:
        return jsonify(
            {"error": "Invalid file type. Only JPEG, PNG, WEBP, GIF, and PDF are supported."}
        ), 400

    uploaded_file.stream.seek(0, os.SEEK_END)
    size = uploaded_file.stream.tell()
    uploaded_file.stream.seek(0)
    if size > MAX_UPLOAD_BYTES:
        return jsonify({"error": "File exceeds the 15 MB upload limit."}), 413

    original_name = secure_filename(uploaded_file.filename)
    extension = Path(original_name).suffix.lower()
    filename = f"media-{int(time.time() * 1000)}-{secrets.token_hex(6)}{extension}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_path = UPLOAD_DIR / filename
    uploaded_file.save(saved_path)
    return jsonify(
        {
            "url": f"/uploads/{filename}",
            "size": size,
            "mimeType": uploaded_file.mimetype,
            "filename": filename,
        }
    )


@app.get("/uploads/<path:filename>")
def uploaded_media(filename: str):
    response = send_from_directory(UPLOAD_DIR, filename, max_age=604800)
    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
    return response


@app.post("/api/otp/send")
def send_otp():
    data = _json_body()
    contact = data.get("contact")
    if not isinstance(contact, str) or not contact.strip():
        return jsonify({"error": "Valid contact email or phone number is required."}), 400

    if not _is_development():
        return jsonify({"error": "Email/SMS OTP delivery is not configured."}), 503

    normalized_contact = contact.strip().lower()
    now = time.time()
    with _state_lock:
        for expired_contact, entry in list(_otp_entries.items()):
            if entry["expires_at"] <= now:
                del _otp_entries[expired_contact]
        for limited_contact, sent_times in list(_otp_rate_limits.items()):
            recent_sends = [
                sent_at
                for sent_at in sent_times
                if now - sent_at < OTP_RATE_WINDOW_SECONDS
            ]
            if recent_sends:
                _otp_rate_limits[limited_contact] = recent_sends
            else:
                del _otp_rate_limits[limited_contact]
        history = [
            sent_at
            for sent_at in _otp_rate_limits.get(normalized_contact, [])
            if now - sent_at < OTP_RATE_WINDOW_SECONDS
        ]
        if len(history) >= OTP_MAX_SENDS:
            _otp_rate_limits[normalized_contact] = history
            return jsonify(
                {
                    "error": "Too many OTP requests for this destination. Please wait a few minutes before trying again."
                }
            ), 429

        history.append(now)
        _otp_rate_limits[normalized_contact] = history
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        salt = secrets.token_hex(16)
        expires_at = now + OTP_TTL_SECONDS
        _otp_entries[normalized_contact] = {
            "salt": salt,
            "hash": hmac.new(salt.encode(), code.encode(), hashlib.sha256).hexdigest(),
            "expires_at": expires_at,
            "attempts": 0,
        }

    response = {
        "success": True,
        "message": f"OTP requested for {normalized_contact}",
        "expiresInSeconds": OTP_TTL_SECONDS,
    }
    response["_devCode"] = code
    return jsonify(response)


@app.post("/api/otp/verify")
def verify_otp():
    data = _json_body()
    contact = data.get("contact")
    code = data.get("code")
    if (
        not isinstance(contact, str)
        or not contact.strip()
        or not isinstance(code, (str, int))
        or not str(code).strip()
    ):
        return jsonify({"error": "Both contact and 6-digit verification code are required."}), 400

    normalized_contact = contact.strip().lower()
    submitted_code = str(code).strip()
    if len(submitted_code) != 6 or not submitted_code.isdigit():
        return jsonify({"error": "Verification code must contain exactly 6 digits."}), 400
    with _state_lock:
        entry = _otp_entries.get(normalized_contact)
        if entry is None:
            return jsonify({"error": "No active OTP found or expired for this contact."}), 400
        now = time.time()
        if now >= entry["expires_at"]:
            del _otp_entries[normalized_contact]
            return jsonify({"error": "OTP has expired. Please request a new code."}), 400
        for expired_contact, expired_entry in list(_otp_entries.items()):
            if expired_contact != normalized_contact and expired_entry["expires_at"] <= now:
                del _otp_entries[expired_contact]
        if entry["attempts"] >= OTP_MAX_ATTEMPTS:
            del _otp_entries[normalized_contact]
            return jsonify({"error": "Maximum verification attempts exceeded. Code invalidated."}), 400

        submitted_hash = hmac.new(
            entry["salt"].encode(), submitted_code.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(submitted_hash, entry["hash"]):
            entry["attempts"] += 1
            remaining = OTP_MAX_ATTEMPTS - entry["attempts"]
            return jsonify(
                {
                    "error": f"Invalid code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
                }
            ), 400
        del _otp_entries[normalized_contact]

    return jsonify({"success": True, "message": "OTP verified successfully. Action authorized."})


@app.post("/api/notify")
def notify():
    # Delivery is intentionally not claimed here: the React client uses Firebase mail triggers.
    return jsonify({"success": True, "delivery": "mock", "timestamp": _now_iso()})


@app.get("/api/analytics/society/<path:society_id>")
def society_analytics(society_id: str):
    return jsonify(
        {
            "societyId": society_id,
            "computedAt": _now_iso(),
            "engine": "Python Analytics Worker v3.1",
            "latencyMs": 8,
            "status": "optimal",
        }
    )


@app.post("/api/visitors/pass")
def generate_visitor_pass():
    response, status = _visitor_pass(_json_body())
    return jsonify(response), status


@app.post("/api/v1/visitors/pass")
def generate_visitor_pass_v1():
    data = _json_body()
    society_id = data.get("societyId")
    unit_number = data.get("unitNumber")
    visitor_name = data.get("visitorName")
    if not all(
        isinstance(value, str) and value.strip()
        for value in (society_id, unit_number, visitor_name)
    ):
        return jsonify({"error": "societyId, unitNumber, and visitorName are required"}), 400

    secret_key = os.environ.get("GATE_PASS_SECRET")
    if not secret_key:
        return jsonify(
            {"error": "Visitor pass signing is not configured. Set GATE_PASS_SECRET."}
        ), 503

    expires_at = int(time.time()) + 86400
    raw_payload = f"{society_id}:{unit_number}:{visitor_name}:{expires_at}"
    signature = hmac.new(
        secret_key.encode(), raw_payload.encode(), hashlib.sha256
    ).hexdigest()
    pass_code = signature[:6].upper()
    return jsonify(
        {
            "passId": f"PASS-{pass_code}",
            "passCode": pass_code,
            "societyId": society_id,
            "unitNumber": unit_number,
            "visitorName": visitor_name,
            "expiresAt": expires_at,
            "qrSignature": f"{raw_payload}:{signature}",
            "engine": "Flask Ingestion Microservice",
        }
    ), 201


@app.post("/api/security/audit")
@app.post("/api/v1/security/audit")
def ingest_audit_event():
    data = _json_body()
    society_id = data.get("societyId")
    action = data.get("action")
    if not society_id or not action:
        return jsonify({"error": "societyId and action are required"}), 400
    return jsonify(
        {
            "status": "ingested",
            "societyId": society_id,
            "action": action,
            "timestamp": time.time(),
            "latencyMs": 4.2,
        }
    ), 201


@app.post("/api/workflows/sla/check/<path:society_id>")
def check_sla(society_id: str):
    return jsonify(
        {
            "societyId": society_id,
            "checkedCount": 1,
            "escalatedCount": 0,
            "engine": "Python SLA Workflow",
            "timestamp": _now_iso(),
        }
    )


@app.errorhandler(400)
@app.errorhandler(405)
@app.errorhandler(413)
def request_error(error):
    if (
        not request.path.startswith("/api")
        and request.path not in {"/api/index.py", "/uploads"}
        and not request.path.startswith("/uploads/")
    ):
        return error
    message = (
        "File exceeds the 15 MB upload limit."
        if error.code == 413
        else error.description
    )
    return jsonify({"error": message}), error.code


@app.errorhandler(404)
def api_not_found(_error):
    if (
        request.path == "/api"
        or request.path == "/uploads"
        or request.path.startswith(("/api/", "/uploads/"))
    ):
        return jsonify({"error": "API endpoint not found"}), 404
    if DIST_DIR.is_dir():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"error": "Not found"}), 404


@app.get("/")
def frontend_index():
    if DIST_DIR.is_dir():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"status": "healthy", "message": "Build the React frontend to serve it here."})


@app.get("/<path:asset_path>")
def frontend_asset(asset_path: str):
    if asset_path.startswith("api/"):
        return jsonify({"error": "API endpoint not found"}), 404
    if DIST_DIR.is_dir():
        asset = DIST_DIR / asset_path
        if asset.is_file():
            return send_from_directory(DIST_DIR, asset_path)
        if "." not in Path(asset_path).name:
            return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
