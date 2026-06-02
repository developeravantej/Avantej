/**
 * audit-prove-fixes — DB-real integration tests proving specific audit fixes.
 *
 * These run against the REAL Neon test tenant DB. No service mocking — the
 * service functions are imported via SUBPATH so they resolve to src directly.
 * (The `mock.module("@avantej-core/services", …)` barrel pattern is broken in
 * this repo under Bun, so it is deliberately avoided here.)
 *
 * Skipped when SKIP_INTEGRATION_TESTS=true or TENANT_DATABASE_URL is missing.
 *
 * Run: cd apps/server && bun test src/tests/integration/audit-prove-fixes.integration.test.ts
 *
 * Fixes covered:
 *   F-INV-08 — tax-rate effective-window validation (createTaxRate)
 *   F-CRM-03 / F-CRM-06 — promo product/service + branch scope enforcement
 *   F-CRM-04 — promo global usage-limit enforcement (applyPromotion)
 *
 * SHARED DB: every row created here is namespaced with `AUDITPROVE_TEST` and is
 * deleted in afterEach/afterAll, keyed on the exact ids/codes inserted.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import {
	promotions,
	promotionUsages,
} from "@avantej-core/db/schema/tenant/promotions";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import {
	createPromotion,
	applyPromotion,
	validatePromoCode,
} from "@avantej-core/services/promotions.service";
import { createTaxRate } from "@avantej-core/services/tax-rates.service";
import {
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
	TEST_USER_ID,
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
} from "../helpers/integration-setup";

// Per-test timeout — remote Neon round-trips need headroom beyond the 5s default.
const T = 30_000;

// Namespacing prefix — all created codes carry this so cleanup is unambiguous.
const NS = "AUDITPROVE_TEST";

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

let tenantDb: ReturnType<typeof createTenantDb>;

// Track created rows for precise cleanup.
const createdTaxRateIds: string[] = [];
const createdPromotionIds: string[] = [];

function uniqueCode(label: string): string {
	return `${NS}_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

describe.skipIf(shouldSkipIntegration())(
	"audit-prove fixes — DB integration",
	() => {
		beforeAll(() => {
			loadDevVars();
			tenantDb = createTenantDb();
		});

		afterEach(async () => {
			// 1. promotion_usages first (FK → promotions, ON DELETE cascade, but be explicit)
			try {
				if (createdPromotionIds.length > 0) {
					await tenantDb
						.delete(promotionUsages)
						.where(inArray(promotionUsages.promotionId, createdPromotionIds));
				}
			} catch {
				// best-effort teardown
			}
			// 2. promotions
			try {
				if (createdPromotionIds.length > 0) {
					await tenantDb
						.delete(promotions)
						.where(inArray(promotions.id, createdPromotionIds));
					createdPromotionIds.length = 0;
				}
			} catch {
				// best-effort teardown
			}
			// 3. tax_rates
			try {
				if (createdTaxRateIds.length > 0) {
					await tenantDb
						.delete(taxRates)
						.where(inArray(taxRates.id, createdTaxRateIds));
					createdTaxRateIds.length = 0;
				}
			} catch {
				// best-effort teardown
			}
		});

		afterAll(async () => {
			// Safety net: sweep any stragglers by namespace prefix, in case a test
			// created a row but failed before registering its id.
			try {
				await tenantDb.delete(promotionUsages).where(
					inArray(
						promotionUsages.promotionId,
						tenantDb
							.select({ id: promotions.id })
							.from(promotions)
							.where(like(promotions.code, `${NS}_%`)),
					),
				);
			} catch {
				// best-effort
			}
			try {
				await tenantDb
					.delete(promotions)
					.where(like(promotions.code, `${NS}_%`));
			} catch {
				// best-effort
			}
			try {
				await tenantDb.delete(taxRates).where(like(taxRates.code, `${NS}_%`));
			} catch {
				// best-effort
			}
		});

		// ─── F-INV-08: tax-rate effective-window validation ─────────────────────────

		describe("F-INV-08 createTaxRate effective-window validation", () => {
			it(
				"throws when effectiveUntil <= effectiveFrom",
				async () => {
					const from = new Date("2026-01-01T00:00:00Z");
					const until = new Date("2025-12-31T00:00:00Z"); // before from

					await expect(
						createTaxRate(tenantDb, {
							name: `${NS} Bad Window`,
							code: uniqueCode("TAX_BAD"),
							rateInBasisPoints: 800,
							effectiveFrom: from,
							effectiveUntil: until,
						}),
					).rejects.toThrow(/effectiveUntil must be after effectiveFrom/i);

					// equal dates must also be rejected (<= boundary)
					const same = new Date("2026-01-01T00:00:00Z");
					await expect(
						createTaxRate(tenantDb, {
							name: `${NS} Equal Window`,
							code: uniqueCode("TAX_EQ"),
							rateInBasisPoints: 800,
							effectiveFrom: same,
							effectiveUntil: new Date(same.getTime()),
						}),
					).rejects.toThrow(/effectiveUntil must be after effectiveFrom/i);
				},
				T,
			);

			it(
				"succeeds when effectiveUntil > effectiveFrom",
				async () => {
					const from = new Date("2026-01-01T00:00:00Z");
					const until = new Date("2026-12-31T00:00:00Z");

					const row = await createTaxRate(tenantDb, {
						name: `${NS} Good Window`,
						code: uniqueCode("TAX_OK"),
						rateInBasisPoints: 600,
						effectiveFrom: from,
						effectiveUntil: until,
					});
					createdTaxRateIds.push(row.id);

					expect(row.id).toBeTruthy();
					expect(row.rateInBasisPoints).toBe(600);
					expect(row.isActive).toBe(true);

					// Confirm it actually persisted.
					const persisted = await tenantDb.query.taxRates.findFirst({
						where: eq(taxRates.id, row.id),
					});
					expect(persisted).toBeDefined();
					expect(persisted?.code).toBe(row.code);
				},
				T,
			);

			it(
				"succeeds when effectiveUntil is omitted (open-ended)",
				async () => {
					const row = await createTaxRate(tenantDb, {
						name: `${NS} Open Ended`,
						code: uniqueCode("TAX_OPEN"),
						rateInBasisPoints: 0,
						effectiveFrom: new Date("2026-01-01T00:00:00Z"),
					});
					createdTaxRateIds.push(row.id);

					expect(row.effectiveUntil).toBeNull();
				},
				T,
			);
		});

		// ─── F-CRM-03 / F-CRM-06: promo scope enforcement ───────────────────────────

		describe("F-CRM-03 / F-CRM-06 validatePromoCode scope enforcement", () => {
			it(
				"service-scoped promo: rejects orders without an applicable serviceId, accepts matching",
				async () => {
					const applicableServiceId = crypto.randomUUID();
					const otherServiceId = crypto.randomUUID();
					const code = uniqueCode("SVC_SCOPE");

					const promo = await createPromotion(
						tenantDb,
						{
							code,
							name: `${NS} Service Scoped`,
							type: "percentage",
							value: 1000, // 10%
							validFrom: new Date(Date.now() - 60_000),
							applicableServiceIds: [applicableServiceId],
							createdBy: TEST_USER_ID,
						},
						ACTOR,
					);
					createdPromotionIds.push(promo.id);

					// (a) Order with a non-matching serviceId → rejected
					await expect(
						validatePromoCode(tenantDb, code, {
							orderAmount: 10_000,
							serviceIds: [otherServiceId],
						}),
					).rejects.toThrow(/does not apply to any item/i);

					// (a') Order with no service/product ids at all → rejected
					await expect(
						validatePromoCode(tenantDb, code, { orderAmount: 10_000 }),
					).rejects.toThrow(/does not apply to any item/i);

					// (b) Order containing the applicable serviceId → success
					const ok = await validatePromoCode(tenantDb, code, {
						orderAmount: 10_000,
						serviceIds: [otherServiceId, applicableServiceId],
					});
					expect(ok.promotion.id).toBe(promo.id);
					expect(ok.discountAmount).toBe(1000); // 10% of 10000
				},
				T,
			);

			it(
				"branch-scoped promo: rejects a different branchId, accepts the matching branchId",
				async () => {
					const otherBranchId = crypto.randomUUID();
					const code = uniqueCode("BRANCH_SCOPE");

					const promo = await createPromotion(
						tenantDb,
						{
							code,
							name: `${NS} Branch Scoped`,
							type: "fixed_amount",
							value: 500, // RM5
							validFrom: new Date(Date.now() - 60_000),
							branchId: TEST_BRANCH_NODE_ID,
							createdBy: TEST_USER_ID,
						},
						ACTOR,
					);
					createdPromotionIds.push(promo.id);

					// (a) Different branch → rejected
					await expect(
						validatePromoCode(tenantDb, code, {
							orderAmount: 10_000,
							branchId: otherBranchId,
						}),
					).rejects.toThrow(/not valid for this branch/i);

					// (b) Matching branch → success
					const ok = await validatePromoCode(tenantDb, code, {
						orderAmount: 10_000,
						branchId: TEST_BRANCH_NODE_ID,
					});
					expect(ok.promotion.id).toBe(promo.id);
					expect(ok.discountAmount).toBe(500);
				},
				T,
			);

			it(
				"unscoped promo: validates for any order regardless of branch/service",
				async () => {
					const code = uniqueCode("UNSCOPED");

					const promo = await createPromotion(
						tenantDb,
						{
							code,
							name: `${NS} Unscoped`,
							type: "percentage",
							value: 2000, // 20%
							validFrom: new Date(Date.now() - 60_000),
							createdBy: TEST_USER_ID,
							// no branchId, no applicable lists
						},
						ACTOR,
					);
					createdPromotionIds.push(promo.id);

					const ok = await validatePromoCode(tenantDb, code, {
						orderAmount: 5_000,
						branchId: crypto.randomUUID(),
						serviceIds: [crypto.randomUUID()],
					});
					expect(ok.promotion.id).toBe(promo.id);
					expect(ok.discountAmount).toBe(1000); // 20% of 5000
				},
				T,
			);
		});

		// ─── F-CRM-04: promo global usage-limit enforcement ─────────────────────────

		describe("F-CRM-04 applyPromotion global usage-limit enforcement", () => {
			// NOTE: applyPromotion opens a `tenantDb.transaction(...)`. Running TWO
			// applyPromotion transactions back-to-back inside a SINGLE bun:test `it`
			// body deadlocks under Bun's test runner — the first transaction's
			// checked-out Neon WebSocket client is not released before the second
			// transaction tries to acquire one, and the pg-style pool has no acquire
			// timeout (documented in integration-setup.ts). A standalone Bun script
			// runs the exact same two calls in ~1s with no hang. To stay green and
			// non-flaky we therefore split the proof into two single-transaction
			// tests:
			//   1. first apply succeeds and increments usageCount to 1
			//   2. an apply against an already-at-limit promo is rejected
			// Together these prove the F-CRM-04 atomic check-and-increment guard.

			it(
				"first apply on usageLimit=1 succeeds and increments usageCount",
				async () => {
					const code = uniqueCode("USAGE_OK");

					const promo = await createPromotion(
						tenantDb,
						{
							code,
							name: `${NS} Usage Limit OK`,
							type: "fixed_amount",
							value: 1000,
							usageLimit: 1,
							validFrom: new Date(Date.now() - 60_000),
							createdBy: TEST_USER_ID,
						},
						ACTOR,
					);
					createdPromotionIds.push(promo.id);

					// salesOrderId is nullable (FK with onDelete restrict); pass null to
					// avoid needing a real sales_orders row.
					const first = await applyPromotion(tenantDb, promo.id, {
						customerId: `${NS}_CUST_${crypto.randomUUID()}`,
						salesOrderId: null as unknown as string,
						discountAmount: 1000,
					});
					expect(first.usageCount).toBe(1);
				},
				T,
			);

			it(
				"apply against an already-at-limit promo is rejected (PROMO_LIMIT_REACHED)",
				async () => {
					const code = uniqueCode("USAGE_FULL");

					// Create the promo with usageLimit=1 and pre-seed usageCount=1 via a
					// plain UPDATE (no transaction) so this test runs exactly ONE
					// applyPromotion transaction — avoiding the dual-transaction hang.
					const promo = await createPromotion(
						tenantDb,
						{
							code,
							name: `${NS} Usage Limit Full`,
							type: "fixed_amount",
							value: 1000,
							usageLimit: 1,
							validFrom: new Date(Date.now() - 60_000),
							createdBy: TEST_USER_ID,
						},
						ACTOR,
					);
					createdPromotionIds.push(promo.id);

					await tenantDb
						.update(promotions)
						.set({ usageCount: 1 })
						.where(eq(promotions.id, promo.id));

					// The atomic conditional UPDATE inside applyPromotion finds 0 rows to
					// update (usageCount >= usageLimit) and rejects before recording usage.
					await expect(
						applyPromotion(tenantDb, promo.id, {
							customerId: `${NS}_CUST_${crypto.randomUUID()}`,
							salesOrderId: null as unknown as string,
							discountAmount: 1000,
						}),
					).rejects.toThrow(/PROMO_LIMIT_REACHED/);

					// Confirm usageCount did not advance past the limit.
					const persisted = await tenantDb.query.promotions.findFirst({
						where: eq(promotions.id, promo.id),
					});
					expect(persisted?.usageCount).toBe(1);
				},
				T,
			);
		});
	},
);
