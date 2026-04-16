# Google Calendar Integration — Settings & Appointment Sync

## Problem Statement

Trainers and admins need their Avantej appointments reflected in Google Calendar for scheduling visibility. Currently, appointments exist only within Avantej — trainers must manually check the app to know their schedule, and admins have no consolidated calendar view outside the platform.

## Goals & Success Criteria

1. **Settings page** — A new `/dashboard/settings/google-calendar` page where members can connect their Google account
2. **Trainer sync** — When a trainer connects, their assigned appointments sync to their Google Calendar
3. **Admin sync** — When an admin connects, ALL appointments (across accessible branches) sync to their Google Calendar
4. **Automatic push** — When appointments are created/updated/cancelled, the corresponding Google Calendar event is created/updated/deleted automatically

### Success Criteria

- [ ] Trainer can OAuth-connect Google Calendar from the settings page
- [ ] Admin can OAuth-connect Google Calendar from the settings page
- [ ] Creating an appointment creates a Google Calendar event for the assigned trainer (if connected)
- [ ] Admin sees all appointments from their scope pushed to their Google Calendar
- [ ] Updating/cancelling an appointment updates/removes the Google Calendar event
- [ ] Disconnecting removes the integration (tokens purged, future syncs stop)

## Scope

### In Scope

- Google OAuth2 consent flow (server-side)
- One-way push: Avantej → Google Calendar (create/update/delete events)
- Per-member connection storage (each trainer/admin has their own Google connection)
- Settings UI for connect/disconnect
- Sync scope: trainers see only their appointments; admins see all within their hierarchy scope

### Out of Scope

- Two-way sync (Google → Avantej webhook listeners)
- Bulk historical backfill (only new/updated appointments after connection)
- Google Workspace domain-wide delegation
- Calendar selection UI (uses primary calendar)
- Mobile app (native) integration — web dashboard only for v1
