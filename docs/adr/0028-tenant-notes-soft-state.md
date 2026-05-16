# ADR 0028 — Tenant Notes as Soft-State, Append-Only Audit

Date: 2026-05-17
Status: Accepted

## Context

Plan F.1 adds a Notes tab on each tenant drill-in. Avantej platform ops
needs a place to capture context that doesn't fit an existing field:
"customer prefers email over phone", "billing dispute pending — see
ticket #4123", "churn risk — competitor demo scheduled". This is
"soft-state" — useful but not load-bearing on any business rule.

Two design questions:

1. **Where do notes live?** Dedicated `tenant_notes` table vs. `jsonb`
   column on `organizations`.
2. **Are notes mutable forever, edit-window, or write-once?**

## Decision

### Storage: dedicated `tenant_notes` table

```sql
CREATE TABLE tenant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
CREATE INDEX tenant_notes_org_idx ON tenant_notes (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tenant_notes_pinned_idx ON tenant_notes (organization_id, is_pinned, created_at DESC) WHERE deleted_at IS NULL;
```

### Edit window: 1 hour edit-own, then frozen

A note's author can edit `body` / `isPinned` for 60 minutes after
`created_at`. After that, the note is frozen. Soft-delete remains
available within 1h for author OR always for super_admin (audit
integrity vs. footgun balance).

## Why dedicated table over `jsonb`

- **Indexability.** ILIKE/full-text on a column is cheap; on `jsonb`
  values you need GIN indexes and the query plan is murky. F.2 needs
  to search notes globally ("find me all tenants with notes mentioning
  'PII'"); jsonb makes that O(n) full-org-scan.
- **Per-row audit.** Each note row has its own `created_at`,
  `author_user_id`, and audit-log target. With `jsonb` you audit the
  org row, not the note — the audit trail loses granularity.
- **Soft delete.** A `deleted_at` column lets the row remain for audit
  while disappearing from the UI. With `jsonb` you'd either lose
  history on edit or grow the column unboundedly.
- **Volume bound.** A single org can accumulate hundreds of notes over
  years. `jsonb` would balloon the `organizations` row and slow every
  `SELECT * FROM organizations` (used in many places).

## Why 1-hour edit window over write-once

Pure write-once is too strict: typos and immediate corrections (~5 min
after composing) are the most common edit case. 1h covers that
ergonomically without letting ops rewrite history months later.

Pure unlimited-edit erodes the audit trail — "what did this note say
last week?" becomes unanswerable. 1h is the smallest window that covers
typo-fixes without inviting backdated rewrites.

## Consequences

- New table, new router (`platformAdminTenantsNotesRouter` with
  list/create/update/delete procs), new component (`tenant-notes-tab`).
- Every create / update / delete writes one row to the existing
  platform-admin audit log (mirrors the `platform-admin-tenants-comms`
  pattern). Updates outside the 1h window throw `FORBIDDEN` and are
  audited as well.
- `deleted_at` is checked everywhere notes are read — the partial
  indexes only cover non-deleted rows, which is what ops sees by
  default.
- 1h edit window relies on server clock — fine for Cloudflare Workers,
  which use UTC and have no client-clock injection risk.

## Alternatives considered

- **Per-org `jsonb` array.** Rejected for the four reasons above.
- **Unlimited edit, audit-log-everything.** Rejected: audit-log on
  every keystroke either becomes noise (debounced UPDATEs in audit
  log) or fragile (one big UPDATE per `body` change losing diff).
- **Per-note edit history table.** Rejected for Plan F.1 — overkill
  given the 1h window; revisit if ops asks for "show me history of
  note X".

## Open follow-ups

- F.2 will likely need a global search across notes; the
  `tenant_notes_org_idx` covers per-org scans but global will need a
  trigram or pg_trgm index. Defer until F.2 demands it.
