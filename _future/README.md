# Deferred Work

Multi-day efforts that were intentionally deferred because each warrants its own focused planning + implementation session.

Each file in this folder is a self-contained brief: scope, why it was deferred, schema/API sketch, and acceptance criteria. They can be picked up in any order.

> Cleared 2026-05-29. Prior briefs (announcements read-receipts, NPS, messaging, per-line refund clawback, and the audit-prove follow-up sets) were removed on request; they remain recoverable from git history if needed.

## Index

| File | Feature | Estimated effort |
|---|---|---|
| `apps-server-router-modularization-and-tests.md` | Split the ~14 oversized `apps/server` routers into folder-modules (admin 1047, customer-profiles 972, payments 922, …) — ungated by CI today — and add unit tests for the high-value untested routers (~4/33 covered) | 3–7 days |

## Conventions for these briefs

Each brief follows the same shape:
1. **Problem** — what stub or capability is missing today
2. **Why deferred** — what makes it larger than a Tier 2 backend extension
3. **Scope** — files, tables, procedures expected to land
4. **Out of scope** — explicit non-goals
5. **Acceptance criteria** — concrete signals the work is done

When a brief is implemented, move it from this folder to `docs/features/` (or delete it if no historical value).
