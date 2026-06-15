# ADR 0020 — Dispute Handling Workflow

Date: 2026-05-16
Status: Accepted

## Context

Stripe sends `charge.dispute.*` webhooks when a customer disputes a charge.
On Stripe Connect Standard accounts (Plan B architecture per ADR-0001), the
DISPUTE flows to the connected account, not the platform — the tenant is
responsible for evidence. But Avantej needs to know:

1. The tenant must be **notified** (Stripe's ~7-day evidence deadline is
   strict — silent disputes = lost money + a soured customer relationship).
2. Avantej ops needs **oversight** — we operate at multi-tenant scale, and a
   spike of disputes on one tenant is a signal we should reach out (fraud,
   policy issue, etc.).
3. The dispute itself must be **trackable** — across status transitions
   (warning → needs_response → under_review → won/lost/charge_refunded) and
   over time (deadlines, evidence submitted, eventual outcome).

Plan C C.2 implements this.

## Decision

Triple-delivery on every dispute event (`charge.dispute.created` / `updated` /
`closed` / `funds_reinstated` / `funds_withdrawn`):

1. **Tenant email via Resend** — sent to the org owner's auth email.
   Subject: "Dispute opened — {AMOUNT} {CURRENCY} — respond by {DEADLINE}".
   Body: dispute id, amount, reason, status, evidence deadline, deeplink to
   Stripe Dashboard. Informational events
   (`funds_reinstated` / `funds_withdrawn`) skip email — staff doesn't need
   another reminder when funds have already moved.

2. **Tenant in-app notification** (tenant DB `notifications` row) — `type:
   "payment"`, title + message with the dispute snapshot. Surfaces in the
   tenant's notification bell.

3. **Platform admin queue** (control-panel `platform_dispute_queue` row,
   UPSERT on `dispute_id`) — authoritative ops record. Status transitions
   update the same row (no duplicate rows per dispute). Drives the C.4
   admin UI Disputes tab.

Each side effect is **independently try/caught**. A Resend outage cannot
prevent the platform queue write (which is Avantej's only authoritative
copy). No exception escapes `onDisputeEvent` — the webhook handler must
always ack 200, otherwise Stripe will retry-storm us into rate limits.

**Evidence submission stays in Stripe Dashboard.** For v1, we don't build
in-app dispute response UX — the Stripe Dashboard form is well-designed and
adding our own wrapper is high-effort, low-marginal-value when the tenant
already needs Stripe access for other operations.

**Deadline tracking** uses `dispute.evidence_details.due_by` (unix
timestamp) → `deadlineAt` column on `platform_dispute_queue`. The C.4
admin UI sorts and color-codes deadlines.

## Consequences

Positive:
- Tenants get fast, multi-channel notification of disputes. The email +
  in-app belt-and-braces means single-channel outage doesn't lose the alert.
- Avantej ops has one queue to triage. Multi-tenant scale is observable:
  if tenant X suddenly has 5 disputes, the queue makes it obvious.
- Status transitions update the same row, so admin UI shows "current state"
  not "every event ever fired."
- No in-app dispute-response UI means no maintenance burden when Stripe
  changes their evidence flow.

Negative:
- Tenant must use Stripe Dashboard for evidence. Some tenants will find this
  friction (the platform-on-platform problem — they signed up for Avantej,
  why are they now logging into Stripe?). Mitigated by the deeplink in the
  email/UI making the path single-click.
- Three side effects per event = three failure modes. Independent try/catch
  mitigates but doesn't eliminate.
- `funds_withdrawn` / `funds_reinstated` events update the dispute row but
  don't email — tenant might be surprised to see Stripe debit their account.
  Mitigated by the prior `dispute.created` email warning of the possibility.

## Alternatives considered

- **Single-channel notification** (email only, or in-app only). Rejected —
  payment incidents are too important to risk a delivery gap.
- **In-app evidence submission UI.** Rejected for v1; high effort vs the
  available win (Stripe Dashboard is already production-grade).
- **Dispute row per event** instead of UPSERT. Rejected — admins want
  current state, not event history. The C.4 admin UI plus Stripe Dashboard
  event log provide history when needed.
- **Slack alerting to Avantej ops** instead of email/admin-UI. Considered;
  Slack integration is a future Plan C v2 add. v1 keeps the dependency
  surface to Resend + DB only.

## Related

- ADR-0001 — Direct Charges (defines who owns the dispute response).
- ADR-0006 — Webhook architecture (dedupe + idempotency upstream of this).
- ADR-0021 — CF Cron (no cron involvement; this is webhook-driven).
