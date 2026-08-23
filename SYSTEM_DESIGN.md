# System Design Document: Society Maintenance Tracker

## 1. Introduction
The **Society Maintenance Tracker** is a web-based platform built to handle apartment maintenance complaints, track their resolution status, manage society notices, and send email updates. This document describes the design of the core modules: the complaint history model, overdue detection, photo handling, and the notification flow.

---

## 2. Complaint Status Lifecycle & History Model

Every maintenance complaint follows a defined state transition lifecycle:

```
[Open] ─────────► [In Progress] ─────────► [Resolved (Closed)]
```

### Data Model Design
To ensure transparency and traceability, status updates are never overwritten blindly. Instead, every state change appends an entry to an immutable `statusHistory` array within the complaint record:

```json
{
  "id": "TICKET-101",
  "title": "Water leakage in kitchen",
  "category": "Plumbing",
  "priority": "High",
  "status": "In Progress",
  "createdAt": "2026-08-20T10:00:00Z",
  "statusHistory": [
    {
      "fromStatus": "None",
      "toStatus": "Open",
      "changedBy": "John Doe (Resident)",
      "changedByRole": "resident",
      "note": "Complaint created",
      "timestamp": "2026-08-20T10:00:00Z"
    },
    {
      "fromStatus": "Open",
      "toStatus": "In Progress",
      "changedBy": "Admin Sharma",
      "changedByRole": "admin",
      "note": "Plumber assigned, visiting today at 4 PM",
      "timestamp": "2026-08-21T11:30:00Z"
    }
  ]
}
```

### Why this design?
1. **Full Audit Trail**: Both residents and admins can see the complete timeline of who worked on the issue, when the change happened, and what remarks were left.
2. **Deterministic State Machine**: When an admin selects `Resolved`, the system records the timestamp and closes the ticket, preventing accidental duplicate edits.

---

## 3. Overdue Detection & Priority Handling

Complaints must not remain unaddressed indefinitely. The system implements a configurable overdue detection mechanism.

### Algorithm & Mechanism
1. **Configurable Threshold ($T$)**: The admin sets an overdue threshold in days (e.g., $T = 3$ days).
2. **Dynamic Check**: When the dashboard loads or a scheduled background worker runs:
   $$\text{Age in Days} = \frac{\text{Current Time} - \text{Created Timestamp}}{86,400\text{ seconds}}$$
3. **Overdue Condition**:
   $$\text{isOverdue} = (\text{Status} \neq \text{Resolved}) \land (\text{Age in Days} > T)$$
4. **Queue Prioritization**:
   The admin complaint table sorts records using multi-level sorting:
   - **First Priority**: Overdue items ($\text{isOverdue} = \text{true}$) at the very top with red alert tags.
   - **Second Priority**: Priority weight ($\text{Urgent} > \text{High} > \text{Normal} > \text{Low}$).
   - **Third Priority**: Creation timestamp (Newest first).

This ensures admins immediately notice urgent or neglected issues without manual searching.

---

## 4. Photo Upload Handling

Photos provide vital visual context for maintenance workers (e.g., pipe cracks, electrical sparks).

```
[Resident Browser] ──(1. Select Image)──► [Client Validation (Size < 5MB, Format)]
         │
         ├──(2. Compression / Encoding)──► [Base64 Data URI or Storage Bucket]
         │
         └──(3. Embed in Ticket Payload)─► [Database Storage & Fast Rendering]
```

### Handling Process:
1. **Client-Side Validation**: The file input checks that the uploaded file is an image (`image/jpeg`, `image/png`, `image/webp`) and does not exceed 5 MB.
2. **Encoding & Storage**: The image is processed and stored either via cloud storage URLs or optimized Base64 image strings.
3. **Display**: Thumbnails appear in complaint cards. Clicking the thumbnail opens a high-resolution preview modal with zoom support.

---

## 5. Notification & Email Flow

Automated alerts keep residents informed without requiring them to repeatedly check the portal.

```
[Admin Action] (Status Update / Post Important Notice)
       │
       ▼
[Event Trigger]
       │
       ├──► 1. Save change to Database
       │
       └──► 2. Push Notification Payload to Mail Queue
                   │
                   ▼
       [Email Service / Worker] (Trigger Email / SMTP)
                   │
                   ▼
       [Resident Email Inbox] (HTML Notification with Ticket ID & Link)
```

### Triggers:
1. **Complaint Status Change**: When an admin moves a complaint from `Open` to `In Progress` or `Resolved`, an email is triggered to the resident's registered email with the new status, timestamp, and admin note.
2. **Important Society Notice**: When a notice is published with `isImportant = true`, an email announcement is broadcast to all active residents in that apartment complex.

---

## 6. Summary

This design guarantees a clean separation between presentation, business rules, and data persistence. It delivers a fast, transparent, and dependable maintenance tracking workflow for residents and society administrators.
