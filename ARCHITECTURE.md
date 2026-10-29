# Society Maintenance Tracker Architecture

## Runtime topology

```text
Browser
  ├─ React/Vite static frontend
  ├─ Firebase Authentication and Firestore (existing app data path)
  └─ Same-origin /api requests
        └─ Python Flask application (backend/flask_gateway/app.py)
              ├─ Vercel: Python Function via api/index.py
              └─ Cloud Run: Gunicorn container from Dockerfile
```

Node.js is a frontend build-time tool only. The production container's runtime is Python; Express, the Node server entrypoint, and server bundling have been removed.

## Active Python application

`backend/flask_gateway/app.py` is the canonical Flask application. `api/index.py` exposes that shared app to Vercel as a Python Function. Local Vite development proxies `/api` and `/uploads` to the Flask development server. Cloud Run serves the built Vite `dist/` files and the API from the same Flask/Gunicorn service.

The API currently provides health reporting, temporary media uploads, OTP issue/verification, signed visitor passes, audit acknowledgments, and compatibility notification/analytics/SLA responses. The latter compatibility routes are placeholders rather than persisted business workflows. See the README for route contracts and limitations.

## Data and trust boundaries

- The React client continues to use Firebase Auth and Firestore for current user-facing records and real-time reads/writes.
- The Flask compatibility API does not replace that CRUD path and does not currently enforce Firebase ID-token authorization; this matches the prior Express API, which had no authentication middleware.
- OTP state, rate limits, audit acknowledgments, and uploaded files are process- or instance-local; neither deployment target provides durable shared state by default. OTP issue/verification is development-only until a delivery provider and shared storage are configured.
- Visitor-pass signatures require a configured `GATE_PASS_SECRET`. Use Vercel environment variables or Cloud Run Secret Manager; do not hardcode secrets.
- Email notification delivery remains dependent on the Firebase email extension when initiated by the frontend. The Flask `/api/notify` route is explicitly a mock.
- Payment processing is outside the implemented runtime: no provider, verified webhook, or reconciliation flow is included.

## Deployment

Vercel builds the React bundle and routes API calls to the Python Flask function. Its serverless filesystem and memory are ephemeral. Cloud Run uses a multi-stage Docker build: Node builds the static frontend, and a Python image runs Gunicorn. The Cloud Build configuration can deploy this image manually after cloud project setup; no deployment has been run as part of this migration.

The old Django/Celery modules under `backend/django_core` and `backend/celery_workers` are inactive scaffolding and are not installed or started by either deployment configuration.
