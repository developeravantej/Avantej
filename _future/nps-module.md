# NPS — Net Promoter Score module

## Problem

The Reports page has an NPS Score KPI tile currently showing `—`. There is no NPS data anywhere in the system: no survey schema, no member-facing question flow, no score aggregation.

## Why deferred

- This is a whole new feature area, not a stub fix
- Needs schema (surveys, responses)
- Needs a member-facing survey UI (post-class, post-PT session, post-purchase, periodic)
- Needs aggregation logic (NPS = % promoters - % detractors over a rolling window)
- Needs trigger logic (when does a member get prompted?)
- Needs anti-fatigue throttling (don't ask the same member twice in 30 days)

## Scope

### Schema (tenant DB)

```ts
// nps_surveys — config rows; one per trigger type per org
{
  id: uuid
  organizationId: uuid
  triggerType: text              // "post_session" | "post_purchase" | "periodic_30d" | "manual"
  isActive: boolean
  questionText: text             // default: "How likely are you to recommend us?"
  followupText: text | null      // for low scorers: "What can we improve?"
  cooldownDays: int              // throttling: don't re-ask same customer within N days
}

// nps_responses
{
  id: uuid
  surveyId: uuid (FK)
  customerId: uuid (FK customer_profiles)
  score: int                     // 0-10
  category: text                 // "detractor" | "passive" | "promoter" — derived on insert
  followupText: text | null
  contextRef: text | null        // e.g. salesOrderId, classSlotId — what triggered this prompt
  respondedAt: timestamp
  createdAt: timestamp
}

// nps_prompts — outgoing prompts (so we know who was asked + when)
{
  id: uuid
  surveyId: uuid (FK)
  customerId: uuid (FK)
  contextRef: text | null
  promptedAt: timestamp
  respondedResponseId: uuid | null (FK nps_responses) — null until answered
  expiresAt: timestamp           // prompt times out after 7 days
}
```

Tenant migration (idempotent + regenerate bundle).

### Backend

`packages/services/src/nps.service.ts`:
- `enqueueNpsPrompt(tenantDb, { surveyId, customerId, contextRef })` — checks cooldown, inserts a prompt
- `submitNpsResponse(tenantDb, { promptId, score, followupText })` — validates prompt exists + not expired, inserts response, derives category, marks prompt responded
- `getNpsScore(tenantDb, { from, to })` — `(promoters - detractors) / total * 100`
- `getNpsSeries(tenantDb, { days })` — daily NPS over time, for Reports sparkline

`packages/api/src/routers/nps.ts`:
- Admin: `surveys.list / create / update`, `responses.list`, `getStats`
- Member: `submitResponse({ promptId, score, followupText? })`

### Trigger integration

Existing services that should call `enqueueNpsPrompt`:
- `sales-order.service.ts` after a completed sale (with `triggerType: "post_purchase"`)
- `appointment.service.ts` after a completed appointment (with `triggerType: "post_session"`)
- A daily cron for `triggerType: "periodic_30d"` selecting customers whose last response is >30 days old

### Frontend — member

Post-trigger flow:
- On the member dashboard, surface an unresponded prompt as a banner
- Or send via the platform's existing notification surface (whatever members use)
- 0-10 score slider + optional follow-up text for scores ≤6

### Frontend — admin

`apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx`:
- NPS KPI tile reads from `analytics.getNpsScore`; sparkline from `analytics.getNpsSeries`

NEW page `_layout/feedback/nps.tsx`:
- Trigger configuration (toggle each trigger type, customize prompt text)
- Response feed with score, category, follow-up text, source context link
- Distribution chart (promoters / passives / detractors over time)

### Reports module integration

Update `analytics.getDashboardKpis` to surface `npsScore` (Tier 3A left this as `—`).

## Out of scope

- Sentiment analysis on follow-up text
- Cross-tenant NPS benchmarking
- Email-based surveys (in-app prompt only for v1)

## Acceptance criteria

- [ ] Admin can configure NPS triggers per org
- [ ] After a completed sale or appointment, the customer sees a prompt next time they open the platform
- [ ] Cooldown is honored — no customer is asked twice within `cooldownDays`
- [ ] Reports page NPS tile shows real value and a real sparkline
- [ ] Admin can drill into the feedback page and see individual responses with context
- [ ] `bun verify:migrations` passes, `bun check-types` passes
