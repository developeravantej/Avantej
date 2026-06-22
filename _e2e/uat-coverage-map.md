# UAT → E2E Coverage Map

Basis: **Avantage Core MVP Readiness & UAT Sign-Off** (14 sections). Each UAT check
item becomes an e2e test asserting its *Expected Result*. Specs grouped by UAT
section; the review page mirrors the Section-14 Go/No-Go module table
(Ready / Partial / Not Ready / Blocker).

Testability legend: ✅ in-app now · 🟡 partial (needs fixture/role/setup) ·
🌐 external system (can't fully e2e in-app) · 📱 mobile · ✋ manual.

| § | UAT Section | Avantej surface | Testable | Notes |
|---|---|---|---|---|
| 1 | System Architecture | dashboard pages + API health | ✅ Core / 🌐 GHL | Core component smoke-loads; GHL lead/pipeline/webhook need GHL |
| 2 | Client Onboarding | registration form, PDF agreement, payment proof, approval queue | 🟡 | Lead conv = 🌐 GHL; form+validation+approval+activation = ✅; PDF signing = 🟡 |
| 3/4 | Client Portal | login, reset, profile/packages/balance/payments, invoice download | ✅ (client role) | Needs a client login (multi-role); invoice PDF = 🟡 |
| 5 | Session Booking | coach+client booking, **credit deduct/restore, 24h lock, burn, claim** | ✅ invariants | Strong deep material — domain rules; client side also 📱 |
| 6 | Google Calendar | OAuth connect, read/write/update/cancel, 2-way sync | 🌐 | Needs Google OAuth — defer/manual |
| 7 | Payment & Finance | offline proof upload, approval, activation, **invoice + tax** | ✅ | Online card = explicitly Post-MVP (out of scope) |
| 8 | Organizational Structure | hierarchy CRUD (Org→Region→Country→State→Location) + visibility | ✅ | branch lifecycle spec already exists in `_e2e/web/branch` |
| 9 | User Access Control | **RBAC by role + location scope; negative tests** | ✅ | Blocker-grade; multi-role + isolation specs |
| 10 | GoHighLevel Sync | staff/location/custom-field push to GHL | 🌐 | Can assert Avantej-side trigger; GHL receipt needs GHL |
| 11 | Services & Packages | categories, services, pricing, credits, multi-location | ✅ | CRUD lifecycle |
| 12 | Commission & Incentive | calc, renewals, reporting; **4 sample scenarios** | ✅ invariants | Strong deep material — known critical domain rule |
| 13 | Reporting | per-tier accuracy, filters, export, **permission controls** | ✅ | RBAC on reports |
| 14 | Go / No-Go | rollup | — | Becomes the review-page status table |

## In-app testable now (the buildable suite)
§2 (registration+approval), §3/4 (portal), §5 (booking + rules), §7 (payment/invoice/tax),
§8 (org structure), §9 (RBAC), §11 (services/packages), §12 (commission), §13 (reporting).

## Cannot e2e in-app (defer with reason in the ledger)
§6 Google Calendar (Google OAuth), §10 GHL sync + §1 GHL items (GoHighLevel),
PDF signing (§2/§3), mobile-app client flows (§3/§5), online card payments (§7 — Post-MVP).

## Naming note
The doc says "Avantage Core"; this is the same product as Avantej (fitness CRM,
GHL layer, locations/coaches/packages/credits/commission). Journeys map 1:1.
