# Deferred Work

Features identified during the dashboard redesign (May 2026) that were intentionally deferred because each is a multi-day effort warranting its own focused planning + implementation session.

Each file in this folder is a self-contained brief: scope, why it was deferred, schema/API sketch, and acceptance criteria. They can be picked up in any order.

## Index

| File | Feature | Estimated effort |
|---|---|---|
| `announcements-read-receipts.md` | Full ack tracking subsystem (views, ack counts, read rate) | 3–5 days |
| `nps-module.md` | NPS survey schema + reporting (mobile collects, web aggregates) | 5–7 days |
| `messaging-system.md` | Internal messaging — powers customer bulk Send Message | 2+ weeks |
| `commission-splits-per-line-refund.md` | `commission_splits.salesOrderItemId` FK so partial refunds clawback only the refunded line's trainer (today uses proportional across the whole order) | 3–5 days |
| `audit-prove-a-followups.md` | 3 deferred items from May 2026 audit-prove-a runs: CPR-04 commission reversal timing policy, AC-A-06 invitation token hash-at-rest, PO-005 POS "Online" payment Stripe Checkout | 1–5 days each |

### Recently shipped — briefs removed

- ~~`reports-pdf-export.md`~~ — shipped 2026-05-22 (commit `2fa204e3`). Browser-side jsPDF + jspdf-autotable on the Reports page, not the server-side renderer the original brief planned. Server-side PDF (for cron-email attachments) was added shortly after.
- ~~`reports-scheduled-email.md`~~ — shipped 2026-05-22 (commit `2fa204e3`). `scheduled_reports` tenant table, hourly Cloudflare Cron Trigger, HTML email summary. PDF attachment landed alongside.

## Conventions for these briefs

Each brief follows the same shape:
1. **Problem** — what stub or capability is missing today
2. **Why deferred** — what makes it larger than a Tier 2 backend extension
3. **Scope** — files, tables, procedures expected to land
4. **Out of scope** — explicit non-goals
5. **Acceptance criteria** — concrete signals the work is done

When a brief is implemented, move it from this folder to `docs/features/` (or delete it if no historical value).
