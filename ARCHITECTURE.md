# Global Multi-Tenant Residential Management Platform (Vasturith)
## High-Level Architecture & Implementation Plan: Python (Django + Flask + Celery)

This document provides the blueprint for the enterprise backend core written in Python (Django + Flask + Celery) combined with a thin React/Vite client and Firebase Auth/Firestore real-time fabric.

---

# 1. System Topology & Microservices Overview

```
                                      [ GLOBAL EDGE LAYER ]
                               Cloudflare Enterprise / AWS CloudFront
                       • Anycast DNS, SSL Offloading, DDoS & WAF Shield
                       • Global Static Asset CDN (Thin Client Distribution)
                                                │
                                                ▼
                                    [ REVERSE PROXY / INGRESS ]
                                Envoy / Traefik / Nginx Ingress Controller
                       • Rate Limiting (Token Bucket / Sliding Window via Redis)
                       • Path-based Microservice Routing & TLS Termination
                                                │
             ┌──────────────────────────────────┴──────────────────────────────────┐
             │                                                                     │
  (REST / Ingestion Requests)                                            (Streaming / WebSockets)
             ▼                                                                     ▼
┌──────────────────────────────────────────────┐                ┌──────────────────────────────────────┐
│       FLASK HIGH-SPEED GATEWAY PODS          │                │    DJANGO ASGI / CHANNELS PODS       │
│  • Firebase ID Token JWT Verification        │                │  • Bi-directional WebSockets         │
│  • Security Audit Ingestion (<10ms)          │                │  • Gate Pass Approval Broadcasts     │
│  • Visitor QR Code Signed Token Issuance     │                │  • Emergency Broadcast Push          │
│  • High-Concurrency Intercom Routing         │                │  • Real-Time Ticket Status Pushes    │
└──────────────────────┬───────────────────────┘                └──────────────────┬───────────────────┘
                       │                                                           │
                       └───────────────────────┬───────────────────────────────────┘
                                               │
                                               ▼
                       ┌───────────────────────────────────────────────┐
                       │          DJANGO ENTERPRISE CORE PODS          │
                       │  • Multi-Tenant Isolation Engine              │
                       │  • Unit & Society Provisioning Matrix         │
                       │  • Resident KYC & Household Approvals         │
                       │  • Maintenance Work Orders & SLA Workflows    │
                       │  • Dual-Write Sync to Firestore (Realtime)    │
                       └───────────────────────┬───────────────────────┘
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
  [ CELERY DISTRIBUTED WORKERS ]     [ REDIS CLUSTER (L2/L3) ]     [ AURORA POSTGRESQL / COCKROACHDB ]
  • Celery Beat SLA Monitors         • Rate Limiting Counters      • Multi-Tenant Data Store
  • Automated Overdue Escalations    • Distributed Locks (Redlock) • Partitioned Audit Trail
  • Bulk Notice Dispatchers          • WebSocket Channel Layers    • Sub-Unit Geographic Sharding
```

---

# 2. Database Schema (PostgreSQL with Partitioning)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 1. Societies (Tenants)
CREATE TABLE societies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    admin_email CITEXT NOT NULL,
    admin_id VARCHAR(128),
    number_of_floors INT NOT NULL DEFAULT 1,
    units_per_floor INT NOT NULL DEFAULT 1,
    total_apartments INT NOT NULL DEFAULT 0,
    is_setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Physical Units
CREATE TYPE unit_status_enum AS ENUM ('unoccupied', 'occupied', 'rented');

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id VARCHAR(64) NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    unit_number VARCHAR(32) NOT NULL,
    floor_number INT NOT NULL,
    status unit_status_enum NOT NULL DEFAULT 'unoccupied',
    occupied_by VARCHAR(255),
    intercom_number VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_unit_per_society UNIQUE (society_id, unit_number)
);

-- 3. Users & Tenant Roles
CREATE TYPE user_role_enum AS ENUM ('admin', 'resident', 'superadmin', 'guard');
CREATE TYPE resident_type_enum AS ENUM ('primary', 'household');
CREATE TYPE approval_status_enum AS ENUM ('pending', 'approved', 'rejected', 'removed');

CREATE TABLE users (
    uid VARCHAR(128) PRIMARY KEY,
    email CITEXT,
    phone VARCHAR(32),
    name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'resident',
    resident_type resident_type_enum NOT NULL DEFAULT 'primary',
    society_id VARCHAR(64) NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    unit_number VARCHAR(32),
    status approval_status_enum NOT NULL DEFAULT 'approved',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Maintenance / SLA Work Orders
CREATE TYPE ticket_priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_status_enum AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id VARCHAR(64) NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    unit_number VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    priority ticket_priority_enum NOT NULL DEFAULT 'normal',
    status ticket_status_enum NOT NULL DEFAULT 'open',
    is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
    sla_deadline TIMESTAMPTZ,
    created_by_uid VARCHAR(128) NOT NULL REFERENCES users(uid),
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 5. Partitioned Security Audit Trail
CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4(),
    society_id VARCHAR(64) NOT NULL,
    unit_number VARCHAR(32),
    category VARCHAR(64) NOT NULL,
    action VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    actor_id VARCHAR(128),
    actor_name VARCHAR(255),
    actor_role VARCHAR(64),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_soc_cat ON audit_logs(society_id, category, created_at DESC);
CREATE INDEX idx_user_soc_role ON users(society_id, role, status);
CREATE INDEX idx_units_soc_status ON units(society_id, status);
```

---

# 3. Microservices Structure & Directory Organization

```
/
├── backend/
│   ├── django_core/                   # Django 5 Enterprise Application
│   │   ├── manage.py
│   │   ├── core/                      # Settings, WSGI, ASGI config
│   │   │   ├── settings.py
│   │   │   ├── asgi.py
│   │   │   ├── urls.py
│   │   │   └── celery.py
│   │   ├── apps/
│   │   │   ├── societies/             # Multi-tenant directory & unit provisioning
│   │   │   │   ├── models.py
│   │   │   │   ├── views.py
│   │   │   │   ├── serializers.py
│   │   │   │   └── services.py
│   │   │   ├── members/               # KYC, resident & household approvals
│   │   │   │   ├── models.py
│   │   │   │   ├── views.py
│   │   │   │   └── serializers.py
│   │   │   └── tickets/               # Maintenance tickets & SLA workflows
│   │   │       ├── models.py
│   │   │       ├── views.py
│   │   │       └── tasks.py           # Celery tasks
│   ├── flask_gateway/                 # High-Throughput Ingestion & Gate Microservice
│   │   ├── app.py
│   │   ├── routes/
│   │   │   ├── auth.py                # Firebase Admin JWT verification
│   │   │   ├── visitors.py            # HMAC Signed QR Pass generator
│   │   │   └── audit.py               # <10ms streaming audit ingestion
│   │   └── utils/
│   │       ├── firebase_bridge.py
│   │       └── redis_client.py
│   └── celery_workers/                # Distributed Task Queue & Celery Beat Scheduler
│       ├── celery_app.py
│       └── tasks/
│           ├── sla_escalation.py
│           └── batch_notifications.py
├── src/                               # Ultra-Thin React 18 / Vite Presentation Layer
│   ├── lib/
│   │   ├── firebase.ts                # Client Auth Popups & Real-Time onSnapshot()
│   │   └── pythonGateway.ts           # Microservices RPC Client Bridge
│   ├── pages/                         # UI Screens (Admin, Resident, Guard)
│   └── components/                    # UI Components
├── server.ts                          # Reverse Proxy Gateway & Microservice Dispatcher
└── firestore.rules                    # Zero-Trust Firestore Security Rules
```
