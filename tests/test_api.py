import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from api.index import app as vercel_app
from backend.flask_gateway import app as backend_module


class ApiTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(
            os.environ,
            {"APP_ENV": "development", "VERCEL": "", "K_SERVICE": ""},
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.upload_dir = tempfile.TemporaryDirectory()
        self.previous_upload_dir = backend_module.UPLOAD_DIR
        backend_module.UPLOAD_DIR = Path(self.upload_dir.name)
        backend_module._otp_entries.clear()
        backend_module._otp_rate_limits.clear()
        self.client = backend_module.app.test_client()

    def tearDown(self):
        backend_module.UPLOAD_DIR = self.previous_upload_dir
        self.upload_dir.cleanup()

    def test_health_and_analytics_routes(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json["status"], "healthy")
        self.assertEqual(health.json["microservices"]["notifications"], "mock")

        analytics = self.client.get("/api/analytics/society/society-1")
        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(analytics.json["societyId"], "society-1")

    def test_legacy_health_contract_and_api_error_responses(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(
            health.json["service"],
            "Flask High-Speed Gate & Ingestion Microservice",
        )
        self.assertIsInstance(health.json["timestamp"], float)

        malformed = self.client.post(
            "/api/visitors/pass",
            data="{broken",
            content_type="application/json",
        )
        self.assertEqual(malformed.status_code, 400)
        self.assertIn("error", malformed.json)

        wrong_method = self.client.get("/api/otp/send")
        self.assertEqual(wrong_method.status_code, 404)
        self.assertIn("error", wrong_method.json)
        self.assertEqual(self.client.get("/api/does-not-exist").status_code, 404)

        with patch.dict(os.environ, {"APP_ENV": "production", "VERCEL": "1"}):
            production_health = self.client.get("/api/health")
        self.assertEqual(
            production_health.json["microservices"]["otp"],
            "unavailable",
        )

    def test_otp_send_verify_and_rate_limit(self):
        with patch.dict(os.environ, {"APP_ENV": "development"}):
            sent = self.client.post(
                "/api/otp/send",
                json={"contact": "Resident@example.com", "type": "email"},
            )
        self.assertEqual(sent.status_code, 200)
        code = sent.json["_devCode"]
        verified = self.client.post(
            "/api/otp/verify", json={"contact": "resident@example.com", "code": code}
        )
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.json["success"])

        for _ in range(5):
            response = self.client.post("/api/otp/send", json={"contact": "limited@example.com"})
            self.assertEqual(response.status_code, 200)
        limited = self.client.post("/api/otp/send", json={"contact": "limited@example.com"})
        self.assertEqual(limited.status_code, 429)

    def test_otp_format_attempt_limit_and_production_delivery_error(self):
        with patch.dict(os.environ, {"APP_ENV": "development"}):
            sent = self.client.post("/api/otp/send", json={"contact": "attempts@example.com"})
        self.assertEqual(sent.status_code, 200)

        malformed_code = self.client.post(
            "/api/otp/verify",
            json={"contact": "attempts@example.com", "code": "123"},
        )
        self.assertEqual(malformed_code.status_code, 400)
        self.assertIn("6 digits", malformed_code.json["error"])

        for expected_remaining in (2, 1, 0):
            invalid = self.client.post(
                "/api/otp/verify",
                json={"contact": "attempts@example.com", "code": "000000"},
            )
            self.assertEqual(invalid.status_code, 400)
            self.assertIn(str(expected_remaining), invalid.json["error"])

        exhausted = self.client.post(
            "/api/otp/verify",
            json={"contact": "attempts@example.com", "code": "000000"},
        )
        self.assertIn("Maximum verification attempts", exhausted.json["error"])

        with patch.dict(os.environ, {"APP_ENV": "production", "VERCEL": "1"}):
            production = self.client.post(
                "/api/otp/send", json={"contact": "resident@example.com"}
            )
        self.assertEqual(production.status_code, 503)
        self.assertNotIn("_devCode", production.json)

    def test_visitor_pass_is_signed_and_requires_configuration(self):
        payload = {"societyId": "s1", "unitNumber": "A-12", "visitorName": "Visitor"}
        with patch.dict(os.environ, {"GATE_PASS_SECRET": ""}):
            missing_key = self.client.post("/api/visitors/pass", json=payload)
        self.assertEqual(missing_key.status_code, 503)

        with patch.dict(os.environ, {"GATE_PASS_SECRET": "test-key"}):
            response = self.client.post("/api/visitors/pass", json=payload)
        self.assertEqual(response.status_code, 201)
        qr_data = json.loads(response.json["qrPayload"])
        self.assertEqual(qr_data["societyId"], "s1")
        self.assertEqual(len(qr_data["code"]), 4)
        self.assertEqual(len(qr_data["signature"]), 64)

    def test_versioned_visitor_pass_preserves_hmac_response_contract(self):
        payload = {"societyId": "s1", "unitNumber": "A-12", "visitorName": "Visitor"}
        with patch.dict(os.environ, {"GATE_PASS_SECRET": "test-key"}):
            response = self.client.post("/api/v1/visitors/pass", json=payload)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["passId"], f"PASS-{response.json['passCode']}")
        self.assertEqual(len(response.json["passCode"]), 6)
        self.assertIsInstance(response.json["expiresAt"], int)
        raw_payload, signature = response.json["qrSignature"].rsplit(":", 1)
        self.assertEqual(len(signature), 64)
        self.assertIn("s1:A-12:Visitor:", raw_payload)

    def test_upload_validates_type_and_serves_saved_file(self):
        rejected = self.client.post(
            "/api/upload",
            data={"file": (BytesIO(b"script"), "bad.js", "text/javascript")},
            content_type="multipart/form-data",
        )
        self.assertEqual(rejected.status_code, 400)

        too_large = self.client.post(
            "/api/upload",
            data={
                "file": (
                    BytesIO(b"x" * (backend_module.MAX_UPLOAD_BYTES + 1)),
                    "large.png",
                    "image/png",
                )
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(too_large.status_code, 413)
        self.assertIn("15 MB", too_large.json["error"])

        uploaded = self.client.post(
            "/api/upload",
            data={"file": (BytesIO(b"image-bytes"), "photo.png", "image/png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(uploaded.status_code, 200)
        fetched = self.client.get(uploaded.json["url"])
        self.assertEqual(fetched.data, b"image-bytes")
        self.assertEqual(
            fetched.headers["Cache-Control"],
            "public, max-age=604800, immutable",
        )
        fetched.close()

    def test_vercel_upload_rewrite_serves_ephemeral_file(self):
        filename = "media-test.png"
        Path(self.upload_dir.name, filename).write_bytes(b"uploaded")
        response = self.client.get(
            f"/api/index.py?__path=%2Fuploads%2F{filename}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"uploaded")
        response.close()

    def test_vercel_function_config_targets_python_entrypoint(self):
        project_root = Path(__file__).resolve().parents[1]
        config = json.loads((project_root / "vercel.json").read_text(encoding="utf-8"))
        entrypoint = project_root / "api" / "index.py"

        self.assertTrue(entrypoint.is_file())
        self.assertIs(vercel_app, backend_module.app)
        self.assertIn("api/index.py", config["functions"])
        self.assertNotIn("app.py", config["functions"])
        self.assertTrue(
            all(
                rewrite["destination"].startswith("/api/index.py?")
                for rewrite in config["rewrites"][:-1]
            )
        )

    def test_security_sla_and_notifications_keep_expected_contracts(self):
        audit = self.client.post(
            "/api/security/audit", json={"societyId": "s1", "action": "gate-entry"}
        )
        self.assertEqual(audit.status_code, 201)
        sla = self.client.post("/api/workflows/sla/check/s1")
        self.assertEqual(sla.json["societyId"], "s1")
        self.assertEqual(sla.json["escalatedCount"], 0)
        notification = self.client.post("/api/notify", json={"to": "resident@example.com"})
        self.assertEqual(notification.json["delivery"], "mock")

    def test_vercel_rewrite_dispatches_to_original_api_path(self):
        response = self.client.get("/api/index.py?__path=%2Fapi%2Fhealth")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "healthy")

    def test_cloud_run_serves_spa_routes_from_the_build_directory(self):
        previous_dist_dir = backend_module.DIST_DIR
        self.addCleanup(setattr, backend_module, "DIST_DIR", previous_dist_dir)
        with tempfile.TemporaryDirectory() as dist_dir:
            Path(dist_dir, "index.html").write_text("<main>app</main>", encoding="utf-8")
            Path(dist_dir, "asset.js").write_text("window.ready = true", encoding="utf-8")
            backend_module.DIST_DIR = Path(dist_dir)
            for path, expected in (
                ("/", b"<main>app</main>"),
                ("/resident", b"<main>app</main>"),
                ("/asset.js", b"window.ready"),
            ):
                response = self.client.get(path)
                self.assertIn(expected, response.data)
                response.close()


if __name__ == "__main__":
    unittest.main()
