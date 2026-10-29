# Society Maintenance Tracker

React and Vite frontend with a Python Flask API. Firebase Authentication and Firestore remain the frontend identity and application-data services; they are not replaced by a relational backend in this migration.

## Runtime architecture

- **Frontend:** React, TypeScript, CSS/Tailwind, and Vite. Node.js is used only to install frontend dependencies and build the static bundle.
- **Backend:** Python 3.12 and Flask. The same Flask app powers local development, Vercel Functions, and the optional Cloud Run container.
- **Data:** The current UI reads and writes Firebase Auth/Firestore directly. The Python API currently provides health, visitor-pass, OTP, audit, upload, notification-stub, analytics-stub, and SLA-stub endpoints. The API does not replace the current Firestore CRUD implementation.
- **Payments:** No complete payment provider integration or verified payment flow is present. Payment operations are intentionally not implemented or represented as production-ready.

## Local setup

### Prerequisites

- Python 3.12
- Node.js 22.22 or newer and npm
- Firebase project access if you want to use sign-in and Firestore-backed application data

### 1. Configure Python

From the repository root, create and activate a virtual environment:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On macOS/Linux, use `python3 -m venv .venv` and `source .venv/bin/activate`.

Configure the visitor-pass signing key for local use:

```powershell
$env:GATE_PASS_SECRET = "replace-with-a-long-random-local-key"
$env:APP_ENV = "development"
```

Use a unique, high-entropy secret in every deployed environment. Never commit it.

### 2. Configure and run the React frontend

In another terminal:

```powershell
npm ci
npm run dev
```

Vite runs at `http://localhost:5173` and proxies `/api` and `/uploads` to Flask at `http://127.0.0.1:8000`. Configure another backend address with `PYTHON_API_URL`.

### 3. Run the Python API

In the activated Python terminal:

```powershell
python -m backend.flask_gateway.app
```

The API listens on `http://127.0.0.1:8000`; check `http://127.0.0.1:8000/api/health`. To run the production-style frontend and API together locally, run `npm run build`, then start Flask and open `http://127.0.0.1:8000`.

### 4. Run checks

```powershell
python -m unittest discover -s tests -v
npm run lint
npm run build
```

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `GATE_PASS_SECRET` | For visitor-pass signing | HMAC signing secret; set as a Vercel environment variable or Cloud Run Secret Manager secret. |
| `APP_ENV` | Recommended | Set to `production` for deployments. OTP issuing is development-only; production returns 503 until email/SMS delivery is configured. |
| `PORT` | Platform-provided | Flask/Gunicorn listener port; defaults to `8000` locally and Cloud Run supplies `8080`. |
| `PYTHON_API_URL` | No | Vite proxy target for local development; defaults to `http://127.0.0.1:8000`. |
| `UPLOAD_DIR` | No | Local upload directory; defaults to `uploads/` or `/tmp/society-uploads` on Vercel. |

Firebase client configuration is currently defined in `src/lib/firebase.ts`. Configure the Firebase project, Authentication providers, Firestore database, and Firestore rules there when switching environments. Do not put Firebase Admin credentials or other server secrets in Vite variables.

## Deploy to Vercel (current target)

The repository's `vercel.json` builds the Vite frontend into `dist/`, serves the SPA, and rewrites `/api/*` and `/uploads/*` to the Flask app in `app.py`. `.python-version` and `requirements.txt` select and pin the Python runtime dependencies; Vercel runs the Flask app as a serverless function.

1. Import the Git repository into Vercel and keep the repository root as the project root.
2. Set the build command to `npm run build` and output directory to `dist` (already declared in `vercel.json`).
3. Add `APP_ENV=production` and a long random `GATE_PASS_SECRET` in **Project Settings → Environment Variables** for Production and Preview as appropriate.
4. Deploy from the Vercel dashboard or run `npx vercel` and `npx vercel --prod` after authenticating the Vercel CLI.
5. Verify `/api/health`, a frontend route, and the visitor-pass endpoint after deployment.

Vercel's function filesystem and process memory are ephemeral and instance-local. The current OTP state, rate limits, and uploaded files are not durable or shared across invocations. The browser currently uses client-side image data URLs for complaint attachments; do not rely on `/api/upload` as persistent media storage. Use a managed datastore and object-storage provider before depending on those API features in production.

## Prepare Cloud Run (later target; not deployed)

The `Dockerfile` builds the React bundle with Node in a build-only stage, then copies the static output into a Python runtime image running Gunicorn. No Node or Express backend runs in the final container. The included `cloudbuild.yaml` builds and deploys this image when explicitly invoked.

1. Select the Google Cloud project and enable the required APIs:

   ```sh
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```

   Replace `PROJECT_ID` with the project ID where the service should run.
2. Create the Artifact Registry repository once:

   ```sh
   gcloud artifacts repositories create society-tracker --repository-format=docker --location=us-central1
   ```

3. Create the required signing secret (one-time):

   ```sh
   python -c "import secrets; print(secrets.token_urlsafe(48))" > gate-pass-secret.txt
   gcloud secrets create gate-pass-secret
   gcloud secrets versions add gate-pass-secret --data-file=./gate-pass-secret.txt
   ```

   Keep the file out of Git and remove it securely after adding the secret version.
4. Grant the default Cloud Run identity access to the secret and the Cloud Build identity permission to deploy and push the image. For projects using the default service accounts:

   ```sh
   PROJECT_ID="$(gcloud config get-value project)"
   PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
   RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
   BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
   gcloud secrets add-iam-policy-binding gate-pass-secret --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor
   gcloud artifacts repositories add-iam-policy-binding society-tracker --location=us-central1 --member="serviceAccount:${BUILD_SA}" --role=roles/artifactregistry.writer
   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BUILD_SA}" --role=roles/run.admin
   gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member="serviceAccount:${BUILD_SA}" --role=roles/iam.serviceAccountUser
   ```

   If your project uses user-managed service accounts, grant the equivalent permissions to those identities instead.
5. For a manual build/deploy, run:

   ```sh
   gcloud builds submit --config cloudbuild.yaml
   ```

   The build file uses the `us-central1` region and service name `society-management-app`. Change these in `cloudbuild.yaml` if needed. This command deploys; it has not been run as part of this migration.
6. Verify the Cloud Run service URL at `/api/health` and check its runtime logs.

Cloud Run's container filesystem is also ephemeral. Configure Firebase Storage or another durable object store before relying on uploaded files. OTP memory/rate limits are also instance-local until an external shared store is implemented.

## API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health and service-capability status |
| `POST` | `/api/upload` | Temporary file upload (`file`, maximum 15 MB; JPEG, PNG, WebP, GIF, PDF) |
| `GET` | `/uploads/<filename>` | Serve an uploaded file from the current instance |
| `POST` | `/api/otp/send` | Issue an in-memory development OTP; production returns 503 until delivery is configured |
| `POST` | `/api/otp/verify` | Verify and consume an OTP |
| `POST` | `/api/notify` | Compatibility stub; reports `delivery: "mock"` and sends no notification |
| `GET` | `/api/analytics/society/<societyId>` | Compatibility analytics stub |
| `POST` | `/api/visitors/pass` | Create a 24-hour HMAC-signed visitor pass; requires `GATE_PASS_SECRET` |
| `POST` | `/api/security/audit` | Accept a security audit event (in-memory response only; not persisted) |
| `POST` | `/api/workflows/sla/check/<societyId>` | Compatibility SLA stub; does not evaluate Firestore complaints |

## Known limitations

- **Payments:** Payment provider, credentials, webhook verification, reconciliation, and end-to-end payment tests are not implemented. Existing payment-related UI/contracts, if any, are not evidence of a working gateway. Configure and verify a provider before enabling real transactions.
- **OTP:** The React OTP modal now calls the Python issue/verify endpoints. For local development the API returns `_devCode`; in production it returns 503 because no email/SMS delivery provider is configured. The in-memory state is not shared across instances, so a provider plus durable shared OTP/rate-limit storage is required before production identity verification.
- **Notifications, analytics, SLA, audit:** These API endpoints retain compatibility response shapes but do not perform durable delivery, real aggregation, complaint escalation, or audit persistence. Email notices that the UI creates continue to rely on the configured Firebase email extension.
- **Persistence and authentication:** The API's current auxiliary routes do not implement Firebase ID-token authorization. Vercel/Cloud Run memory and local upload disks are not durable storage. Do not expose sensitive records or rely on these stubs for production authorization/compliance.
- **Legacy Python scaffolding:** Older Django/Celery modules remain under `backend/django_core` and `backend/celery_workers`; they are not installed or started by either deployment path. The active backend is Flask.
