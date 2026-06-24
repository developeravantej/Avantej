# Test Strategy

_Generated from a per-feature coverage analysis. Each area lists the procedures under test, current coverage, the gaps, and the proposed specs that close them. Implemented specs (Phase 3) are a prioritized subset; the rest are documented backlog._

## Sending-domain CRUD

**Coverage:** `covered` — unit (rate-limit, audit) + integration (create/list/update/get/verify/delete) + e2e screencasts

**Procedures under test:**
- emailDomains.create (Resend domains.create + persist + rate-limit + audit)
- emailDomains.update (sender from-name / default local-part)
- emailDomains.delete (Resend domains.remove + row delete + audit)
- emailDomains.list
- emailDomains.get (live status refresh)
- emailDomains.verify (Resend domains.verify)

**Uncovered behaviors:** real-domain happy path: a domain actually transitioning to verified via live DNS (sandbox cannot).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `email-empty-state.journey.json` ⭐ | Empty-state renders for admin (no domains yet) | e2e | read-only | ready |
| `email-domain-list.journey.json` ⭐ | Domain row renders with sender, status, and DNS records | e2e | seed-row | ready |
| `email-edit-and-delete.journey.json` ⭐ | Edit sender then delete the domain | e2e | create-update-delete-test-row | ready |

## Sending-address aliases

**Coverage:** `covered` — e2e add/remove round-trip; NOTE aliases are DB-only — Resend has no per-address registration, a verified domain accepts any local-part

**Procedures under test:**
- emailDomains.addAlias (DB insert email_domain_aliases — no Resend call)
- emailDomains.listAliases
- emailDomains.removeAlias
- resolveAliasLocalPart (alias label → local-part for the sender)

**Uncovered behaviors:** actual delivery FROM an alias address landing in an inbox (real-domain blocker).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `email-aliases.journey.json` ⭐ | Add and remove a sending-address alias | e2e | create-update-delete-test-row | ready |

## Tenant-scoped sending

**Coverage:** `covered` — unit: verified-domain send, platform fallback, alias resolution, failed-send logging, capture-on-fail

**Procedures under test:**
- sendTenantEmail (verified domain → from-address, fallback, tags org_id)
- emailDomains.sendTest (admin + verified gate)

**Uncovered behaviors:** real send delivering through Resend (sandbox restricts recipients + unverified domain).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `email-send-test.journey.json` ⭐ | Send test button gating + dialog flow on verified domain | e2e | send-real-email-via-test-row | ready |

## Auth transactional email routing

**Coverage:** `covered` — unit + integration (auth-email) + e2e magic-link; tenant route then platform fallback proven in server trace

**Procedures under test:**
- dispatchAuthEmail (verify / reset / magic-link → tenant domain, platform fallback)
- renderVerificationEmail / renderPasswordResetEmail / renderMagicLinkEmail

**Uncovered behaviors:** green success leg (delivery) requires a real DNS-verified domain.

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `email-auth-tenant-routing.journey.json` ⭐ | Magic-link sign-in dispatches through tenant-aware sender | e2e | trigger-real-resend-send | ready |

## Resend webhook ingestion

**Coverage:** `covered` — unit (status mappers) + integration (svix verify, dedup, upsert, 413 body cap)

**Procedures under test:**
- POST /webhooks/resend (svix verify + dedup by svix-id + upsert email_logs)
- mapResendEventToLogStatus
- body-size cap (64 KB → 413 before verify)

## Background jobs (CF Cron)

**Coverage:** `covered` — unit-tested logic; cron dispatch itself is schedule-driven (not e2e-able)

**Procedures under test:**
- runEmailDomainRefresh (*/15 — re-poll Resend for stale pending/verifying)
- purgeOldEmailLogs (daily 04:00 — 90d/180d two-tier retention, batched)

**Uncovered behaviors:** live scheduled trigger (verified by unit tests + CF cron config, not e2e).

## DMARC progression UI

**Coverage:** `covered` — unit (parseDmarcPolicy) + e2e showing none→Monitor then quarantine→Quarantine

**Procedures under test:**
- parseDmarcPolicy (reads p= from the _dmarc TXT record)
- DmarcProgression stepper (none → quarantine → reject)

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `email-dmarc-progression.journey.json` ⭐ | DMARC progression reflects the _dmarc policy | e2e | read-only-seeded-row | ready |

## Summary

- **7** candidate specs across **7** feature areas (7 ready to author).
- Data-mutation mix: read-only=1, seed-row=1, create-update-delete-test-row=2, send-real-email-via-test-row=1, trigger-real-resend-send=1, read-only-seeded-row=1.
- ⭐ = implemented in the first wave (7).

## Product findings

_Add any behaviors discovered while authoring that are app bugs/limitations (not test issues) here, so they're surfaced rather than papered over._
