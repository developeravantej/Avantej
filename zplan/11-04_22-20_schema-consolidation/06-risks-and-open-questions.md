# Open Questions & Risks

## BLOCKING — Must Resolve Before Execution

### B1: `services.categoryId` is nullable — breaks category-only config inheritance

**The problem:** The entire Option A approach ("services inherit rules/commission from their category") assumes every service has a category. But `services.categoryId` is defined as:

```typescript
categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }),
// No .notNull() — this is nullable
```

And the `services.create` router accepts `categoryId: z.string().uuid().nullable().optional()`. A service with `categoryId = NULL` has no `service_category_config` to inherit.

**Decision required:** One of:

- **Option B1a — Make `categoryId` required:** Add `.notNull()` to the schema, update the create router to require it, create a "Default" category for uncategorized services, backfill existing NULL rows. This is the cleanest approach.
- **Option B1b — Allow null, skip config:** Services without a category have no commission/rules. The app layer treats this as "no restrictions, no commission." Simpler migration but less predictable behavior.

**Recommendation:** Option B1a. Add a migration step to Phase 1:
1. Create a "General" default category per branch (or one global)
2. Backfill `services.categoryId` for rows where it's NULL
3. Add `.notNull()` to the column
4. Update `services.create` to require `categoryId`

### B2: Package-only fields have no home on `services`

The `packages/view.tsx` form has 3 fields that exist on `packages` but NOT on `services`:

| Field | Current Usage | Seed Data |
|---|---|---|
| `crossUsageEnabled` | Checkbox on packages form, used in `package.service.ts` create/update | Always `false` in all seed scripts |
| `allowedServiceIds` | Accepted by packages router, stored as JSONB | Always `null` in all seed scripts |
| `autoGenerateInvoice` | On packages schema, not exposed in web form | Always `false` in seed scripts |

**Decision required:** Since all seed data shows these as `false`/`null` and no business logic reads them:

- **Drop all 3 fields entirely.** Don't migrate them to `services` or `package_instances`.
- Remove the `crossUsageEnabled` checkbox from the packages form.
- If a real need arises later, add them back with proper design.

**If the business actually uses `crossUsageEnabled`:** Add it to `services` table alongside the other new columns in Phase 1 Task 1.1. But verify with a DB query first: `SELECT COUNT(*) FROM packages WHERE cross_usage_enabled = true`.

### B3: `services.type` doesn't support `"both"` — packages `appointmentType` does

`packages.appointmentType` accepts `"private" | "semi-private" | "both"`.
`services.type` only accepts `"private" | "semi_private"` (and defaults to `"private"`).

**Decision required:** Either:
- Add `"both"` to `services.type` options
- Map `"both"` → `"private"` during migration (losing the distinction)

**Recommendation:** Add `"both"` to `services.type`. It's a text field so no enum migration needed — just update the TypeScript types and validation.

---

## Open Questions

### Q1: Should the packages page remain as a separate route?

After consolidation, "packages" are just services with `sessionCount > 0`. Options:

- **Keep `/packages/view`** as a filtered view of services (least disruptive to users)
- **Remove `/packages/view`** and add a filter/tab on the services page
- **Rename to `/services/packages`** for clarity

**Recommendation:** Keep as separate route for now (Phase 3 Task 3.4 Option B). Revisit in a future UI cleanup pass.

### Q2: What happens to existing `package_instances` rows with `packageId` but no `serviceId`?

The Phase 1 migration script (Task 1.4) must handle this. Two scenarios:

1. **Package has a matching service** (same name + branch): Map `packageId` → `serviceId`
2. **Package has no matching service**: Create a new service from the package data, then map

The migration script must handle both cases. Any `package_instances` with `serviceId = NULL` after migration indicate a bug.

### Q3: Should `service-category-form.tsx` also include Description, Display Order, and Active fields?

The real form (`service-category-form.tsx`) has Duration, Max Attendees, Rules, and Commission — but is missing Description, Display Order, and Active which the stub had. These fields exist on `service_categories` table.

**Recommendation:** Add these 3 fields to the real form during Phase 3 Task 3.2. They're simple fields that don't require architectural changes.

---

## Missing Files (Not in Original Plan)

These files reference dropped tables/routers but were not listed in any phase:

| File | Issue | Phase to Fix |
|---|---|---|
| `apps/native/contexts/purchase-flow-context.tsx` | Has `packageId` in state interface and default state | Phase 3 Task 3.7 |
| `apps/server/scripts/seed-business-data.ts` | Inserts directly into `packages` table | Phase 4 Task 4.2 |
| `apps/server/scripts/seed-app-data.ts` | Inserts directly into `packages` table | Phase 4 Task 4.2 |
| `apps/server/src/tests/unit/services/sales-order.test.ts` | Destructures `result.cancelledSale` (line 272, 278) — will break when `cancelSalesOrder` return type changes | Phase 2 Task 2.5 |
| `packages/db/src/migrate-tenant.ts` | Contains embedded raw SQL strings (not Drizzle schema) referencing dropped tables — must edit SQL strings, not schema objects | Phase 4 Task 4.5 |

---

## Risks

### R1: Native app version skew (HIGH)

**Risk:** Users on old native app versions will call `client.packages.list()` which won't exist after Phase 4.

**Mitigation:**
- Phase 4 is deployed separately after Phase 2+3 are verified
- Keep the `packages` router alive (but redirecting to services) for 1-2 release cycles
- Force-update the native app before removing the packages router entirely
- Alternatively, add a compatibility shim in the packages router that proxies to services

### R2: Data migration misses edge cases (MEDIUM)

**Risk:** The migration script (Phase 1 Task 1.4) may not correctly map all packages to services if names/branches don't match.

**Mitigation:**
- Run migration on a dev DB copy first
- Add a verification step that counts: `packages` rows vs mapped `serviceId` count on `package_instances`
- Log any unmapped packages for manual review
- Script is idempotent — can be fixed and re-run

### R3: Commission config unavailable for uncategorized services (MEDIUM)

**Risk:** After consolidation, commission config lives on `service_category_config` accessed via `service.categoryId`. If any service has `categoryId = NULL`, there's no config row to read.

**Mitigation:** Resolve Blocking Question B1 — make `categoryId` required and backfill NULLs before starting Phase 2.

### R4: `cancelSalesOrder` return type change (MEDIUM — upgraded from LOW)

**Risk:** The function currently returns `{ salesOrder, cancelledSale }`. After change, it returns just `salesOrder`. Known callers that destructure `cancelledSale`:

1. `packages/api/src/routers/cancelled-sales.ts` — router handler
2. `apps/server/src/tests/unit/services/sales-order.test.ts` — lines 272, 278

**Mitigation:** Update both files in Phase 2 Task 2.5 (added to the task's scope).

### R5: Drizzle migration ordering (LOW)

**Risk:** Drizzle auto-generated migration may order DROP statements incorrectly (e.g., dropping `packages` before dropping the FK on `package_instances.packageId`).

**Mitigation:**
- Review the generated migration SQL before running
- Manually reorder if needed
- Test on dev DB before applying to production

### R6: `migrate-tenant.ts` embedded SQL (LOW)

**Risk:** `packages/db/src/migrate-tenant.ts` contains raw SQL strings like `"cross_usage_enabled" boolean DEFAULT false NOT NULL` — not Drizzle schema objects. A developer might try to update Drizzle schema files and assume the embedded migration auto-updates.

**Mitigation:** Explicitly note in Phase 4 Task 4.5 that this file requires editing raw SQL strings. Search for all table names being dropped within the SQL template literal.
