# Enterprise High-Concurrency Architecture Specification
## Multi-Tenant Resident & Society Operations Platform

---

### Executive Overview & SLO Targets
This document specifies the enterprise architecture, distributed microservices topology, multi-region database partitioning, and infrastructure requirements for the Society Operations & Maintenance System. The target platform is engineered for global high concurrency, 99.999% availability, and sub-50ms latency at scale.

| Metric | Target SLA / SLO | Architecture Solution |
| :--- | :--- | :--- |
| **Availability (Uptime)** | **99.999%** (< 5.26 min downtime/yr) | Active-Active Multi-Region Cloud Run / GKE with Global Anycast CDN |
| **Peak Concurrency** | **500,000+ Concurrent Users** | Stateless horizontal pod autoscaling, Redis cluster read-through caches |
| **P99 API Latency** | **< 45ms** | Edge-terminated TLS, localized Firestore/Spanner read replicas, Redis Cache |
| **Data Durability** | **RPO = 0, RTO < 30s** | Distributed multi-region synchronous replication with point-in-time recovery |
| **Media Processing** | **100% Client + Edge Offload** | In-browser Canvas WebP compression + Cloudflare R2 / GCS direct presigned upload |

---

## 1. Microservices Decomposition & Topology

```
                               ┌────────────────────────────────┐
                               │  Global Anycast Cloud CDN / WAF │
                               │  (DDoS Shield + TLS 1.3 Edge)  │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                              ┌───────────────────────────────────┐
                              │  API Gateway & Envoy Mesh Layer   │
                              │  (Rate Limiting, JWT, RBAC Guard) │
                              └─┬──────────────┬────────────────┬─┘
                                │              │                │
            ┌───────────────────┴──┐           │           ┌────┴─────────────────┐
            ▼                      ▼           ▼           ▼                      ▼
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  Authentication  │  │ Complaint & SLA  │  │ Society & Unit   │  │ Media & Asset    │  │ Notification &   │
  │  & Identity Svc  │  │ Lifecycle Engine │  │ Directory Svc    │  │ Ingestion Svc    │  │ OTP Dispatcher   │
  └─────────┬────────┘  └─────────┬────────┘  └─────────┬────────┘  └─────────┬────────┘  └─────────┬────────┘
            │                     │                     │                     │                     │
            └───────────────┬─────┴───────────────┬─────┴───────────────┬─────┴───────────────┬─────┘
                            │                     │                     │                     │
                            ▼                     ▼                     ▼                     ▼
               ┌──────────────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
               │ Multi-Region Storage │ │ Redis Enterprise  │ │ Kafka / Cloud     │ │ S3 / GCS Storage  │
               │ (Firestore / Spanner)│ │ Cluster (L2 Cache)│ │ PubSub Event Bus  │ │ (Direct WebP/CDN) │
               └──────────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘
```

### Microservice Boundary Specifications

1. **Authentication & Identity Service (`auth-service`)**:
   - Manages OAuth 2.0 (Google Workspace / Firebase Auth tokens), session invalidation, and custom claims injection.
   - Enforces Multi-Factor Authentication (SMS OTP with +91 international routing via Twilio/GCP Communications).
   - Manages Role-Based Access Control (RBAC): Global Super Admin, Society Admin, Primary Resident, Household Member, and Assigned Staff.

2. **Complaint & SLA Lifecycle Engine (`ticket-service`)**:
   - Manages maintenance tickets, state machines (`Open` &rarr; `In Progress` &rarr; `Pending Resident Approval` &rarr; `Resolved`), and priority-weighted SLA timers.
   - Implements distributed cron/event-driven workers that automatically flag breaches in real time.
   - Computes live resolution analytics, MTTR (Mean Time to Resolution), and technician workload balancing.

3. **Multi-Tenant Society & Directory Service (`tenant-service`)**:
   - Manages hierarchical isolation: `Organization` &rarr; `Society` &rarr; `Block/Tower` &rarr; `Unit Number` &rarr; `Resident Profile`.
   - Supports self-serve society provisioning with custom SLA matrices, emergency contacts, and automated unit generator.

4. **Media & Asset Ingestion Service (`media-service`)**:
   - Pure client-side compression pipeline (WebP/JPEG 80% lossy, max 1600px dimension) with fallback to edge serverless transformations.
   - Direct-to-storage presigned upload tokens bypassing API server memory to guarantee zero server crash under burst traffic.

5. **Notification & Invites Dispatcher (`notify-service`)**:
   - Event-driven consumer connected to Kafka/PubSub topics (`ticket.created`, `ticket.overdue`, `resident.invited`, `profile.otp_requested`).
   - Dispatches transactional emails (SendGrid / AWS SES) and SMS (+91 India DLT-compliant templates).

---

## 2. Database Schema & Data Modeling

### Physical Collection / Table Design (Multi-Tenant Isolated)

#### Collection: `societies`
```json
{
  "_id": "soc_blr_7721",
  "name": "Palm Heights Residency",
  "address": "Outer Ring Road, Bellandur, Bengaluru, Karnataka, 560103",
  "countryCode": "+91",
  "blocks": ["Tower A", "Tower B", "Tower C"],
  "totalUnits": 360,
  "slaMatrix": {
    "Urgent": 6,
    "High": 24,
    "Medium": 48,
    "Low": 72
  },
  "emergencyContacts": [
    { "role": "Security Gate 1", "phone": "+91 98450 11223" },
    { "role": "Facility Manager", "phone": "+91 99801 44556" }
  ],
  "createdAt": "2026-08-23T00:00:00.000Z",
  "status": "active"
}
```

#### Collection: `users` (Indexed on `societyId`, `email`, `unitNumber`, `role`)
```json
{
  "_id": "usr_991823a",
  "societyId": "soc_blr_7721",
  "email": "resident@example.com",
  "name": "Mohith Paladugu",
  "phone": "+91 98765 43210",
  "phoneVerified": true,
  "role": "resident",
  "residentType": "primary",
  "unitNumber": "A-1402",
  "approvalStatus": "approved",
  "createdAt": "2026-08-23T00:00:00.000Z"
}
```

#### Collection: `complaints` (Composite Indexed on `[societyId, status, priority, createdAt]`)
```json
{
  "_id": "cmp_8823491",
  "societyId": "soc_blr_7721",
  "userId": "usr_991823a",
  "userName": "Mohith Paladugu",
  "unitNumber": "A-1402",
  "category": "Plumbing",
  "spaceType": "Private",
  "priority": "Urgent",
  "description": "Main water valve pipe leakage under master sink.",
  "photoUrl": "https://storage.cloud.google.com/soc-assets/cmp_8823491.webp",
  "status": "In Progress",
  "preferredVisitTime": "Morning (9am - 12pm)",
  "assignedStaffId": "stf_441",
  "assignedStaffName": "Ramesh Kumar (Plumber)",
  "assignedStaffPhone": "+91 98450 99881",
  "createdAt": "2026-08-23T06:30:00.000Z",
  "history": [
    {
      "actorId": "usr_991823a",
      "actorName": "Mohith Paladugu",
      "actorRole": "resident",
      "status": "Open",
      "timestamp": "2026-08-23T06:30:00.000Z"
    },
    {
      "actorId": "adm_110",
      "actorName": "Society Admin",
      "actorRole": "admin",
      "status": "In Progress",
      "note": "Assigned to Ramesh Kumar with high priority.",
      "timestamp": "2026-08-23T07:15:00.000Z"
    }
  ]
}
```

#### Collection: `auditLogs` (Immutable Append-Only Ledger)
```json
{
  "_id": "log_551923",
  "societyId": "soc_blr_7721",
  "actorId": "adm_110",
  "actorName": "Society Admin",
  "actorRole": "admin",
  "category": "maintenance",
  "action": "Complaint Status Modified",
  "targetId": "cmp_8823491",
  "description": "Status moved to In Progress. Technician assigned.",
  "timestamp": "2026-08-23T07:15:00.000Z"
}
```

---

## 3. Infrastructure & Maximum Uptime Strategy

### High-Availability Deployment Matrix

| Infrastructure Layer | Technology | Redundancy & Failover Spec |
| :--- | :--- | :--- |
| **Edge CDN & WAF** | Cloudflare Enterprise / Cloud Armor | Anycast routing across 300+ PoPs with automated DDoS layer 3/4/7 mitigation |
| **Compute Cluster** | Kubernetes (GKE / EKS) Multi-Zone | Horizontal Pod Autoscaler (HPA) targeting 60% CPU/Memory with node-pool multi-AZ spread |
| **Primary Database** | Google Cloud Firestore / Spanner | Multi-region 5-replica consensus across 3 geographical cloud regions |
| **L2 Caching** | Redis Cluster (Memorystore / ElastiCache) | Active-Active cross-region read replicas with Sub-millisecond latency |
| **Event Broker** | Apache Kafka / Google Cloud Pub/Sub | At-least-once guaranteed delivery, partitioned by `societyId` |
| **Static Assets** | Google Cloud Storage / Cloudflare R2 | Direct browser WebP pipeline + immutable cache headers (`Cache-Control: max-age=31536000`) |

---

## 4. Scalability Implementation Plan & Milestones

### Phase 1: Client-Side Resilience & Offload (Completed)
- Client-side Canvas image optimization to zero out serverless payload limits.
- Resilient OTP engine with native India (+91) validation.
- Clean isolation of Admin/Resident Demo Sandbox modes.

### Phase 2: High-Volume Asynchronous Workers (Immediate)
- SLA monitor cron execution via Cloud Scheduler + Cloud Run Worker triggering real-time alerts upon 80% SLA consumption.
- DLT-compliant SMS Gateway webhook integration for automated resident invitation delivery.

### Phase 3: Global Geo-Partitioning & Read Caches
- Automatic read caching for global notice boards and directory lookups via Redis.
- Society data sharding allowing horizontal scaling to 10,000+ residential societies and 5,000,000+ residents concurrently.
