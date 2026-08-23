# Society Maintenance Tracker

A full-stack web application designed for apartment communities to streamline maintenance issue reporting, complaint lifecycle tracking, administrative workflows, notice board announcements, and automated notifications.

---

## 📌 Project Overview

In residential apartment complexes, handling day-to-day maintenance issues manually (via phone calls, registers, or chat groups) causes delays, loss of records, and zero visibility for residents. 

**Society Maintenance Tracker** solves this problem by providing:
1. **Resident Portal**: Easily raise complaints with categories, descriptions, and photos; track live status and full audit history.
2. **Admin Management Dashboard**: Prioritize (Low, Medium, High), assign, update status (Open, In Progress, Resolved), and monitor complaints by category, status, and overdue count.
3. **Overdue Detection System**: Automatically flags complaints that exceed a configurable number of days (e.g., 3 days) and places them at the top of the admin queue.
4. **Notice Board**: Post community announcements with a "Pin as Important" option.
5. **Notification System**: Triggers email notifications whenever a complaint status is updated or an important notice is published.

---

## 🚀 Key Features

### 👤 Resident Features
- **Registration & Role-Based Login**: Secure authentication with role detection.
- **Raise Complaint**: Select category (Plumbing, Electrical, Carpentry, Lift, Cleaning, Security, etc.), add description, and upload optional photos.
- **Complaint History Tracking**: View complete step-by-step history for every complaint (who changed it, timestamp, status transition, and notes).
- **Notice Board View**: Read society announcements with important pinned notices displayed at the top.

### 🛠️ Admin Features
- **Admin Dashboard**: Real-time summary cards for Total Complaints, Open Issues, In Progress, Resolved, and Overdue Count.
- **Filtering & Search**: Filter issues by Category, Status (Open, In Progress, Resolved), or Date Range (Today, This Week, This Month).
- **Priority Management**: Assign Low, Medium, or High priority to each complaint.
- **Status Lifecycle Workflow**: Update status (`Open` → `In Progress` → `Resolved`). Adding optional administrative notes and timestamps with each change. Marking an issue as `Resolved` automatically closes it.
- **Configurable Overdue Detection**: Admins can configure the overdue threshold (e.g., 2, 3, 5, or 7 days). Overdue complaints are highlighted and prioritized at the top of the queue.
- **Notice Management**: Publish notices to all residents and mark urgent announcements as pinned.

---

## 🗂️ Project Directory Structure

```
Society_Maintenance_Tracker/
├── backend/                       # Python Backend Services (Django + Flask + Celery)
│   ├── django_core/               # Django Enterprise Application (Entities, Workflows)
│   │   ├── apps/
│   │   │   ├── societies/         # Society & unit provisioning models, views, serializers
│   │   │   ├── members/           # User profile & role-based access models
│   │   │   └── tickets/           # Maintenance complaints & lifecycle state machines
│   │   ├── core/                  # Django project settings, URLs, and ASGI/WSGI
│   │   └── manage.py
│   ├── flask_gateway/             # Flask Microservice Gateway
│   │   ├── routes/
│   │   │   ├── otp_service.py     # OTP generation and verification
│   │   │   └── media_service.py   # Attachment and photo upload processor
│   │   └── app.py                 # Fast API gateway, QR pass & audit ingestion
│   └── celery_workers/            # Asynchronous Task Queue
│       └── tasks.py               # SLA escalation checks & broadcast notifications
├── src/                           # Frontend Client (React + TypeScript + Tailwind CSS)
│   ├── components/                # Reusable UI components (Modals, Navbars, Cards, Filters)
│   ├── contexts/                  # Auth and Application State Contexts
│   ├── pages/                     # Main views (AdminDashboard, ResidentDashboard, Notices, etc.)
│   ├── lib/                       # Helper utilities (Firebase, Notifications, Python Gateway)
│   ├── types.ts                   # TypeScript interfaces and data models
│   ├── App.tsx                    # Root Application Component
│   └── main.tsx                   # Frontend Entry Point
├── server.ts                      # API Gateway & Reverse Proxy
├── firestore.rules                # Database Security Rules
├── requirements.txt               # Python Dependencies
├── package.json                   # Frontend & Node Dependencies
├── SYSTEM_DESIGN.md               # Detailed System Design Document (800 words max)
├── ARCHITECTURE.md                # Microservices & Enterprise Architecture Blueprint
└── README.md                      # Project Documentation & Setup Guide
```

---

## ⚙️ Technology Stack

| Layer | Technology Used | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide Icons | Responsive user interface, dashboards, modals, forms |
| **Backend Core** | Python (Django 5, Flask, Celery) | Business logic, SLA scheduling, data models, APIs |
| **API Gateway / Proxy** | Express / Node.js Reverse Proxy | Request routing, Vite dev server, endpoint proxying |
| **Database** | Firebase Firestore / PostgreSQL | Real-time complaint storage, status logs, user data |
| **Authentication** | Firebase Authentication | Role-based login (Resident, Admin) with Email/Google/OTP |
| **Notifications** | Trigger Email Integration / Staged Mail Queue | Automated email dispatches for updates and notices |

---

## 🛠️ Step-by-Step Installation & Setup

### Prerequisites
- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **npm** or **bun**

### 1. Clone the Repository
```bash
git clone https://github.com/MOHITH001-HASH/Society_Maintenance_Tracker.git
cd Society_Maintenance_Tracker
```

### 2. Frontend & Ingress Gateway Setup
```bash
# Install Node.js dependencies
npm install

# Start the local development server (binds on port 3000)
npm run dev
```

### 3. Python Backend Setup (Optional for standalone backend execution)
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install Python requirements
pip install -r requirements.txt

# Run Django backend
cd backend/django_core
python manage.py migrate
python manage.py runserver 8000
```

### 4. Open the Application
Navigate to `http://localhost:3000` in your web browser.

---

## 🔐 Environment Variables (`.env.example`)

Create a `.env` file in the root directory and add the following variables:

```env
# Frontend / Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Backend & Secret Keys
DJANGO_SECRET_KEY=your_django_secret_key
GATE_PASS_SECRET=your_gate_pass_hmac_secret
OTP_SECRET_KEY=your_otp_secret_key

# Hosted App URL
APP_URL=http://localhost:3000
```

---

## 🗄️ Database Schema & Data Models

### 1. `complaints` Collection / Table
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String / UUID | Unique complaint identifier |
| `societyId` | String | Multi-tenant society ID |
| `unitNumber` | String | Flat / Unit number (e.g., "A-302") |
| `residentId` | String | User ID of the creator |
| `residentName` | String | Full name of the resident |
| `residentEmail` | String | Email address for status updates |
| `category` | String | Category (Plumbing, Electrical, etc.) |
| `title` | String | Short title of the issue |
| `description` | String | Detailed description of the problem |
| `imageUrl` | String (Optional) | Photo attachment URL or Base64 |
| `priority` | Enum | `low`, `normal`, `high`, `urgent` |
| `status` | Enum | `open`, `in_progress`, `resolved`, `closed` |
| `isOverdue` | Boolean | Computed overdue flag |
| `statusHistory` | Array of Objects | Full chronological list of status changes |
| `createdAt` | Timestamp | Date and time when the complaint was raised |
| `updatedAt` | Timestamp | Date and time of last update |
| `resolvedAt` | Timestamp (Optional) | Date and time when marked resolved |

### 2. `statusHistory` Sub-Object
| Field | Type | Description |
| :--- | :--- | :--- |
| `fromStatus` | String | Previous status |
| `toStatus` | String | New status |
| `changedBy` | String | Name of actor (Admin / Resident) |
| `changedByRole`| String | Role (`admin` or `resident`) |
| `note` | String (Optional) | Explanation note entered during update |
| `timestamp` | Timestamp | Exact date and time of the change |

### 3. `notices` Collection / Table
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String / UUID | Unique notice identifier |
| `societyId` | String | Society ID |
| `title` | String | Title of the announcement |
| `content` | String | Full notice description |
| `isImportant` | Boolean | If true, pinned to the top of notice board |
| `postedBy` | String | Name of the admin |
| `createdAt` | Timestamp | Publishing date and time |

---

## 📡 REST API Documentation

### 1. Complaints & Work Orders
- **`GET /api/societies/:societyId/tickets`**: Fetch all complaints for a society (Supports `?unit=A-101` and status filters).
- **`POST /api/societies/:societyId/tickets`**: Create a new complaint with title, description, category, priority, and photo.
- **`PATCH /api/societies/:societyId/tickets/:ticketId`**: Update complaint status (`open`, `in_progress`, `resolved`), append history entry, and notify resident.

### 2. Overdue & SLA Checks
- **`POST /api/workflows/sla/check/:societyId`**: Trigger overdue detection algorithm based on admin's threshold days.

### 3. Notices & Broadcasts
- **`GET /api/societies/:societyId/notices`**: Get society notice board with pinned notices prioritized.
- **`POST /api/societies/:societyId/notices`**: Publish a new notice and trigger email notifications to residents.

### 4. Fast Ingestion & OTP Services
- **`POST /api/otp/send`**: Dispatches 6-digit verification code with 60-second rate-limiting.
- **`POST /api/otp/verify`**: Verifies submitted OTP against active cache.
- **`POST /api/visitors/pass`**: Generates HMAC-signed visitor gate pass and QR payload.

---

## 🌐 Hosted Application URL

- **Live Hosted Application**: [Society Maintenance Tracker on Cloud Run / Vercel](https://ais-pre-azbspzz6h73vpblohxq4ew-567613665429.asia-southeast1.run.app)
