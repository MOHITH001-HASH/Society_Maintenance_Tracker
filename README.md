# Society Maintenance Tracker

A web-based apartment and residential society maintenance management platform designed to streamline maintenance complaint workflows, status lifecycle tracking, administrative resolution processes, digital announcements, and notification dispatches.

---

## 1. Project Overview

In residential communities, handling maintenance complaints through manual registers, phone calls, or unorganized messaging channels leads to delayed resolutions, lack of accountability, and zero visibility for residents.

**Society Maintenance Tracker** addresses these challenges by providing:
- **Resident Interface**: Enables residents to submit categorized maintenance complaints with descriptions and photo attachments, track status in real time, and view historical audit timelines.
- **Administrative Dashboard**: Allows society managers to review incoming issues, assign priority levels, transition ticket statuses, and apply filters by category, status, and overdue criteria.
- **Configurable Overdue Detection**: Automatically identifies unaddressed complaints exceeding an administrator-defined threshold and elevates them to the top of the queue.
- **Digital Notice Board**: Publishes community announcements with an option to pin critical updates.
- **Notification Flow**: Dispatches structured email notifications upon ticket status transitions and high-priority notice broadcasts.

---

## 2. System Architecture & Features

### 2.1 Resident Capabilities
- **Authentication & Authorization**: Secure account access with role-based dashboard redirection.
- **Complaint Submission**: Selectable categories (Plumbing, Electrical, Carpentry, Lift, Housekeeping, Security) with issue details and image uploads.
- **Audit Timeline**: Step-by-step history tracking showing the actor, timestamp, status transition, and administrative remarks.
- **Notice Board**: Chronological view of society announcements with pinned notices prioritized.

### 2.2 Administrative Capabilities
- **Overview Metrics**: Summary indicators showing Total Complaints, Open Issues, In Progress, Resolved, and Overdue counts.
- **Search & Filtering**: Query complaints by category, lifecycle state, or submission date range.
- **Priority Assignment**: Categorization of issues into Low, Normal, High, and Urgent priority tiers.
- **Status Lifecycle Transitions**: Controlled updates from `Open` to `In Progress` and `Resolved`, accompanied by mandatory timestamping and optional resolution notes.
- **SLA & Overdue Management**: Configurable threshold period (e.g., 2, 3, 5, or 7 days) to flag overdue tickets.
- **Notice Publishing**: Authoring and publishing announcements to all residents.

---

## 3. Directory Structure

```
Society_Maintenance_Tracker/
├── backend/                       # Python Backend Services (Django + Flask + Celery)
│   ├── django_core/               # Core Relational Architecture & Workflows
│   │   ├── apps/
│   │   │   ├── societies/         # Society and unit management
│   │   │   ├── members/           # User authentication and profile roles
│   │   │   └── tickets/           # Maintenance complaints & state machines
│   │   ├── core/                  # Django project configuration & settings
│   │   └── manage.py
│   ├── flask_gateway/             # Lightweight Microservice Gateway
│   │   ├── routes/
│   │   │   ├── otp_service.py     # OTP dispatch and verification
│   │   │   └── media_service.py   # Attachment and image upload processor
│   │   └── app.py                 # API routing and verification endpoints
│   └── celery_workers/            # Background Task Processing
│       └── tasks.py               # SLA evaluation and notification jobs
├── src/                           # Frontend Client (React + TypeScript + Tailwind CSS)
│   ├── components/                # Modular UI elements (Modals, Navbars, Filters)
│   ├── contexts/                  # Authentication and global state providers
│   ├── pages/                     # Primary views (AdminDashboard, ResidentDashboard, Login)
│   ├── lib/                       # Utility modules (Firebase client, API helpers)
│   ├── types.ts                   # Centralized TypeScript interface definitions
│   ├── App.tsx                    # Top-level routing and layout controller
│   └── main.tsx                   # Frontend entry point
├── server.ts                      # API Gateway & Reverse Proxy
├── firestore.rules                # Database Security & Access Rules
├── requirements.txt               # Python package dependencies
├── package.json                   # Node.js dependencies and script definitions
├── SYSTEM_DESIGN.md               # Detailed System Design Document
├── ARCHITECTURE.md                # Microservices Architectural Reference
└── README.md                      # Project Documentation and Setup Guide
```

---

## 4. Technology Stack

| Layer | Technology | Function in Application |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Tailwind CSS | Single-page application, interactive dashboards, modal forms |
| **Backend Core** | Python (Django 5, Flask, Celery) | Business logic, state validation, asynchronous task execution |
| **API Ingress** | Express / Node.js Reverse Proxy | Request routing, static asset serving, middleware proxying |
| **Database** | Firebase Firestore / PostgreSQL | Document persistence, real-time subscriptions, audit histories |
| **Authentication** | Firebase Authentication | Role-based token management and session verification |
| **Notifications** | Trigger Email Integration / SMTP Queue | Automated transactional email notifications |

---

## 5. Local Setup and Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.10.0 or higher
- **npm** or **bun**

### Step 1: Clone Repository
```bash
git clone https://github.com/MOHITH001-HASH/Society_Maintenance_Tracker.git
cd Society_Maintenance_Tracker
```

### Step 2: Install Frontend Dependencies & Start Server
```bash
# Install dependencies
npm install

# Launch application development server (Port 3000)
npm run dev
```

### Step 3: Optional Python Backend Setup
```bash
# Initialize virtual environment
python -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run migrations and start server
cd backend/django_core
python manage.py migrate
python manage.py runserver 8000
```

### Step 4: Access Application
Open a web browser and navigate to `http://localhost:3000`.

---

## 6. Environment Configuration

Create a `.env` file in the project root with the following configuration:

```env
# Frontend / Firebase Client Credentials
VITE_FIREBASE_API_KEY=AIzaSyBxjMAVZDvLqiejAAotRhtdkt4HZ92F60c
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0615302941.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0615302941
VITE_FIREBASE_STORAGE_BUCKET=gen-lang-client-0615302941.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=859777274196
VITE_FIREBASE_APP_ID=1:859777274196:web:7afbc612822800120af8c1

# Backend Credentials
DJANGO_SECRET_KEY=django-insecure-society-tracker-secret-key-2026
GATE_PASS_SECRET=society-gate-pass-hmac-verification-key
OTP_SECRET_KEY=society-otp-auth-token-secret-key

# Application URLs
APP_URL=http://localhost:3000
```

---

## 7. Data Models and Schema Definitions

### 7.1 `complaints` Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique ticket identifier |
| `societyId` | String | Multi-tenant society identifier |
| `unitNumber` | String | Apartment or flat number (e.g., "A-302") |
| `residentId` | String | Identifier of the submitting resident |
| `residentName` | String | Name of the resident |
| `residentEmail` | String | Contact email for notification delivery |
| `category` | String | Issue category (Plumbing, Electrical, etc.) |
| `title` | String | Brief summary of the complaint |
| `description` | String | Comprehensive details of the issue |
| `imageUrl` | String (Optional) | Photo attachment URL or Base64 data URI |
| `priority` | String | Priority level (`low`, `normal`, `high`, `urgent`) |
| `status` | String | Lifecycle state (`open`, `in_progress`, `resolved`) |
| `isOverdue` | Boolean | Calculated flag indicating SLA breach |
| `statusHistory` | Array of Objects | Chronological audit log of state changes |
| `createdAt` | Timestamp | Record creation timestamp |
| `updatedAt` | Timestamp | Last modification timestamp |

### 7.2 `statusHistory` Object Schema
| Field | Type | Description |
| :--- | :--- | :--- |
| `fromStatus` | String | Status prior to transition |
| `toStatus` | String | Status after transition |
| `changedBy` | String | Name of user making the modification |
| `changedByRole`| String | Role of user (`admin` or `resident`) |
| `note` | String (Optional) | Contextual notes regarding the update |
| `timestamp` | Timestamp | ISO timestamp of modification event |

### 7.3 `notices` Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique notice identifier |
| `societyId` | String | Society identifier |
| `title` | String | Notice headline |
| `content` | String | Full text of the announcement |
| `isImportant` | Boolean | Boolean flag indicating pinned status |
| `postedBy` | String | Name of publishing administrator |
| `createdAt` | Timestamp | Notice publication timestamp |

---

## 8. REST API Reference

### Complaints API
- `GET /api/societies/:societyId/tickets`: Retrieve all complaints for a given society.
- `POST /api/societies/:societyId/tickets`: Submit a new maintenance complaint.
- `PATCH /api/societies/:societyId/tickets/:ticketId`: Update complaint status and append an audit history record.

### SLA & Overdue API
- `POST /api/workflows/sla/check/:societyId`: Evaluate complaints against the configured overdue threshold.

### Notices API
- `GET /api/societies/:societyId/notices`: Retrieve society announcements.
- `POST /api/societies/:societyId/notices`: Publish a new announcement and trigger notification jobs.

---

## 9. Live Application URL

- **Deployment URL**: https://society-maintenance-tracker-pied.vercel.app
