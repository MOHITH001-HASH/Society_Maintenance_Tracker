# System Design Document: Society Maintenance Tracker

## 1. Introduction
The **Society Maintenance Tracker** is a web application designed to manage residential maintenance operations, track issue resolution lifecycles, publish community notices, and deliver automated notifications. This document outlines the technical design of the core modules: complaint status lifecycle modeling, overdue issue detection, photo upload processing, and the notification pipeline.

---

## 2. Complaint Status Lifecycle and Audit History Model

### 2.1 State Transition Model
Every maintenance issue follows a sequential state progression:

```
[Open] ─────────► [In Progress] ─────────► [Resolved]
```

### 2.2 Schema and Data Representation
Status changes are tracked through an append-only `statusHistory` array within the complaint document to ensure auditability:

```json
{
  "id": "TICKET-101",
  "title": "Main water line leakage in kitchen",
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
      "note": "Plumber assigned, site inspection scheduled",
      "timestamp": "2026-08-21T11:30:00Z"
    }
  ]
}
```

### 2.3 Design Considerations
1. **Traceability**: Residents and administrators can review the chronological sequence of actions, timestamps, and notes.
2. **Deterministic State Management**: Transitioning an issue to `Resolved` records the resolution timestamp and closes the active workflow.

---

## 3. Overdue Detection and Priority Management

The platform incorporates an automated overdue calculation mechanism to highlight unresolved tickets.

### 3.1 Algorithm
1. **Configurable Threshold ($T$)**: The administrator specifies an overdue threshold in days ($T$).
2. **Calculation**:
   $$\text{Age in Days} = \frac{\text{Current Timestamp} - \text{Created Timestamp}}{86,400\text{ seconds}}$$
3. **Overdue Condition**:
   $$\text{isOverdue} = (\text{Status} \neq \text{Resolved}) \land (\text{Age in Days} > T)$$
4. **Queue Ordering**:
   The administration view applies multi-tier sorting:
   - Tier 1: Overdue tickets ($\text{isOverdue} = \text{true}$) are hoisted to the top.
   - Tier 2: Priority weight ($\text{Urgent} > \text{High} > \text{Normal} > \text{Low}$).
   - Tier 3: Creation timestamp (Descending).

---

## 4. Photo Upload Handling

Photo attachments provide visual verification for reported maintenance issues.

```
[Client Interface] ──(Validation: Format & Size < 5MB)──► [Encoding / Storage Pipeline]
                                                                   │
                                                                   ▼
[UI Modal & Thumbnail Rendering] ◄──────────────────── [Persisted Asset Reference]
```

### 4.1 Implementation Pipeline
1. **Client-Side Validation**: Checks file MIME type (`image/jpeg`, `image/png`, `image/webp`) and enforces a 5 MB maximum size limit.
2. **Processing & Persistence**: Validated images are compressed and stored as Base64 data strings or managed object storage references.
3. **Rendering**: Thumbnails are displayed in complaint cards, expanding into full-resolution views when inspected.

---

## 5. Notification Architecture

Automated notifications inform users of state changes without requiring continuous manual polling.

```
[Administrative Event: Status Transition / Announcement]
                         │
                         ▼
        [Database Update & Event Emission]
                         │
                         ▼
           [Notification Dispatch Engine]
                         │
                         ▼
         [User Email Delivery / Audit Log]
```

### 5.1 Event Triggers
1. **Status Modification**: Moving a ticket between states emits a payload containing the ticket ID, new status, timestamp, and optional administrative notes to the resident's registered email.
2. **High-Priority Notice**: Announcements marked with `isImportant = true` trigger broadcast notifications to all registered residents within the society.

---

## 6. Conclusion

This architecture establishes a clear separation of concerns across presentation, domain workflows, and data storage, ensuring predictable maintenance tracking for residential communities.
