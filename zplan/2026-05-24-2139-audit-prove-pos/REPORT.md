# Audit-Prove Report — POS New Sale (`/dashboard/sales/create`)

**Date:** 2026-05-24 · **Mode:** `--page` white-box functional QA
**Session:** `zplan/2026-05-24-2139-audit-prove-pos`
**Build gate:** `bun check-types --filter web` → **PASS** (cold) · **Video:** recorded (one continuous session)

---

## 1. Build gate
`bun check-types --filter web` (cold, `.tsbuildinfo` cleared): **PASS**.
> Blind spot: the gate does NOT cover `packages/api`/`packages/services`. Notably, the `"online"` payment bug (C-13) passed the web type-check anyway because of an `as any` cast — type-checking would not have caught it regardless.

## 2. Proof video
- Video: `video/full-run.webm` (≈5 min, 4.81 MB) — one continuous session on `http://avantej.localhost:3021`.
- HTML report: `test/html` (`bunx playwright show-report test/html`) — authoritative per-step matrix + per-step traces.

### Pass/fail matrix
| Case | Type | Asserts | Result |
|---|---|---|---|
| setup | auth | login persists on `avantej.localhost:3021` | ✅ pass |
| C-load | golden | page renders | ✅ pass |
| C-03 | edge | Continue→Items disabled with no customer | ✅ pass |
| C-04 | edge | Continue→Promotions disabled with no items | ✅ pass |
| C-05 | edge | cash tendered < total blocks confirm + inline error | ✅ pass |
| C-09 | edge | promo Apply gated until items exist | ✅ pass |
| C-14 | error | walk-in + service(→package) path | ran (no soft-fail logged; verify in HTML) |
| **C-13** | **error** | **"Online (Stripe link)" → submit records a sale** | ❌ **FAIL — bug confirmed** |
| C-16 | error | `recordSale` 500 → error, stays on page | ✅ pass |
| C-01 | golden | **member** + custom + cash → receipt | ✅ pass — records sale, navigates to receipt |
| C-01w | golden | **walk-in** + custom + cash → receipt | ❌ fails — `recordSale` rejected (branch fallback, §5) |

## 3. Confirmed functional bug (P1)
**`"online"` payment method is invalid.** `payment-step.tsx:61` offers "Online (Stripe link)" → `onMethodChange("online" as any)` (`:160`). `PaymentMethod` (`types.ts:44`) and the server enum (`pos.ts:62`) only allow `cash | card | manual_transfer | bank_transfer | fpx | stripe`. Submitting with `"online"` is rejected server-side; the user is stuck on `/create` with no sale. The `as any` cast hides it from `tsc`.
**Fix options:** map `"online"` → `"stripe"` in the submit handler, OR add `"online"` to the enum + handle it, OR remove the option. Recommended: rename the card to "Stripe" and send `"stripe"`.

## 4. Other issues (from the white-box map, not all browser-tested)
- **C-14** — a walk-in can add a "Service" that silently becomes `type:"package"` (`items-step.tsx:76`) and only fails at submit ("Walk-in customers cannot purchase packages", `pos.service.ts:252`). Should be blocked client-side. `testable:true`.
- **C-17** — route guard `sales:create` (`create.tsx:9`) ≠ component `pos:create` (`pos-workflow.tsx:247`). `testable:false` (needs a non-admin role).
- **C-15** — the `non_client_member` friendly error (`pos-workflow.tsx:615`) is unreachable from this page (search only returns `role:client`). Dead path. `testable:false`.

Full map: `qa/pos-create-map.md` · cases: `qa/cases.json`.

## 5. C-01 settled — two real findings surfaced while proving the golden path

**A member cash sale succeeds** (records + navigates to the receipt — final video frames). Getting there exposed two genuine app issues, plus harness lessons:

- **P2 — Async tax vs. cash auto-tender.** Selecting Cash auto-sets "amount tendered" to the **pre-tax** total (`payment-step.tsx:108`). The default tax rate loads asynchronously; once it lands, the auto-tendered amount is below the **taxed** total → `cashOk` flips false → **Charge & Confirm silently re-disables**, and the "less than total" hint only renders on the payment step, not on Confirm. A cashier who advanced quickly is stuck with no explanation. Fix: re-derive tendered when tax resolves, or surface the shortfall on the Confirm step.
- **P2 — Walk-in branch resolution.** A walk-in has no selected customer, so `branchId` falls back to the admin's `hierarchyScopeId` (`pos-workflow.tsx:300`), which here is the **org root ("3 branches")**, not a branch — `recordSale` rejects it and the walk-in sale can't complete from this admin context. Members succeed because they carry a real branch. Fix: require/auto-pick a branch for walk-ins, or accept the org-root scope server-side.

**Harness lessons (folded into the skill/scripts):**
- Generated config must live at repo **root** (Playwright resolves `testDir` from the config's dir).
- Record on **`avantej.localhost:3021`** (cookie-scoped dev auth), not bare `localhost`.
- Set **`actionTimeout`** (15s) so one slow click can't consume the whole test budget.
- **Member selection auto-advances** to the Items step (`pos-workflow.tsx:484`) — no "Continue" click (unlike walk-in).
- Cash golden paths must **tender above the taxed total** (see the tax-timing finding above).

## 6. Fixes applied (2026-05-24)
Scope chosen: C-17, tax/tender, C-14, and walk-in (after repro). C-13 (online) left as a documented finding per request. Web type-check **green** after changes.

| Finding | Fix | File | Verified |
|---|---|---|---|
| **Walk-in 500** | Guard `walkInCustomerId` against the `"anonymous"` sentinel (it was written into a `uuid` column → invalid-uuid 500). Now `null` for anonymous walk-ins. | `packages/services/src/pos.service.ts:379` | ✅ live: walk-in cash sale now returns **200**, records `SO-20260524-000131`, navigates to receipt |
| **C-17 permission** | Route guard `sales:create` → `pos:create` (matches the server check at `pos.ts:85` + the component). | `…/sales/create.tsx:9` | ✅ type-check |
| **Tax/tender** | Keep cash tendered synced to the taxed total until the cashier edits it (`tenderedTouched` flag) — stops Confirm silently re-disabling when tax loads late. | `payment-step.tsx` | ✅ type-check |
| **C-14 walk-in package** | Disable the "Service" add-button for walk-ins (tooltip explains) — services become packages, which walk-ins can't buy. | `items-step.tsx` + `pos-workflow.tsx` (`isWalkIn`) | ✅ type-check |

**Root-cause note (walk-in):** my initial hypothesis (null `branchId` → client throw) was **wrong** — the diagnostic showed `recordSale` *did* fire and returned a server **500** (`invalid input syntax for uuid: "anonymous"`). Confirmed before fixing, per protocol.

Not committed — files changed: `pos.service.ts`, `create.tsx`, `payment-step.tsx`, `items-step.tsx`, `pos-workflow.tsx`.
