/**
 * Integration coverage for the tenant access gates wired into
 * orpcTenantMiddleware (C3 suspension/cancellation 403 + B4 SaaS read-only).
 *
 * The pure decision logic is unit-tested (tenant-lifecycle.test.ts,
 * require-active-saas-sub.middleware.test.ts, effective-tier.test.ts); THIS
 * test verifies the WIRING — that the middleware actually loads the org +
 * subscription and returns 403 / passes through correctly per procedure.
 *
 * Mounts the real middleware on a throwaway Hono app with a 200 stub handler.
 * getControlPanelDb(c) falls back to the singleton (test DB) when no
 * dbMiddleware is present, so the gate's reads hit the real test control-panel
 * DB. The gate runs BEFORE session/tenantDb setup, so non-blocked orgs fall
 * through to the stub (200) even without auth.
 *
 * Run: bun test src/middleware/tenant-gates.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { orpcTenantMiddleware } from "@/middleware/orpc-tenant.middleware";

const ORG_SUSPENDED = "f0000000-0000-4000-8000-0000000000a1";
const ORG_CANCELLED = "f0000000-0000-4000-8000-0000000000a2";
const ORG_ACTIVE = "f0000000-0000-4000-8000-0000000000a3";
const ORG_LAPSED = "f0000000-0000-4000-8000-0000000000a4";
const ORG_PROVISIONED = "f0000000-0000-4000-8000-0000000000a5";
const SUB_ACTIVE = "f0000000-0000-4000-8000-0000000000b1";
const SUB_LAPSED = "f0000000-0000-4000-8000-0000000000b2";

const ALL_ORGS = [
	ORG_SUSPENDED,
	ORG_CANCELLED,
	ORG_ACTIVE,
	ORG_LAPSED,
	ORG_PROVISIONED,
];
const ALL_SUBS = [SUB_ACTIVE, SUB_LAPSED];

function buildApp() {
	const app = new Hono();
	app.use("/*", orpcTenantMiddleware);
	// Stub: if the middleware does NOT block, we reach here → 200.
	app.all("/rpc/*", (c) => c.json({ ok: true }));
	return app;
}

/**
 * POST an /rpc call for `organizationId`; returns the HTTP status.
 *
 * Mirrors the REAL oRPC RPCLink wire: the procedure is in the URL PATH and the
 * body carries only input — NO `method`. The gate must derive admin-bypass +
 * write-detection from the path, so we deliberately send no method here (an
 * earlier version injected `method`, which masked a always-false bypass bug).
 */
async function callRpc(path: string, organizationId: string): Promise<number> {
	const app = buildApp();
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ organizationId }),
	});
	return res.status;
}

async function seedSub(id: string, status: string) {
	await controlPanelDb.insert(subscriptions).values({
		id,
		stripeSubscriptionId: `sub_gatetest_${id.slice(-4)}`,
		stripeCustomerId: `cus_gatetest_${id.slice(-4)}`,
		stripePriceId: "price_gatetest",
		tier: "basic",
		organizationCountLimit: 1,
		applicationFeeBps: 300,
		status,
	});
}

async function seedOrg(
	id: string,
	paymentStatus: string,
	subscriptionId: string | null,
) {
	await controlPanelDb.insert(organizations).values({
		id,
		name: `GateTest ${id.slice(-4)}`,
		slug: `gatetest-${id.slice(-4)}`,
		neonProjectId: `gatetest-neon-${id.slice(-4)}`,
		connectionString: "dummy-not-a-real-connection",
		paymentStatus,
		subscriptionId,
	});
}

async function cleanup() {
	for (const id of ALL_ORGS) {
		await controlPanelDb.delete(organizations).where(eq(organizations.id, id));
	}
	for (const id of ALL_SUBS) {
		await controlPanelDb.delete(subscriptions).where(eq(subscriptions.id, id));
	}
}

beforeAll(async () => {
	await cleanup(); // clear any leftovers from a prior failed run
	await seedSub(SUB_ACTIVE, "active");
	await seedSub(SUB_LAPSED, "canceled"); // evaluateAccess → read_only
	await seedOrg(ORG_SUSPENDED, "suspended", null);
	await seedOrg(ORG_CANCELLED, "cancelled", null);
	await seedOrg(ORG_ACTIVE, "active", SUB_ACTIVE);
	await seedOrg(ORG_LAPSED, "active", SUB_LAPSED); // lifecycle active, sub lapsed
	await seedOrg(ORG_PROVISIONED, "active", null); // admin-provisioned, no sub yet
});

afterAll(cleanup);

describe("tenant access gates (orpcTenantMiddleware)", () => {
	it("C3: suspended tenant → 403 on a write", async () => {
		expect(await callRpc("/rpc/salesOrders/create", ORG_SUSPENDED)).toBe(403);
	});

	it("C3: cancelled tenant → 403 on a write", async () => {
		expect(await callRpc("/rpc/salesOrders/create", ORG_CANCELLED)).toBe(403);
	});

	it("C3: active tenant with live sub → NOT blocked (write passes the gate)", async () => {
		expect(await callRpc("/rpc/salesOrders/create", ORG_ACTIVE)).not.toBe(403);
	});

	it("B4: lapsed sub (canceled) → 403 on a write procedure", async () => {
		expect(await callRpc("/rpc/salesOrders/create", ORG_LAPSED)).toBe(403);
	});

	it("B4: lapsed sub → READ procedure is allowed (read-only, not full block)", async () => {
		expect(await callRpc("/rpc/salesOrders/list", ORG_LAPSED)).not.toBe(403);
	});

	it("B4: billing escape hatch (subscriptions.*) is exempt even when lapsed", async () => {
		expect(
			await callRpc("/rpc/subscriptions/createCheckoutSession", ORG_LAPSED),
		).not.toBe(403);
	});

	it("C3: platform-admin recovery call (resume) on a suspended tenant bypasses the gate — by URL path, no body method", async () => {
		// The deadlock guard: an admin must be able to act ON a suspended tenant.
		// Bypass is derived from the path, NOT a body `method` (which the real
		// client never sends).
		expect(
			await callRpc("/rpc/platformAdminTenants/resumeTenant", ORG_SUSPENDED),
		).not.toBe(403);
	});

	it("B4: admin-provisioned tenant (active, no subscription) is NOT write-locked", async () => {
		expect(await callRpc("/rpc/salesOrders/create", ORG_PROVISIONED)).not.toBe(
			403,
		);
	});
});
