# tsc baseline cleanup — verification

## Before/after error counts

| package | before | after |
| --- | --- | --- |
| apps/server | 56 lines emitting `error TS...` | 0 |
| apps/web | 1 (`comms.tsx:140` TS2345) | 0 |

`bun check-types` (turbo, all 8 packages) now exits 0. Raw output in `verification/plan-f-4/tsc-cleanup.txt`.

## Files modified

### Production code
- `apps/server/src/services/payment.service.ts` — added `stripePriceId` + `applicationFeeBps` to the legacy checkout-completed subscription insert. `stripePriceId` is recovered from `session.line_items[0].price.id` when available, else falls back to a tier-tagged sentinel (`price_unknown_<tier>`). `applicationFeeBps` is sourced from `TIER_LIMITS[tier].appFeeBps`. The canonical priceId is later resolved by `upsertSubscriptionFromStripe` (Stripe webhook path), so this fallback only affects the legacy code path before the webhook fires.
- `apps/server/src/routers/platform-admin-revenue.ts` — removed unused `sql` import (TS6133).
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/comms.tsx` — `createMutation` now coerces `priority`/`targetAudience` `null` → `undefined` before calling `createTemplate` (the create router input rejects `null`; the update router accepts it).

### Scripts
- `apps/server/scripts/seed-franchise-owner.ts` — added `stripePriceId` + `applicationFeeBps` to the seed subscription insert (TS2769).
- `apps/server/scripts/inspect-and-cleanup-test-data.ts` — filter out `null` entries from `testOrgs.map(o => o.subscriptionId)` before passing to `inArray` (TS2769 from nullable column type).

### Tests
- `apps/server/src/tests/integration/org.test.ts` — added `stripePriceId` + `applicationFeeBps` to subscription insert (TS2769).
- `apps/server/src/services/saas-subscription.service.integration.test.ts` — non-null assertions on `row`, `rows[0]`, `linkedOrg`, `sub`, `unchanged` after `const [row] = await db.select()...` destructures (TS18048/TS2532). The tests already implicitly assume the row exists; the `!` makes that explicit to TS without changing semantics — if a row is missing the existing field-equality `expect()` would fail anyway.
- `apps/server/src/services/webhook-dedupe.service.integration.test.ts` — same pattern (TS18048).
- `apps/server/src/routes/webhooks.routes.integration.test.ts` — same pattern (TS18048/TS2532) including `linkedOrg`.

### New file
- `apps/server/src/tests/__fixtures__/subscription.ts` — `makeSubscriptionFixture(overrides?)` helper that returns a fully-valid `subscriptions` insert payload. Authored per the brief, ready for future tests; existing call sites were patched in place rather than refactored to use it (smaller diff, less risk of regressions).

## Root cause per category

1. **TS18048 (`'row' is possibly 'undefined'`) in tests** — `const [row] = await db.select()...` always types as `T | undefined`. Tests asserted on `row.field` directly. Fixed with non-null assertions; the existing `expect(row.field).toBe(...)` semantics fail anyway if `row` is missing.
2. **TS2769 on `subscriptions` insert** — `subscriptions` schema gained two required notNull columns without defaults (`stripePriceId`, `applicationFeeBps`) in migration `0013_subscriptions_extensions.sql`. Old insert sites (legacy `payment.service.ts`, seed script, `org.test.ts`) were not updated. Added the missing fields.
3. **TS2769 in `inspect-and-cleanup-test-data.ts`** — `organizations.subscriptionId` is nullable; mapping it produced `(string | null)[]` which `inArray` rejects. Filtered nulls.
4. **TS6133 unused import** — removed `sql` from `platform-admin-revenue.ts`.
5. **TS2345 in comms.tsx** — `TemplateEditorInput.priority` allows `null`, but `createTemplate` input does not. Coerced `null` → `undefined` before the call.

## Tests broken / re-fixed
None. No assertions were weakened or removed; only static-narrowing helpers were added (non-null assertions where the test logic already required the row to exist).

## Errors I couldn't fix
None — all errors resolved.
