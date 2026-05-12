# Schema Drift Audit — Pass 1

**Auditor:** schema-drift-auditor
**Date:** 2026-05-07

## Summary

The plan claims "No schema changes — both tables already exist with correct indexes." This is verified correct.

## Verified Schema Facts

### `service_category_config` table
File: `packages/db/src/schema/tenant/service-category-config.ts`

| Column | Type | Nullable | Default | Plan claim | Status |
|---|---|---|---|---|---|
| `id` | uuid | NO | random | not mentioned | OK |
| `categoryId` | uuid | NO | — | referenced | OK |
| `defaultDuration` | integer | YES | null | `config.defaultDuration` | OK |
| `defaultMaxAttendees` | integer | YES | null | `config.defaultMaxAttendees` | OK |
| `requireAdvanceBooking` | boolean | NO | false | `config.requireAdvanceBooking` | OK |
| `minAdvanceHours` | integer | YES | null | `config.minAdvanceHours` | OK |
| `enableCancellationWindow` | boolean | NO | false | `config.enableCancellationWindow` | OK |
| `cancellationCutoffHours` | integer | YES | null | `config.cancellationCutoffHours` | OK |
| `bufferTimeMinutes` | integer | NO | 0 | `config.bufferTimeMinutes` | OK |

**Buffer time unit:** Integer **minutes** (column name `buffer_time_minutes`). Plan correctly references minutes throughout. No unit drift.

**Index:** `service_category_config_category_idx` on `categoryId` exists.
**Uniqueness:** `categoryId` has `.unique()` constraint — 1:1 relationship with serviceCategories enforced.

### `service_members` table
File: `packages/db/src/schema/tenant/service-members.ts`

| Column | Type | Nullable | Default | Plan claim | Status |
|---|---|---|---|---|---|
| `id` | uuid | NO | random | — | OK |
| `serviceId` | uuid | NO | — | FK to services | OK |
| `memberId` | uuid | NO | — | FK to members | OK |
| `isPrimary` | boolean | NO | false | mentioned in plan | OK |
| `createdAt` | timestamp | NO | now | — | OK |

**Junction uniqueness constraint:** `service_members_unique_idx` on `(serviceId, memberId)` — composite unique. Plan claims "correct indexes" — VERIFIED.

**Indexes present:**
- `service_members_service_idx` on `serviceId` — CONFIRMED (plan references this for query performance)
- `service_members_member_idx` on `memberId` — CONFIRMED

### `member_profiles` table
File: `packages/db/src/schema/tenant/member-profiles.ts`

Column `displayName` is `text` nullable. The plan's `listForService` fallback `displayName ?? r.memberId` is type-safe.

## Findings

### CLEAR — No schema drift
All tables, columns, FKs, and indexes are exactly as the plan describes. The `bufferTimeMinutes` column is integer minutes (not a buffer time unit enum or float). No schema changes are required.

### MINOR — `bufferTimeMinutes` null vs 0 discrepancy in detail dialog
The plan renders `config.bufferTimeMinutes > 0 ? \`${config.bufferTimeMinutes} min\` : "None"`. The actual schema column has `DEFAULT 0 NOT NULL` so the value returned from `getByCategoryId` for `bufferTimeMinutes` will never be `null` — it will be 0. However, the state type in `service-category-detail-dialog.tsx` declares `bufferTimeMinutes: number | null` to match the API response type. The router always returns the row from `.returning()` which mirrors the schema — so `bufferTimeMinutes` will be `number` (0 minimum), not null. The `> 0` check in the plan is correct. No fix needed, but implementor should be aware the API won't return `null` for this field.

### CLEAR — No withTimezone gap
The `service_members.createdAt` and `service_category_config.createdAt/updatedAt` do NOT have `{ withTimezone: true }`. The project-wide convention (from Phase 2S memory) requires `{ withTimezone: true }` — but this is existing code and the plan correctly scopes no schema changes. Not a plan drift issue.
