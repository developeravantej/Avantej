# GoHighLevel Custom Webhook Sync Design (v1)

Date: 2026-02-07
Status: Validated (Brainstorming)
Owner: Avantej Core team

## 1. Goal

Deliver a working end-to-end demo of GoHighLevel (GHL) to Avantej sync:

- GHL workflow custom webhook triggers
- Avantej backend ingests and syncs customer records
- Avantej frontend displays sync/log evidence

This v1 prioritizes reliability and observability over UI polish.

## 2. Scope (In)

- New provider-specific webhook endpoint:
  - `POST /webhooks/gohighlevel/:locationId`
- Parse GHL custom webhook payload (selected fields)
- Required field validation:
  - `contact.id` is required
  - `email` is required (missing email fails sync)
- Update existing mapped customer
- Create new customer when mapping is missing
- Soft-delete mapped customer on delete events
- Log webhook events and outcomes for demo/audit
- Add a frontend demo page to show locations, links, and sync events

## 3. Scope (Out)

- Full GHL OAuth install flow
- Full official Contact webhook schema coverage in the same release
- Dynamic custom-field mapping into first-class Avantej columns
- UI polishing

## 4. Routing and Tenant Resolution

Primary router is URL path `:locationId`, not payload:

- Example:
  - `/webhooks/gohighlevel/4Jj3DpPH6tB2thmHE1M4`

Reason:

- GHL custom payload fields are selectable and can change
- URL path remains stable even if payload shape changes

Payload `locationId` (if present) is used only for mismatch validation.

## 5. Data Model Additions

### 5.1 Control-panel DB (global)

Add table: `ghl_location_links`

- Purpose: map GHL `locationId` to Avantej `organizationId` and hold per-location webhook config
- Suggested columns:
  - `id` (uuid pk)
  - `locationId` (text unique, indexed)
  - `organizationId` (uuid, references organizations.id)
  - `webhookSecret` (text)
  - `isActive` (boolean default true)
  - `createdAt`, `updatedAt`

### 5.2 Tenant DB (per organization)

Add table: `ghl_contact_links`

- Purpose: deterministic identity link between GHL contact and internal customer
- Suggested columns:
  - `id` (uuid pk)
  - `ghlContactId` (text indexed)
  - `userId` (text; control-panel user id)
  - `customerProfileId` (uuid; tenant customer profile id)
  - `syncStatus` (text: active|deleted|error)
  - `lastSyncedAt` (timestamp)
  - `createdAt`, `updatedAt`
- Unique key:
  - `(ghlContactId)` within tenant DB

Add table: `ghl_sync_events`

- Purpose: observability + demo evidence + retry/debug support
- Suggested columns:
  - `id` (uuid pk)
  - `eventKey` (text unique) for idempotency
  - `eventType` (text: create|update|delete|custom)
  - `ghlContactId` (text indexed)
  - `email` (text)
  - `status` (text: processed|skipped|failed|deduped)
  - `errorMessage` (text nullable)
  - `rawPayload` (text JSON)
  - `createdAt` (timestamp)

### 5.3 Existing table change

`customer_profiles` soft-delete support:

- `isDeleted` boolean default false
- `deletedAt` timestamp nullable
- `deletedSource` text nullable (`gohighlevel_webhook`)

## 6. Webhook Processing Flow

1. Receive request at `/webhooks/gohighlevel/:locationId`
2. Resolve `locationId` in `ghl_location_links`:
   - not found/inactive -> fail
3. Verify signature (`x-wh-signature`) with location secret
4. Parse custom payload (tolerant parser for selected fields)
5. Extract and validate:
   - `contact.id` required
   - `email` required (must fail if missing)
   - `name`, `phone` optional
6. Build idempotency `eventKey`:
   - preferred: `locationId + contactId + eventType + updatedAt`
   - fallback: hash of canonicalized payload
7. Insert `ghl_sync_events` with `eventKey`:
   - unique conflict => return deduped success
8. Resolve/upsert customer:
   - if mapping exists: update customer core fields
   - if mapping missing: create user + customer profile + mapping
9. For delete:
   - soft-delete customer profile
   - set link status deleted
10. Mark event status and return success response

## 7. Customer Creation Rule (Unmapped Contact)

When no `ghl_contact_links` record exists:

- Create a new control-panel `user` record (or reuse by email if policy allows in implementation)
- Create tenant `customer_profiles` record for that user
- Create `ghl_contact_links` record
- Continue sync as normal

Note: email is mandatory. No email => sync fails.

## 8. Delete Rule

Delete events perform soft-delete, not hard delete:

- `customer_profiles.isDeleted = true`
- `customer_profiles.deletedAt = now`
- `customer_profiles.deletedSource = 'gohighlevel_webhook'`
- `ghl_contact_links.syncStatus = 'deleted'`

## 9. Error Handling and Statuses

- `failed_signature`
- `failed_location`
- `failed_validation` (including missing email/contact id)
- `failed_runtime`
- `skipped_unmapped_delete`
- `deduped`
- `processed`

All failures/special outcomes are persisted in `ghl_sync_events`.

## 10. Frontend Demo Page

Add route:

- `/_authenticated/go-highlevel-integration`

Show:

- Connected GHL locations (`ghl_location_links`)
- Recent sync events (`ghl_sync_events`)
- Contact links (`ghl_contact_links`)
- Simple test instructions (endpoint format + required fields)

Purpose:

- Demonstrate GHL -> backend -> frontend sync path clearly
- Provide quick troubleshooting for demo/testing

## 11. Test Plan

Unit tests:

- Payload parsing (selected-field variants)
- Required field validation
- Event key generation

Integration tests:

- Create unmapped contact => creates customer + mapping + processed event
- Update mapped contact => updates profile fields
- Delete mapped contact => soft-delete applied
- Duplicate webhook => deduped behavior, no duplicate writes
- Missing email => failed_validation

## 12. Rollout Notes

- Seed at least one `ghl_location_links` record for demo
- Configure GHL workflow custom webhook URL with location path
- Verify signature header handling in staging before demo

