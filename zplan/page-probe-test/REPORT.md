# Page Probe Report — Avantej Dashboard
**URL:** http://avantej.localhost:3021/dashboard
**Date:** 2026-05-29 MYT
**Mode:** report-only (no --fix)
**Pages tested:** Dashboard, Customers, Approvals, POS/New Sale

---

## Summary

| Category        | Total | ✅ Pass | ⚠️ Warning | ❌ Fail | 👤 Needs Human |
|-----------------|-------|---------|------------|---------|----------------|
| Navigation      | 4     | 4       | 0          | 0       | 0              |
| Action buttons  | 6     | 4       | 0          | 0       | 2 (type bug)   |
| Data displays   | 4     | 4       | 1 (SLA)    | 0       | 0              |
| Console errors  | —     | ✅ Zero on all pages | | |               |

---

## Findings

### ✅ Passing

- **[NAV-1] Dashboard** — loads, KPIs render (RM 13,784 MoM), no console errors
- **[NAV-2] Customers** — 18 customers listed, no console errors
- **[NAV-3] Approvals** — 21 pending approvals load correctly, Approve All button visible
- **[NAV-4] POS / New Sale** — Step 1 customer list loads, Member/Walk-in tabs work
- **[BTN-1] Period selectors (Today/Week/Month/Year)** — URL updates (`?period=today`), KPIs refresh correctly
- **[BTN-2] Refresh button** — present and clickable on dashboard
- **[DATA-1] Revenue KPIs** — RM 13,784 MoM revenue, 27 active members, chart renders

### ⚠️ Warnings

- **[DATA-2] 21 approvals are 17+ days old — past SLA**
  Oldest approval in queue is 17d 8h ago. Total pending value: RM 9,646. All 21 are "High" priority. Not a bug — real business data — but worth knowing if you haven't checked the queue recently.

- **[UX-1] "Verify your email" banner on Approvals page**
  The `franchisee@gmail.com` test account hasn't verified its email. Banner shows on the Approvals page. Not blocking — has a Dismiss button — but the Dismiss button has `type="submit"` (see bug below).

- **[HYDRATION] POS and Approvals show blank/Loading on first read**
  Both pages had empty body on first JS extraction. They load correctly after ~500ms. The skill's hydration poll (poll until `bodyLen > 600`) correctly handles this. No action needed in the app — just confirming the skill's fix works.

### ❌ Bugs found

**[BUG-1] `type="submit"` on non-form buttons — affects every page**

Two buttons across the whole app use `type="submit"` incorrectly:
- **Toggle Sidebar** — every page, always visible in the sidebar
- **Dismiss** (email verification banner) — Approvals page

`type="submit"` on a button outside a `<form>` is harmless in current browsers, but it's semantically wrong and could cause accidental form submission if either button ever ends up inside a `<form>` wrapper during a future refactor. Low severity but consistent across every page.

Files to check: wherever these buttons are defined in the sidebar component and the email banner component.

---

## Skill self-assessment (what this run validated)

| Skill behaviour | Result |
|---|---|
| Chrome MCP tools load in one batch | ✅ |
| Auth gate detection (bounced to dashboard, not login) | ✅ |
| Discovery JS excludes devtools buttons | ✅ after fix |
| No `location.href` in JS (privacy guard) | ✅ after fix — but hrefs in element output still triggered block; must strip hrefs from output |
| Hydration poll before extraction | ✅ works — POS and Approvals needed it |
| Console error capture | ✅ zero errors found across all pages |
| Navigation test (click → verify route loaded) | ✅ |

**One remaining skill gap:** the `read_page` tool returns hrefs with query params (`?period=...`, `?tab=payouts`) which also triggers the privacy guard if included in JS output. The fix (strip `href` from JS extraction output) is already in the skill — confirmed necessary by this run.

---

## Settled Decisions checked

From Avantej CLAUDE.md:
- ✅ Vite + TanStack Router confirmed (devtools visible, routing works)
- ✅ Better-Auth session active (no Clerk redirects)
- ✅ No Next.js patterns observed
