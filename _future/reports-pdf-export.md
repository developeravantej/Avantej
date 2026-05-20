# Reports — PDF export

## Problem

The Reports page header has a "PDF" button that is currently disabled. CSV export landed in Tier 3B, but PDF is materially harder: it needs a server-side renderer.

## Why deferred

- CSV is just `Blob + URL.createObjectURL` (client-side, no infra) — PDF cannot be generated cleanly in the browser without an embedded chrome (jsPDF produces ugly output for charts; html2canvas + jsPDF blows up the bundle and produces raster-only PDFs).
- A server-rendered PDF requires either:
  - Headless Chrome (Puppeteer / Playwright) — heavyweight, won't run inside Cloudflare Workers
  - A dedicated PDF service (Browserless, react-pdf via a Node container, etc.)
- The server is on Cloudflare Workers, which constrains the renderer choice — we cannot just `apt install chromium`.

## Scope

### Architecture decision (do this first)

Pick one of:
1. **`@react-pdf/renderer`** — Node-compatible. Build PDF layouts as React components. Run inside a long-lived Worker via `nodejs_compat` flag, OR in a separate Node container fronted by a Worker.
2. **Browserless.io** (or self-hosted Puppeteer) — POST the current report HTML to a rendering service, receive PDF back.
3. **PDFKit** — pure-JS, works in Workers, but you draw primitives by hand (no HTML/CSS).

Recommendation: `@react-pdf/renderer` in a dedicated Node service deployed to Render or Fly.io, called via an oRPC action.

### Backend

`packages/services/src/reports.service.ts` (new):
- `renderReportPdf(input: { organizationId, window, kpis, revenueSeries, topTrainers, branchRevenue }) → Buffer`

`apps/server/src/routers/reports-pdf.ts` (new, server-only because of large dep):
- `reports.exportPdf({ organizationId, window })` — gathers all KPI + series data server-side (re-using the analytics functions), renders with the chosen library, returns a `{ url: string }` to an R2-stored PDF (signed for ~5 min).

### Frontend

`apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx`:
- Enable the PDF button.
- On click, call `client.reports.exportPdf({ ... })`, get back a URL, trigger a window.location.href download.
- Loading state: spinner inside the button while the action runs (server-side render can take 2–5 seconds).

### Storage

- Cloudflare R2 bucket `report-exports` with 24-hour expiry policy.
- Signed URLs scoped to the requesting org member.

## Out of scope

- Per-template customisation (logo, branding) — defer to v2
- Multi-page composer-style report builder (Design 3 from the mockups)
- Direct email of the PDF — covered by `reports-scheduled-email.md`

## Acceptance criteria

- [ ] Clicking PDF on Reports produces a downloadable PDF within 5 seconds
- [ ] PDF contains: header (org name + window + generated date), all 6 KPI tiles with sparkline images, revenue area chart, top-trainers table, revenue-by-branch table
- [ ] Sparklines render correctly (not as `—`)
- [ ] PDF is paginated cleanly — no content cut off
- [ ] The same data shown in the web UI matches the PDF byte-for-byte
- [ ] Signed R2 URL expires within 24 hours and is single-org-scoped
- [ ] `bun check-types` passes
