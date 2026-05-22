# NPS — Net Promoter Score module

## Status (2026-05-22)

**Parked. Mobile apps now own NPS collection.**

The Reports-page NPS tile that previously showed `—` was **removed** in the pre-launch hardening pass (see commit `2fa204e3`). The dashboard grid dropped from `xl:grid-cols-6` to `xl:grid-cols-5`. The full backend + dashboard restoration plan below is still the recipe — only the **survey UI section** changes (mobile, not web).

## Problem

When this brief was written, the dashboard had an NPS tile but no data behind it. After audit it became clear NPS belongs on the mobile surface (members answer the 0–10 prompt in-app on phones, not in the franchise dashboard). The dashboard is the **aggregation/visualization** surface — not the collection surface.

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

### Frontend — member (MOBILE, not web)

The member-facing prompt is delivered by the **iOS + Android apps**, not the web dashboard. Mobile owns:
- Trigger timing (post-class, post-package, periodic) — coordinate with the trigger integration below
- The 0–10 score slider + optional free-form follow-up text
- Anti-fatigue UX (don't ask twice within `cooldownDays`)
- Sending the response to `client.nps.submitResponse` (or a REST endpoint if mobile doesn't use oRPC)

The web dashboard reads aggregated NPS for admin reporting only; admins do not see individual member responses unless they navigate to the feedback page.

### Frontend — admin (web dashboard)

`apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx`:
- Restore the NPS KPI tile (removed in commit `2fa204e3`)
- Bring grid back to `xl:grid-cols-6`
- NPS KPI tile reads from `analytics.getNpsScore`; sparkline from `analytics.getNpsSeries`

NEW page `_layout/feedback/nps.tsx`:
- Trigger configuration (toggle each trigger type, customize prompt text shown on **mobile**)
- Response feed with score, category, follow-up text, source context link
- Distribution chart (promoters / passives / detractors over time)

### Reports module integration

Update `analytics.getDashboardKpis` to surface `npsScore` (Tier 3A left this as `—`).

## Out of scope

- Sentiment analysis on follow-up text
- Cross-tenant NPS benchmarking
- Email-based surveys (in-app prompt only for v1)

## Acceptance criteria

- [ ] Admin can configure NPS triggers per org (web dashboard)
- [ ] After a completed sale or appointment, the customer sees a prompt **in the mobile app** next time they open it
- [ ] Cooldown is honored — no customer is asked twice within `cooldownDays`
- [ ] Reports page NPS tile is **restored** and shows real value + real sparkline (grid back to `xl:grid-cols-6`)
- [ ] Admin can drill into the feedback page and see individual responses with context
- [ ] `bun verify:migrations` passes, `bun check-types` passes

## Coordination needed before kickoff

- Mobile team commits to a survey UI ship window
- Decide auth model for the mobile `submitResponse` call (member-token vs Better-Auth session)
- Decide whether trigger logic lives entirely server-side (recommended) or partly in the mobile app
