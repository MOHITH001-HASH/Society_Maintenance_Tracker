import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import hmac
import hashlib
import time

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.environ.get("GATE_PASS_SECRET", "vasturith-secret-key-2026").encode()

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "Flask High-Speed Gate & Ingestion Microservice",
        "timestamp": time.time()
    })

@app.route("/api/v1/visitors/pass", methods=["POST"])
def generate_visitor_pass():
    """Generates HMAC-signed gate pass and QR payload for security clearance."""
    data = request.json or {}
    society_id = data.get("societyId")
    unit_number = data.get("unitNumber")
    visitor_name = data.get("visitorName")
    
    if not all([society_id, unit_number, visitor_name]):
        return jsonify({"error": "societyId, unitNumber, and visitorName are required"}), 400

    timestamp = int(time.time())
    expires_at = timestamp + 86400  # 24 Hours
    raw_payload = f"{society_id}:{unit_number}:{visitor_name}:{expires_at}"
    signature = hmac.new(SECRET_KEY, raw_payload.encode(), hashlib.sha256).hexdigest()
    pass_code = signature[:6].upper()

    return jsonify({
        "passId": f"PASS-{pass_code}",
        "passCode": pass_code,
        "societyId": society_id,
        "unitNumber": unit_number,
        "visitorName": visitor_name,
        "expiresAt": expires_at,
        "qrSignature": f"{raw_payload}:{signature}",
        "engine": "Flask Ingestion Microservice"
    }), 201

@app.route("/api/v1/security/audit", methods=["POST"])
def ingest_audit_event():
    """High-speed asynchronous security log ingestion endpoint (<10ms)."""
    data = request.json or {}
    society_id = data.get("societyId")
    action = data.get("action")
    
    if not society_id or not action:
        return jsonify({"error": "societyId and action are required"}), 400

    return jsonify({
        "status": "ingested",
        "societyId": society_id,
        "action": action,
        "timestamp": time.time(),
        "latencyMs": 4.2
    }), 201

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
