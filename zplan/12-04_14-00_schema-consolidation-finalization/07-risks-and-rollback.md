# Risks, Open Questions, and Rollback Strategy

---

## Schema correctness findings from revision 2 review

These were discovered during the schema re-review on 2026-04-12. All three are addressed in the revised plan.

### Finding 1 (FIXED in Phase 1): `cancelSalesOrder` accepts `refundAmount` but never writes it

**Severity:** High — silent data corruption on partial refunds.

`packages/services/src/sales-order.service.ts:167` declares `refundAmount: number` in the parameter type, and callers pass real values, but the implementation never writes it anywhere. The legacy `cancelled_sales` table had `cancelled_amount integer NOT NULL`; the consolidated `sales_orders` schema dropped that column without replacement. The `cancelledSales` router returns `cancelledAmount: row.totalAmount` which is correct only for full cancellations.

**Fix (Phase 1 Task 1.1–1.3):**
- Add `cancelledAmount integer` to `sales_orders` schema
- Persist `refundAmount` in `cancelSalesOrder`, with range validation (0 ≤ refund ≤ totalAmount)
- Return `row.cancelledAmount ?? row.totalAmount` from the router (fallback for pre-backfill rows)

**Coverage (Phase 4 Task 4.1b):** Three new unit tests.

### Finding 2 (FLAGGED, NOT FIXED): `packages.appointment_type` and `price_per_session` silently dropped

**Severity:** Medium — data loss for packages whose matched service didn't carry equivalent configuration.

The legacy `packages` table had `appointment_type`, `price_per_session`, and `max_clients_per_session`. The migration only copies `session_count`, `expiry_days`, `expiry_date`. If a package had `appointment_type = 'semi_private'` but the matching service had `type = 'private'` (the schema default), the semi_private classification is lost.

**Partial mitigation in Phase 1 Task 1.5 Section 3b:** The SQL migration opportunistically backfills `services.type` from `packages.appointment_type` where the service is still at the default (`type = 'private'`), and `services.price` where the service has `price IS NULL`. This is a heuristic — it doesn't clobber deliberately-configured services but catches the common case of services that were never explicitly set up.

**What it doesn't cover:**
- Services explicitly set to `type = 'private'` that should be `'semi_private'` — clobbered
- Services with a non-null price that doesn't match the package's `price_per_session` — the service wins, package value lost
- `packages.max_clients_per_session` — not copied at all (services have their own `maxAttendees`)

**Action:** Document in PR description. For dev seed data this is fine. Before running against any real tenant, run a pre-flight query listing all packages with their `appointment_type`/`price_per_session` and compare against the matched service.

### Finding 3 (RESOLVED — Option A): `appointment_clients.package_assignment_id` rename

**Severity:** Medium — breaks per-client credit tracking in group classes.

**Decision:** Option A. User confirmed group classes can have multiple clients each drawing from their own pack, so per-client credit tracking at the `appointment_clients` level is required.

**Fix:** The column is renamed from `package_assignment_id` to `package_instance_id`, legacy UUID values are NULLed (they pointed at the dropped `package_assignments` table), and a new FK is added to `package_instances.id`.

**Implementation:**
- Source schema updated in Phase 1 Task 1.7 (`packages/db/src/schema/tenant/appointment-clients.ts`)
- SQL migration Section 5.5 in `0010_schema_consolidation.sql`
- Verification in Phase 2 Task 2.5 step 5h
- Check 6 of `preflight-checks.sql` reports how many rows will be NULLed (informational)

**Residual risk:** Any app code that still reads/writes `packageAssignmentId` must be updated to `packageInstanceId`. Phase 1 Task 1.7 includes a grep to find these callers.

**Data loss acknowledged:** All historical per-client package-usage data is wiped. Acceptable per user confirmation (mock data only).

---

## Open questions

### Q1: Should `package_instances.service_id` become NOT NULL in this branch?

**Status:** Yes — it's already in the schema source as `.notNull()`.

**Risk:** If any pre-existing `package_instances` row has `package_id` that doesn't map to a matching service (name + branch mismatch), the data migration will skip it and `service_id` will stay NULL. Then `db:migrate` fails on the NOT NULL constraint.

**Mitigation:** Phase 2 Task 2.3 step 3 runs a pre-flight check:
```sql
SELECT COUNT(*) FROM package_instances WHERE service_id IS NULL;
```
If non-zero, stop and investigate before running `db:migrate`. Options:
- Delete the orphan instances (if they're test data)
- Hand-create a matching service and re-run the migration script
- Make `service_id` nullable (not recommended — defers the problem)

**Decision:** Keep NOT NULL. Handle orphans case-by-case during Phase 2.

---

### Q2: ~~Should `appointment_clients.package_assignment_id` be dropped?~~ **RESOLVED**

Superseded by Finding 3 / Option A above. The column is **renamed** (not dropped) to `package_instance_id` and gets a new FK to `package_instances`. See Finding 3 for details.

---

### Q3: Should `migrate-tenant.ts` be updated in this branch or a follow-up?

**Status:** See Phase 4 Task 4.9. Recommendation: defer to a follow-up unless new tenants are expected this week.

**Risk:** Any tenant DB provisioned after this branch ships and before the follow-up lands will have the pre-consolidation schema. They'll need a manual cleanup when the follow-up lands.

**Mitigation:** Track the follow-up as a linked issue in the PR description. Pause new-tenant provisioning on the Customer-app branch if possible.

---

### Q4: What happens to any frozen tenant databases that don't get migrated?

**Status:** Depends on whether any non-dev tenants exist. Customer-app is a feature branch — probably no production tenants on it yet. Confirm with the team.

**Risk:** If a production/staging tenant DB hasn't been migrated and the Customer-app branch merges to main, users of that tenant hit broken reads immediately after deployment.

**Mitigation:** Before merging, list all tenant DBs (query `control_panel.organizations`) and run `migrate-schema-consolidation.ts` against each. Phase 2 only covers dev — a production rollout procedure would be a separate, more careful plan.

**In scope for this plan:** Dev only. Production/staging rollout is deferred.

---

## Risks

### R1: The data migration script hits a name conflict (two packages with the same name)

**Scenario:** Step 1 of the script matches packages to services by `(name, branch_id)`. If two packages in the same branch share a name, or if two services in the same branch share a name, the matching is ambiguous.

**Likelihood:** Low (names should be unique per branch by convention), but not enforced at the DB level.

**Mitigation:** Run the script in `DRY_RUN=1` mode first (Phase 1 Task 1.3). Dry-run reports which packages matched to which services. If any package shows up with multiple candidates, resolve manually before live-running.

---

### R2: Duplicate cancellation numbers block the unique constraint

**Scenario:** The legacy `cancelled_sales` table had its own `cancellation_number` column. If two rows had the same number (data quality bug), copying them to `sales_orders.cancellation_number` would violate the new unique constraint.

**Likelihood:** Low — the legacy generator is sequential (`CAN-YYYYMMDD-NNNN`). But code-generated uniqueness is not database-enforced uniqueness.

**Mitigation:** Phase 2 Task 2.3 step 4 runs a pre-flight grouping query to find duplicates before `db:migrate`.

---

### R3: The Drizzle migration generator produces unexpected SQL

**Scenario:** drizzle-kit diffs the source schema against `0009_majestic_switch.sql` and produces a migration. It's possible the diff is wrong (e.g. it renames a column we wanted to drop-and-add, or vice versa).

**Likelihood:** Moderate — drizzle-kit is reliable for simple cases but can surprise on renames.

**Mitigation:** Phase 2 Task 2.3 includes a mandatory manual review. If anything looks wrong, discard the generated file and either (a) fix the schema source or (b) write the migration by hand (risky — drizzle-kit hash tracking can fight you).

---

### R4: The frontend instances page fallback path masks bad data

**Scenario:** Phase 3 Task 3.2 uses `serviceNameById.get(item.serviceId) ?? fallback`. If the service name lookup fails for a row (because the service was hard-deleted or archived-out-of-query), the row shows a UUID slice. This LOOKS like the old behaviour and might be mistaken for "working as before."

**Mitigation:** During Phase 5 Journey 2c, check specifically for fallback-path rows. If any exist, each one is a data hygiene issue to investigate.

---

### R5: The cancelled-sales router is now a thin alias — response shape may drift

**Scenario:** The router returns a mapped response shape to preserve backwards compatibility with the frontend page. If the page reads fields not present in the alias (or expects different types), the UI silently breaks.

**Mitigation:** Phase 5 Journey 3 specifically exercises this path. Check network tab response against what the page reads (grep `apps/web/src/routes/.../cancelled-sales/view.tsx` for field accesses).

---

### R6: Test isolation breaks when integration tests run against a migrated DB

**Scenario:** Integration tests share the dev tenant DB. Multi-test interference could appear if the consolidation changed how fixtures clean up.

**Mitigation:** Phase 4 Task 4.2 catches this. If tests are flaky post-migration, look at `apps/server/src/tests/helpers/fixtures.ts` and the cleanup scripts.

---

## Rollback strategy

### Per-phase rollback

| Phase | Rollback cost | How |
|---|---|---|
| Phase 1 | Free | `git checkout` the three modified source files and the new SQL migration file. No DB state changed. |
| Phase 2 before Task 2.4 (migration apply) | Free | Nothing written to DB. Delete the Neon backup branch via `neon branches delete`. |
| Phase 2 after Task 2.4 | **Single command** | `neon branches reset --project-id <id> --branch main --to schema-consolidation-backup-2026-04-12` — atomic rollback to the backup branch state. Any work done AFTER the backup is lost (but Phase 2 is the first thing to touch the DB after the backup, so nothing else should be lost). |
| Phase 3 | Free | `git checkout apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` |
| Phase 4 | Free | Tests and seed scripts are non-destructive to DB state (seeds insert, tests use fixtures) |
| Phase 5 | Free | Manual UI — cleanup lists at the bottom of Phase 5 doc |

### Full-branch rollback

If the plan fails catastrophically and the branch needs to be abandoned:

1. Roll back the dev DB: restore the Neon snapshot from Task 2.1
2. `git checkout main` on Customer-app workspaces
3. Document what failed and why in the branch's PR description
4. Open an incident ticket if any data was lost

### What CANNOT be rolled back

- **Production tenant data** (not applicable to this plan — we're dev-only)
- **Neon snapshots older than the retention window** — make sure the snapshot from Task 2.1 is on a retention plan that keeps it for at least a week

---

## Known-deferred work (flagged in scope, not done in this plan)

| Item | Why deferred | Tracking |
|---|---|---|
| Update `packages/db/src/migrate-tenant.ts` for new tenant provisioning | Out of strict scope (packages/db), low urgency | Follow-up issue |
| ~~Drop `appointment_clients.package_assignment_id`~~ | RESOLVED — renamed to `package_instance_id` with re-FK in Phase 1 Task 1.7 | — |
| Update `apps/native` to stop calling `orpc.packages.*` and pass `serviceId` | Native app is a separate branch | Separate plan |
| Make `services.categoryId` NOT NULL | Requires backfill of NULL categories first | Separate follow-up |
| Fix doc drift in `docs/SCHEMA_CONSOLIDATION.md` | Non-blocking | Same branch or follow-up |

---

## Green-light criteria for merging this branch

All must be true:

- [ ] Phases 1–5 complete
- [ ] All checklists in each phase exit document marked done
- [ ] `bun check-types` green across the monorepo
- [ ] `bun check` (Biome) green
- [ ] Server test suites green (unit + integration)
- [ ] Web test suite green
- [ ] Phase 5 journeys manually walked through by a human reviewer, recorded in PR description
- [ ] Neon snapshot from Task 2.1 recorded in PR description
- [ ] Follow-up issues filed for deferred items (Q3, Q2 if deferred, native app, migrate-tenant.ts)
- [ ] PR description explicitly calls out that `apps/native` is not safe on this branch and references the separate native-app branch plan
