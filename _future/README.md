# Deferred Work

Features identified during the dashboard redesign (May 2026) that were intentionally deferred because each is a multi-day effort warranting its own focused planning + implementation session.

Each file in this folder is a self-contained brief: scope, why it was deferred, schema/API sketch, and acceptance criteria. They can be picked up in any order.

## Index

| File | Feature | Estimated effort |
|---|---|---|
| `announcements-read-receipts.md` | Full ack tracking subsystem (views, ack counts, read rate) | 3–5 days |
| `reports-pdf-export.md` | Server-side PDF report generation | 2–3 days |
| `reports-scheduled-email.md` | Cron-driven scheduled report emails | 3–4 days |
| `nps-module.md` | NPS survey schema + member flow + reporting | 5–7 days |
| `messaging-system.md` | Internal messaging — powers customer bulk Send Message | 2+ weeks |

## Conventions for these briefs

Each brief follows the same shape:
1. **Problem** — what stub or capability is missing today
2. **Why deferred** — what makes it larger than a Tier 2 backend extension
3. **Scope** — files, tables, procedures expected to land
4. **Out of scope** — explicit non-goals
5. **Acceptance criteria** — concrete signals the work is done

When a brief is implemented, move it from this folder to `docs/features/` (or delete it if no historical value).
