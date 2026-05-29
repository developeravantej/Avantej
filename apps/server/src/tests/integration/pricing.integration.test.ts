/**
 * Branch Pricing Integration Tests (Agent 2.2 — Phase 2 Wave 3b — J2)
 *
 * Verifies the resolution chain in `pricing.service.ts`:
 *   (a) No overrides            → falls back to services.price
 *   (b) Org-wide override       → returns override
 *   (c) Branch-specific         → wins over org-wide
 *   (d) Customer-type-specific  → wins over generic at same scope
 *   (e) Expired override        → falls through to next tier
 *
 * Self-skips when TENANT_DATABASE_URL is missing (same pattern as
 * status-history.test.ts).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
} from "../helpers/integration-setup";

import { services } from "@avantej-core/db/schema/tenant/services";
import { servicePrices } from "@avantej-core/db/schema/tenant/service-prices";
import { resolveServicePrice } from "@avantej-core/services";

loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;

let tenantDb: ReturnType<typeof createTenantDb>;

const createdServiceIds: string[] = [];
const createdPriceIds: string[] = [];

beforeAll(() => {
	if (SKIP) return;
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (SKIP) return;
	if (createdPriceIds.length > 0) {
		await tenantDb.delete(servicePrices).where(inArray(servicePrices.id, createdPriceIds));
	}
	if (createdServiceIds.length > 0) {
		// service_prices cascades on services delete, but we already cleaned up.
		await tenantDb.delete(services).where(inArray(services.id, createdServiceIds));
	}
});

async function makeService(basePrice: number | null): Promise<string> {
	const [svc] = await tenantDb
		.insert(services)
		.values({
			name: `pricing-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			duration: 3600,
			maxAttendees: 1,
			price: basePrice,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	expect(svc).toBeTruthy();
	createdServiceIds.push(svc!.id);
	return svc!.id;
}

async function addOverride(args: {
	serviceId: string;
	branchId: string | null;
	customerType: string | null;
	priceCents: number;
	effectiveFrom?: Date;
	effectiveUntil?: Date | null;
}): Promise<string> {
	const [row] = await tenantDb
		.insert(servicePrices)
		.values({
			serviceId: args.serviceId,
			branchId: args.branchId,
			customerType: args.customerType,
			priceCents: args.priceCents,
			...(args.effectiveFrom ? { effectiveFrom: args.effectiveFrom } : {}),
			...(args.effectiveUntil !== undefined ? { effectiveUntil: args.effectiveUntil } : {}),
		})
		.returning();
	createdPriceIds.push(row!.id);
	return row!.id;
}

describe("Branch Pricing — Agent 2.2 (J2)", () => {
	test("(a) no overrides → falls back to services.price", async () => {
		if (SKIP) return;
		const serviceId = await makeService(10000);
		const price = await resolveServicePrice(tenantDb, serviceId, TEST_BRANCH_NODE_ID, null);
		expect(price).toBe(10000);
	});

	test("(b) org-wide override (branch_id NULL) wins over services.price", async () => {
		if (SKIP) return;
		const serviceId = await makeService(10000);
		await addOverride({
			serviceId,
			branchId: null,
			customerType: null,
			priceCents: 8500,
		});
		const price = await resolveServicePrice(tenantDb, serviceId, TEST_BRANCH_NODE_ID, null);
		expect(price).toBe(8500);
	});

	test("(c) branch-specific override wins over org-wide", async () => {
		if (SKIP) return;
		const serviceId = await makeService(10000);
		await addOverride({
			serviceId,
			branchId: null,
			customerType: null,
			priceCents: 8500,
		});
		await addOverride({
			serviceId,
			branchId: TEST_BRANCH_NODE_ID,
			customerType: null,
			priceCents: 7000,
		});
		const price = await resolveServicePrice(tenantDb, serviceId, TEST_BRANCH_NODE_ID, null);
		expect(price).toBe(7000);
	});

	test("(d) customer-type-specific wins over generic at same branch", async () => {
		if (SKIP) return;
		const serviceId = await makeService(10000);
		await addOverride({
			serviceId,
			branchId: TEST_BRANCH_NODE_ID,
			customerType: null,
			priceCents: 7000,
		});
		await addOverride({
			serviceId,
			branchId: TEST_BRANCH_NODE_ID,
			customerType: "vip",
			priceCents: 5000,
		});
		const vip = await resolveServicePrice(tenantDb, serviceId, TEST_BRANCH_NODE_ID, "vip");
		expect(vip).toBe(5000);
		// Non-vip customer still gets the branch-generic price
		const generic = await resolveServicePrice(
			tenantDb,
			serviceId,
			TEST_BRANCH_NODE_ID,
			"member",
		);
		expect(generic).toBe(7000);
	});

	test("(e) expired override falls through to next tier", async () => {
		if (SKIP) return;
		const serviceId = await makeService(10000);
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
		// Branch-specific override that already expired yesterday
		await addOverride({
			serviceId,
			branchId: TEST_BRANCH_NODE_ID,
			customerType: null,
			priceCents: 7000,
			effectiveFrom: twoDaysAgo,
			effectiveUntil: yesterday,
		});
		// Org-wide override still active
		await addOverride({
			serviceId,
			branchId: null,
			customerType: null,
			priceCents: 8500,
		});
		const price = await resolveServicePrice(tenantDb, serviceId, TEST_BRANCH_NODE_ID, null);
		// Branch override expired → falls through to org-wide 8500
		expect(price).toBe(8500);

		// And: with NO active overrides at all, fall through to services.price
		const serviceId2 = await makeService(9999);
		await addOverride({
			serviceId: serviceId2,
			branchId: TEST_BRANCH_NODE_ID,
			customerType: null,
			priceCents: 7000,
			effectiveFrom: twoDaysAgo,
			effectiveUntil: yesterday,
		});
		const price2 = await resolveServicePrice(tenantDb, serviceId2, TEST_BRANCH_NODE_ID, null);
		expect(price2).toBe(9999);
	});
});
