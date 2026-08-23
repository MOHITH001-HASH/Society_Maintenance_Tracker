# Society Management Platform

## Features Included
- **Role-Based Dashboards**: Resident and Admin views.
- **Complaint Management Lifecycle**: Full history tracking, state transitions (Open -> In Progress -> Pending Resident Approval -> Resolved).
- **Date Filtering**: Filter complaints by Today, This Week, This Month.
- **Overdue Detection**: Highly configurable overdue threshold days in Admin Settings.
- **Photo Upload**: Supported natively via URL string inputs in the complaint form (or fully configured to use Firebase Storage if integrated).
- **Notice Board**: Top-pinned important notices broadcast to all residents.
- **Trigger Email Extension Mock**: Integrated in `src/lib/notify.ts`. When emails are "sent", they are securely staged in a `mail` Firestore collection which easily binds to the Firebase Trigger Email Extension.

## Run Locally
1. Configure `.env` with Firebase Config.
2. `npm install`
3. `npm run dev`
