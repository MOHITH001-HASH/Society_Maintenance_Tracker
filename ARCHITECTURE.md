# High-Level Architecture & Implementation Plan
## Global, High-Concurrency Society & Apartment Management Platform

---

### 1. Executive Summary & System Objectives
This document defines the production-grade architectural blueprint for a multi-tenant residential management system designed for **global scalability**, **sub-100ms API response times**, and **99.999% high availability**. 

The system partitions data at the tenant (`societyId`) level, isolates private resident records, processes multi-channel communications (Email/SMS OTP and broadcast notices), and offloads media assets to cloud object storage.

---

### 2. Microservices Topology & Distributed Systems Architecture

```
                                [ Global Anycast DNS / CDN Edge (Cloudflare / Cloud CDN) ]
                                                            │
                                        [ API Gateway / Envoy Proxy / WAF ]
                                                            │
                     ┌──────────────────────────────────────┼──────────────────────────────────────┐
                     │                                      │                                      │
          [ Auth & OTP Microservice ]           [ Tenant Management Service ]           [ Media Storage Service ]
          - HMAC-SHA256 Tokens                  - Society & Building Matrix             - Chunked Direct-to-S3/GCS
          - 5-Min TTL Invalidation               - Unit Mapping Engine                   - Automatic WebP Transcode
          - Rate Limiting (Token Bucket)         - Multi-Tenant Access Guard             - Edge CDN Object Caching
                     │                                      │                                      │
                     └──────────────────────────────────────┼──────────────────────────────────────┘
                                                            │
                                              [ Notification Message Bus ]
                                         (Cloud Pub/Sub / Kafka / RabbitMQ)
                                                            │
                                  ┌─────────────────────────┴─────────────────────────┐
                                  │                                                   │
                       [ Email Worker (SES/SendGrid) ]                      [ SMS Worker (Twilio/GCP) ]
```

#### Core Microservices:
1. **Identity & OTP Microservice**:
   - Manages secure 6-digit one-time passcodes with HMAC-SHA256 salted hashing.
   - Enforces sliding 5-minute TTL expirations and 3-attempt brute-force lockouts.
   - Implements per-IP and per-destination rate-limiting using Token Bucket algorithms.
2. **Multi-Tenant Society & Matrix Engine**:
   - Manages society registrations, floor hierarchies, and unit coordinate generation.
   - Enforces strict tenant separation ensuring no cross-society data leakage.
3. **Complaints & SLA Lifecycle Service**:
   - Manages maintenance workflows, technician dispatch, resident confirmation, and dynamic multi-tier SLA monitoring:
     - **Urgent Priority**: Overdue after **10 hours** (Critical emergencies, gas/water floods, structural risks).
     - **High Priority**: Overdue after **1 day / 24 hours** (Major appliance leaks, primary power/AC faults).
     - **Medium Priority**: Overdue after **2 days / 48 hours** (Fixtures, carpentry, localized clogs).
     - **Low Priority**: Overdue after **3 days / 72 hours** (Routine cosmetic maintenance, aesthetic repairs).
   - Dynamically re-indexes and prioritizes overdue tickets to the top of administrator feeds with automated escalation alerts.
4. **Cloud Media Storage Microservice**:
   - Provides presigned upload URLs with MIME verification and virus scanning.
   - Serves high-resolution photos through edge CDN nodes with client-side lightbox previews.
5. **Notification Microservice**:
   - Asynchronously consumes broadcast and unit-level events to dispatch multi-channel alerts (SMS, Email, Push).

---

### 3. Database Schema & Multi-Tenant Partitioning

The database leverages composite partition keys centered around `societyId`:

#### Collection: `societies`
```json
{
  "id": "soc_north_towers_01",
  "name": "North Towers Luxury Residences",
  "address": "450 Skyline Avenue, Tower B",
  "numberOfFloors": 24,
  "unitsPerFloor": 8,
  "totalApartments": 192,
  "generatedUnits": ["101", "102", "103", ..., "2408"],
  "isSetupComplete": true,
  "adminIds": ["usr_admin_01"],
  "createdAt": "2026-08-23T00:00:00.000Z",
  "updatedAt": "2026-08-23T00:00:00.000Z"
}
```

#### Collection: `users`
```json
{
  "id": "usr_948271",
  "email": "resident@example.com",
  "name": "Elena Rostova",
  "phone": "+14155552671",
  "role": "resident",
  "societyId": "soc_north_towers_01",
  "unitNumber": "1402",
  "residentType": "primary", // "primary" | "household"
  "status": "approved", // "pending" | "invited" | "approved" | "rejected" | "removed"
  "invitedBy": "usr_primary_948",
  "invitedByName": "Dmitri Rostova",
  "photoURL": "/uploads/media-avatar-1402.webp",
  "createdAt": "2026-08-23T00:00:00.000Z"
}
```

#### Collection: `householdRequests`
```json
{
  "id": "hreq_592810",
  "societyId": "soc_north_towers_01",
  "unitNumber": "1402",
  "targetUserId": "usr_948271",
  "targetUserName": "Elena Rostova",
  "targetUserEmail": "resident@example.com",
  "type": "addition", // "addition" | "removal"
  "status": "pending", // "pending" | "approved" | "rejected"
  "requestedBy": "usr_primary_948",
  "requestedByName": "Dmitri Rostova",
  "createdAt": "2026-08-23T00:00:00.000Z"
}
```

---

### 4. Household Multi-Recipient Broadcast & RBAC Architecture

#### A. Multi-Recipient Private Space Notification Topology
When maintenance requests are initiated, updated with technician assignments, or resolved for private residential units (`spaceType === 'Private'`), the system executes a real-time tenant fan-out query:
1. Queries all registered users where `societyId == targetSociety`, `unitNumber == targetUnit`, and `status == 'approved'`.
2. Compiles the unique recipient email/SMS matrix encompassing both Primary Residents and all approved Household Members.
3. Dispatches synchronous high-priority notifications, ensuring complete household visibility without cross-unit leakage.

```
[ Private Space Complaint Event ] 
               │
               ▼
[ Unit Household Resolver ] ───▶ Query: (societyId = X, unitNumber = Y, status = 'approved')
               │
               ├───────────────────────────────────────────┐
               ▼                                           ▼
      [ Primary Resident ]                        [ Household Members ]
   (Email & SMS Dispatch)                        (Email & SMS Dispatch)
```

#### B. Household Member Admin Approval State Machine
Household members invited by primary residents require administrator approval before gaining system access:
1. **Invited Phase**: Resident initiates invitation -> Document written with `status: 'invited'` and registered in `householdRequests` (`type: 'addition'`).
2. **Approval Gateway**: Administrator reviews the pending household queue and confirms identity/unit eligibility -> Transitions status to `'approved'`.
3. **Activation & Access**: The household member receives confirmation email and gains access to all resident features:
   - Maintenance & Complaints (submit, track, confirm resolution).
   - Society Notices (read broadcasts, view attachments).
   - Household Directory (view registered unit members).
   - Profile & Communication Preferences.
4. **Primary Resident Protection**: Household members have full resident capabilities but are strictly prohibited from submitting removal requests against the Primary Resident.

#### RBAC Matrix
| Capability | Primary Resident | Approved Household Member | Pending/Invited Member | Society Admin |
| :--- | :--- | :--- | :--- | :--- |
| **View Notices & Attachments** | Yes | Yes | No | Yes (Create/Edit) |
| **Submit & Track Maintenance** | Yes | Yes | No | Yes (Manage/Assign) |
| **Receive Private Unit Alerts** | Yes | Yes | No | Yes |
| **Confirm Issue Resolution** | Yes | Yes | No | Yes |
| **Invite Household Member** | Yes | Yes | No | Yes |
| **Remove Household Member** | Yes | Yes | No | Yes (Approve) |
| **Remove Primary Resident** | Yes (Self-transfer) | **Prohibited** | No | Yes |

---

### 5. Indexing & Query Optimization Strategy

1. **Complaints Index**: `(societyId ASC, unitNumber ASC, createdAt DESC)` — For resident unit feeds.
2. **Admin Complaints Index**: `(societyId ASC, status ASC, priority DESC, createdAt DESC)` — For admin triaging.
3. **Notices Index**: `(societyId ASC, createdAt DESC)` — For sub-10ms notice board broadcasts.
4. **Directory Index**: `(societyId ASC, unitNumber ASC, status ASC)` — For household management.
5. **Pending Approvals Index**: `(societyId ASC, status ASC, role ASC)` — For real-time admin approval queue.

---

### 6. High-Concurrency & Infrastructure Requirements

| Metric / Layer | Specification | Implementation Tooling |
| :--- | :--- | :--- |
| **Global CDN & WAF** | Anycast Routing, DDoS Layer 7 Shield | Cloudflare Enterprise / Google Cloud Armor |
| **Compute Clusters** | Stateless Autoscaling Containers | Google Cloud Run / Kubernetes GKE Autopilot |
| **Database Engine** | Multi-Region Active Replication | Cloud Firestore / Google Cloud Spanner |
| **Distributed Caching**| Sub-millisecond Session & Rate Limiter | Managed Redis Cluster / Cloud Memorystore |
| **Object Media Store** | Multi-Zone Replicated Buckets | Google Cloud Storage / AWS S3 with CDN Edge |
| **Target Availability**| 99.999% SLA (< 5.26 minutes annual downtime) | Multi-Region Failover & Automated Health Probes |

---

### 7. Implementation Rollout Phases

- **Phase 1 (Completed)**: Multi-tenant UI isolation, Default Notices screen routing, Profile contact management, and Onboarding setup wizard.
- **Phase 2 (Completed)**: Persistent OTP microservice with rate limiting, Cloud Object Storage for Media with progress indicators, Image Lightbox viewer, and priority SLA monitoring (Urgent: 10h, High: 24h, Medium: 48h, Low: 72h).
- **Phase 3 (Completed)**: Household multi-recipient broadcast notifications, Administrator Approval Gateway for invited household members, and Primary Resident removal protection.
- **Phase 4 (Enterprise Scale)**: Multi-region Redis cluster migration, Webhook integrations for automated payment gateways, and automated IoT access gate controllers.
```json
{
  "id": "cmp_847192",
  "societyId": "soc_north_towers_01",
  "residentId": "usr_948271",
  "unitNumber": "1402",
  "category": "Plumbing",
  "description": "Main water pressure valve leaking under sink.",
  "spaceType": "Private", // "Private" | "Public"
  "preferredVisitTime": "Weekdays after 4:00 PM",
  "photoUrl": "/uploads/media-photo-pipe.webp",
  "status": "In Progress", // "Open" | "In Progress" | "Pending Resident Approval" | "Resolved"
  "priority": "High", // "Low" | "Medium" | "High" | "Urgent"
  "assignedStaffId": "stf_8821",
  "assignedStaffName": "Carlos Mendoza",
  "assignedStaffPhone": "+14155559012",
  "assignedStaffWorkingHours": "8:00 AM - 5:00 PM",
  "history": [
    {
      "status": "Open",
      "timestamp": "2026-08-23T01:00:00.000Z",
      "actorId": "usr_948271",
      "actorName": "Elena Rostova",
      "note": "Complaint submitted with photo attachment"
    },
    {
      "status": "In Progress",
      "timestamp": "2026-08-23T02:15:00.000Z",
      "actorId": "usr_admin_01",
      "actorName": "Society Admin",
      "note": "Assigned technician Carlos Mendoza (Plumbing)"
    }
  ],
  "createdAt": "2026-08-23T01:00:00.000Z",
  "updatedAt": "2026-08-23T02:15:00.000Z"
}
```

#### Collection: `notices`
```json
{
  "id": "not_109283",
  "societyId": "soc_north_towers_01",
  "title": "Emergency Generator Testing Notice",
  "content": "Generator testing scheduled for Tuesday 10:00 AM - 12:00 PM. Elevators 1 & 2 will remain active.",
  "imageUrl": "/uploads/media-generator-notice.webp",
  "isImportant": true,
  "authorId": "usr_admin_01",
  "createdAt": "2026-08-23T03:00:00.000Z"
}
```

---

### 4. Indexing & Query Optimization Strategy

1. **Complaints Index**: `(societyId ASC, unitNumber ASC, createdAt DESC)` — For resident unit feeds.
2. **Admin Complaints Index**: `(societyId ASC, status ASC, priority DESC, createdAt DESC)` — For admin triaging.
3. **Notices Index**: `(societyId ASC, createdAt DESC)` — For sub-10ms notice board broadcasts.
4. **Directory Index**: `(societyId ASC, unitNumber ASC, status ASC)` — For household management.

---

### 5. High-Concurrency & Infrastructure Requirements

| Metric / Layer | Specification | Implementation Tooling |
| :--- | :--- | :--- |
| **Global CDN & WAF** | Anycast Routing, DDoS Layer 7 Shield | Cloudflare Enterprise / Google Cloud Armor |
| **Compute Clusters** | Stateless Autoscaling Containers | Google Cloud Run / Kubernetes GKE Autopilot |
| **Database Engine** | Multi-Region Active Replication | Cloud Firestore / Google Cloud Spanner |
| **Distributed Caching**| Sub-millisecond Session & Rate Limiter | Managed Redis Cluster / Cloud Memorystore |
| **Object Media Store** | Multi-Zone Replicated Buckets | Google Cloud Storage / AWS S3 with CDN Edge |
| **Target Availability**| 99.999% SLA (< 5.26 minutes annual downtime) | Multi-Region Failover & Automated Health Probes |

---

### 6. Implementation Rollout Phases

- **Phase 1 (Completed)**: Multi-tenant UI isolation, Default Notices screen routing, Profile contact management, and Onboarding setup wizard.
- **Phase 2 (Completed)**: Persistent OTP microservice with rate limiting, Cloud Object Storage for Media with progress indicators, Image Lightbox viewer, and cursor pagination.
- **Phase 3 (Enterprise Scale)**: Multi-region Redis cluster migration, Webhook integrations for automated payment gateways, and automated IoT access gate controllers.
