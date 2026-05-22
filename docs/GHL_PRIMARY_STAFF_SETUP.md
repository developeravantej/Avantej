# GHL → Avantej: assigning a lead's coach (primary_staff)

When a lead is captured in GoHighLevel, Avantej resolves the lead's coach/staff
("primary_staff") to a real Avantej member and stores it on
`customer_profiles.primary_staff_member_id`.

The **deterministic** way to do this is to send the coach's **GHL user id** in the
lead webhook. Avantej already maps that id to the member via `ghl_user_links`
(populated when staff are synced to GHL). No fragile name matching, survives
renames and duplicate names.

## Prerequisite

Coaches/staff are GHL Users created by Avantej's outbound staff sync, so each one
already has a GHL user id recorded in the tenant's `ghl_user_links` table.

## GHL workflow setup (one time)

Build a Workflow on the lead-capture form:

1. **Trigger:** Form submitted (the lead-capture form).
2. **Action — "Assign to User":** pick the coach, or use Round-Robin across
   coaches. This sets the contact owner to that coach's GHL user.
3. **Action — "Webhook":** POST to the Avantej endpoint
   `https://<your-host>/webhooks/gohighlevel/<ghlLocationId>` with auth (see
   "Webhook auth" below) and, in the custom data, add:

   | Field | Value | Notes |
   |-------|-------|-------|
   | `primary_staff_ghl_user_id` | `{{contact.assigned_to}}` | the coach's GHL user id — **authoritative** |
   | `primary_staff` | the coach's name | optional; display + last-resort fallback |

   > Verify the exact merge token in your GHL builder; whatever resolves to the
   > assigned user's id is what to map into `primary_staff_ghl_user_id`.

## Resulting webhook payload

```json
{
  "eventType": "create",
  "contact": {
    "id": "<ghl contact id>",
    "email": "lead@example.com",
    "phone": "+60...",
    "primary_staff": "Afifah Zahra",
    "primary_staff_ghl_user_id": "<coach GHL user id>"
  }
}
```

## How Avantej resolves it (already implemented)

Priority order, in `resolvePrimaryStaffMemberId` (`apps/server/src/services/gohighlevel.service.ts`):

1. `primary_staff_ghl_user_id` (alias `primary_staff_id`) → `ghl_user_links.ghl_user_id` → **active** member
2. `assigned_to` / `assignedTo` (GHL contact owner) → `ghl_user_links` → active member
3. unique case-insensitive name match of `primary_staff` against active synced staff
4. unresolved → `primary_staff_member_id` left null + a `console.warn` (raw name stays in the archived `ghl_sync_events.rawPayload`)

Only **active** members are eligible — a deactivated/suspended coach with a stale
sync row is never assigned new leads. Any synced staff role
(admin/staff/trainer) is eligible.

## Webhook auth

The webhook must satisfy the per-location secret (`ghl_branch_links.webhook_secret`)
via one of: `x-wh-signature` HMAC, `Authorization: Bearer <secret>`,
`x-webhook-secret` header, or a `?token=`/`?secret=` query param.

## Why not a GHL dropdown of coach names?

GHL `SINGLE_OPTIONS` custom fields store options as plain label strings and the
webhook returns the **label**, not a stable id — so an Avantej-managed coach
dropdown could only carry a name (fragile) or an id ugly-encoded into the label.
The "Assign to User" approach above sends the real GHL user id natively, with no
option list for Avantej to maintain. Prefer it.
