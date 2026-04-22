## Manual verification 2026-04-21 19:02
**Trigger:** /done (placeholder — no /chrome-run was recorded)

Browser verification was performed manually via Chrome automation during the
execute session (not via /chrome-run), so no structured results file was
produced. Confirmations captured in conversation:

- `/dashboard/customers/view` — Walk-in tab removed; only Registered Customers shown.
- `/dashboard/customers/walk-in/view` — redirects to `?tab=registered`.
- `/dashboard/attendance/view` (drop-in form):
  - Walk-in toggle hides the Member User ID field entirely.
  - Shows "Display Name (optional)" with placeholder "e.g. Sarah Tan".
  - Anonymous walk-in check-in (no name) → succeeded; row shows "Walk-in" in log.
  - Named walk-in check-in ("Jane Walk-In") → succeeded; row shows "Jane Walk-In" in log.
  - "Create New Walk-in" shortcut is gone.
- Migration 0028 (`client_display_name` column) applied to tenant DB via
  `bun run scripts/migrate-existing-tenant.ts <org-id>` before named walk-in test.

If richer evidence (screenshots, network traces) is needed later, re-run via
/chrome-run.
