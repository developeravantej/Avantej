# Reports — Scheduled email delivery

## Problem

The Reports page header has a "Schedule Email" button currently disabled. Users want recurring email digests (weekly, monthly) of the report PDF to themselves and stakeholders.

## Why deferred

- Requires a cron-style scheduler (the Worker has Cron Triggers, but the schedule registry needs to be a persisted resource)
- Requires the PDF renderer to exist first (see `reports-pdf-export.md`) — emailing a PDF you can't render is pointless
- Requires email delivery infra — Resend is already a project dependency, but no scheduled-email pattern exists yet
- Requires a settings UI for users to manage their schedules

## Scope

### Schema (control-panel DB, not tenant — schedules are per-user)

```ts
// report_schedules
{
  id: uuid
  organizationId: uuid
  userId: text                   // who owns the schedule
  reportType: text               // "performance" for now
  window: text                   // "7D" | "30D" | "90D" | "YTD"
  cadence: text                  // "weekly" | "monthly"
  cadenceDay: int                // 1-7 for weekly (Mon=1), 1-31 for monthly
  cadenceHour: int               // 0-23 in user's timezone
  timezone: text
  recipients: jsonb              // array of email addresses
  isActive: boolean
  lastSentAt: timestamp | null
  nextSendAt: timestamp          // computed on save; indexed
  createdAt: timestamp
}
```

Migration on the control-panel DB (NOT tenant — these are global per-user schedules).

### Backend

`packages/services/src/report-schedules.service.ts` (new):
- `createSchedule`, `updateSchedule`, `deleteSchedule`, `listSchedules`
- `computeNextSendAt(cadence, day, hour, tz)` — date math

`apps/server/src/cron/send-scheduled-reports.ts` (new):
- Cron trigger runs every 5 minutes
- Selects `report_schedules WHERE isActive AND nextSendAt <= NOW()`
- For each schedule: calls the PDF renderer, sends via Resend with the PDF as attachment, updates `lastSentAt` + recomputes `nextSendAt`
- Uses idempotency key `${scheduleId}:${nextSendAt}` to avoid double-send if the cron retries

`wrangler.toml`:
- Register the cron trigger `*/5 * * * *`

### Frontend

`apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx`:
- Enable the Schedule Email button → opens a `<Dialog>` listing the user's existing schedules + a "+ New schedule" form
- Form fields: cadence (radio Weekly/Monthly), day-of-week or day-of-month, time, timezone (default user's browser tz), recipients (chip input, validated email format)
- Wire to `client.reportSchedules.create / update / delete / list`

## Out of scope

- Branch managers receiving auto-scoped reports (only the report owner's data is mailed for now)
- HTML-body reports (PDF attachment only in v1)
- Slack / Teams delivery channels — Resend email only

## Acceptance criteria

- [ ] User can create a schedule from the Reports page UI
- [ ] Cron fires within 5 minutes of `nextSendAt` and delivers an email with the PDF attached
- [ ] Each schedule sends at most once per `nextSendAt` window (idempotency holds even if cron retries)
- [ ] User can pause/resume/edit/delete schedules
- [ ] `lastSentAt` updates after each successful send; `nextSendAt` advances correctly across DST boundaries
- [ ] If PDF render fails, the schedule logs an error but does NOT advance `nextSendAt` (so it retries next cron)
- [ ] `bun check-types` and `bun verify:migrations` pass
