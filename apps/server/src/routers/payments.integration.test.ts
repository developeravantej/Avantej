/**
 * Payments Router — DB-real integration tests.
 *
 * Strategy: Stripe SDK is mocked at the DI boundary (stripeClientOverride),
 * while ALL DB operations (tenant + control-panel) hit the REAL Neon test
 * branches via createTenantDb() and createControlPanelDb().
 *
 * Run:  cd apps/server && bun test src/routers/payments.integration.test.ts
 * Skip: set SKIP_INTEGRATION_TESTS=true  OR  leave TENANT_DATABASE_URL unset
 *
 * TEST_ORG_ID (996febce-aaad-4ded-8f47-02d2b566c8ee) is fully provisioned with:
 *   - org_country_stripe_accounts row (MY, acct_1TWwNZGk6ShaTZfV, charges_enabled=true)
 *   - A real branch in the tenant hierarchy (TEST_BRANCH_NODE_ID)
 *
 * All seeded rows use deterministic UUIDs so afterEach cleanup is reliable.
 *
 * Connection strategy (mirrors customer-profiles.integration.test.ts):
 *   - One shared `tenantDb` pool per test file (for seed/cleanup only).
 *   - `makeContext()` creates a SEPARATE small-pool tenantDb + cpDb per call so
 *     handler queries don't compete with cleanup queries on the same connection.
 *   - Pools are cheap to create; Neon free tier is fine with ~5 concurrent pools.
 */

import { describe, it, expect, beforeAll, afterEach, mock } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	makeIntegrationAdminContext,
	TEST_ORG_ID,
	TEST_BRANCH_NODE_ID,
} from "../tests/helpers/integration-setup";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";

// ─── Types ───────────────────────────────────────────────────────────────────

type TenantDb = ReturnType<typeof createTenantDb>;

// ─── Shared seed/cleanup pool (one per test file) ────────────────────────────

let sharedTenantDb: TenantDb;

/**
 * Create a small-pool control-panel DB for use inside handler contexts.
 * max:3 + idleTimeoutMillis:500 ensures connections are freed quickly between
 * test-procedure calls and afterEach cleanup queries (same pattern as
 * customer-profiles.integration.test.ts).
 */
function createContextCpDb() {
	neonConfig.webSocketConstructor = ws;
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set in .dev.vars");
	const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 500 });
	return drizzle({ client: pool, schema: controlPanelSchema });
}

/**
 * Create a small-pool tenant DB for use inside handler contexts.
 * Separate from sharedTenantDb so handler queries don't block cleanup queries.
 */
function createContextTenantDb() {
	neonConfig.webSocketConstructor = ws;
	const url = process.env.TENANT_DATABASE_URL;
	if (!url) throw new Error("TENANT_DATABASE_URL is not set in .dev.vars");
	const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 500 });
	return drizzle({ client: pool, schema: tenantSchema });
}

// ─── Test sentinels ───────────────────────────────────────────────────────────

const APPT_UUID = "a0000000-beef-4000-8000-000000000001";
const CUSTOMER_PROFILE_UUID = "a0000000-beef-4000-8000-000000000002";
const TEST_SENTINEL_NOTES = "PAYMENTS_INTEGRATION_TEST";

// ─── callProcedure helper ─────────────────────────────────────────────────────

function callProcedure(procedure: unknown, input: unknown, context: Record<string, unknown>) {
	// biome-ignore lint/suspicious/noExplicitAny: test helper — accesses internal oRPC shape
	return (procedure as any)["~orpc"].handler({ input, context });
}

// ─── Context factory ──────────────────────────────────────────────────────────

/**
 * Build a handler context. Uses fresh SMALL-POOL tenantDb + cpDb instances so
 * handler queries never compete with cleanup queries on the shared pool.
 */
function makeContext() {
	const tenantDb = createContextTenantDb();
	const cpDb = createContextCpDb();
	const baseCtx = makeIntegrationAdminContext(tenantDb);
	return {
		...baseCtx,
		honoContext: {
			get: (key: string) => (key === "controlPanelDb" ? cpDb : undefined),
		} as unknown as import("hono").Context,
	};
}

// ─── Stripe mock factory ──────────────────────────────────────────────────────

function makeStripeMock(overrides: Record<string, unknown> = {}) {
	return {
		paymentIntents: {
			create: mock(async () => ({
				id: "pi_test_integ_001",
				client_secret: "cs_test_integ_001",
				status: "requires_payment_method",
			})),
		},
		prices: {
			create: mock(async () => ({ id: "price_test_integ_001" })),
		},
		paymentLinks: {
			create: mock(async () => ({
				id: "plink_test_integ_001",
				url: "https://buy.stripe.com/integ_test",
			})),
		},
		refunds: {
			create: mock(async () => ({
				id: "re_test_integ_001",
				status: "succeeded",
				amount: 10000,
				currency: "myr",
			})),
		},
		customers: {
			create: mock(async () => ({ id: "cus_test_integ_001" })),
			retrieve: mock(async (id: string) => ({ id, deleted: false })),
		},
		setupIntents: {
			create: mock(async () => ({
				id: "seti_test_integ_001",
				client_secret: "seti_secret_test_integ_001",
				status: "requires_payment_method",
			})),
		},
		paymentMethods: {
			list: mock(async () => ({
				data: [
					{
						id: "pm_test_integ_001",
						card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2028 },
					},
					{
						id: "pm_test_integ_002",
						card: { brand: "mastercard", last4: "5555", exp_month: 6, exp_year: 2027 },
					},
				],
			})),
		},
		...overrides,
	};
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
	loadDevVars();
	if (shouldSkipIntegration()) return;
	// Single shared pool for seed/cleanup — NOT used inside handler contexts.
	sharedTenantDb = createTenantDb();
});

afterEach(async () => {
	if (shouldSkipIntegration()) return;
	await sharedTenantDb.delete(appointments).where(eq(appointments.id, APPT_UUID));
	await sharedTenantDb.delete(customerProfiles).where(eq(customerProfiles.id, CUSTOMER_PROFILE_UUID));
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Insert an appointment row via raw SQL.
 *
 * REASON: The TypeScript Drizzle schema defines `reschedule_history` with a
 * `.default([])` which causes Drizzle's `.insert().values()` to include that
 * column in the SQL even when the caller doesn't set it. The live test Neon
 * branch had that column added by migration 0074 but we keep raw SQL here as
 * a belt-and-suspenders hedge for future schema additions.
 */
async function seedAppointment(
	db: TenantDb,
	overrides: Record<string, unknown> = {},
): Promise<void> {
	const now = new Date();
	const end = new Date(now.getTime() + 60 * 60 * 1000);
	const v = {
		paymentStatus: "pending" as string | null,
		currency: "MYR" as string | null,
		stripePaymentIntentId: null as string | null,
		stripeConnectAccountIdSnapshot: null as string | null,
		stripePaymentLinkId: null as string | null,
		paymentLinkUrl: null as string | null,
		applicationFeeAmount: null as number | null,
		...overrides,
	};

	await db.execute(sql`
		INSERT INTO appointments (
			id, type, start_time, duration, end_time, branch_id, status,
			session_total, price_per_client, created_by, notes,
			payment_status, currency,
			stripe_payment_intent_id, stripe_connect_account_id_snapshot,
			stripe_payment_link_id, payment_link_url,
			application_fee_amount
		) VALUES (
			${APPT_UUID}::uuid,
			${"private"},
			${now}::timestamptz,
			${60},
			${end}::timestamptz,
			${TEST_BRANCH_NODE_ID}::uuid,
			${"confirmed"},
			${10000},
			${10000},
			${"test-user"},
			${TEST_SENTINEL_NOTES},
			${v.paymentStatus},
			${v.currency},
			${v.stripePaymentIntentId},
			${v.stripeConnectAccountIdSnapshot},
			${v.stripePaymentLinkId},
			${v.paymentLinkUrl},
			${v.applicationFeeAmount}
		)
		ON CONFLICT (id) DO NOTHING
	`);
}

function makeCustomerProfileSeed(overrides: Partial<typeof customerProfiles.$inferInsert> = {}) {
	return {
		id: CUSTOMER_PROFILE_UUID,
		notes: TEST_SENTINEL_NOTES,
		isUnclaimed: false,
		isDeleted: false,
		creditPoints: 0,
		...overrides,
	} satisfies typeof customerProfiles.$inferInsert;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) createPaymentIntent
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.createPaymentIntent [integration]", () => {
	it("skip guard: exits early when integration is off", () => {
		if (!shouldSkipIntegration()) return;
		expect(true).toBe(true);
	});

	it("returns clientSecret + paymentIntentId from Stripe mock", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb);

		const { createPaymentsRouter } = await import("./payments");
		const stripe = makeStripeMock();
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.createPaymentIntent,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		expect(result.clientSecret).toBe("cs_test_integ_001");
		expect(result.paymentIntentId).toBe("pi_test_integ_001");
		expect(typeof result.amount).toBe("number");
		expect(result.amount).toBe(10000);
		expect(result.currency).toBe("MYR");
		expect(typeof result.applicationFeeAmount).toBe("number");
	});

	it("persists stripePaymentIntentId + stripeConnectAccountIdSnapshot + applicationFeeAmount to DB", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb);

		const { createPaymentsRouter } = await import("./payments");
		const stripe = makeStripeMock();
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		await callProcedure(
			router.createPaymentIntent,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		// Re-query using the shared tenantDb to see the committed write
		const [persisted] = await sharedTenantDb
			.select()
			.from(appointments)
			.where(eq(appointments.id, APPT_UUID))
			.limit(1);

		expect(persisted).toBeDefined();
		expect(persisted!.stripePaymentIntentId).toBe("pi_test_integ_001");
		expect(typeof persisted!.stripeConnectAccountIdSnapshot).toBe("string");
		expect(persisted!.stripeConnectAccountIdSnapshot!.length).toBeGreaterThan(0);
		expect(typeof persisted!.applicationFeeAmount).toBe("number");
		expect(persisted!.currency).toBe("MYR");
	});

	it("throws NOT_FOUND for a random appointmentId", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.createPaymentIntent,
				{ organizationId: TEST_ORG_ID, appointmentId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("throws PRECONDITION_FAILED when appointment is already paid", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, { paymentStatus: "paid" });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.createPaymentIntent,
				{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
				ctx,
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 2) sendPaymentLink
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.sendPaymentLink [integration]", () => {
	it("returns paymentLinkId + paymentLinkUrl from Stripe mock", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb);

		const { createPaymentsRouter } = await import("./payments");
		const stripe = makeStripeMock();
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.sendPaymentLink,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		expect(result.paymentLinkId).toBe("plink_test_integ_001");
		expect(result.paymentLinkUrl).toBe("https://buy.stripe.com/integ_test");
		expect(result.amount).toBe(10000);
		expect(result.currency).toBe("MYR");
	});

	it("persists stripePaymentLinkId + paymentLinkUrl + stripeConnectAccountIdSnapshot to DB", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb);

		const { createPaymentsRouter } = await import("./payments");
		const stripe = makeStripeMock();
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		await callProcedure(
			router.sendPaymentLink,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		const [persisted] = await sharedTenantDb
			.select()
			.from(appointments)
			.where(eq(appointments.id, APPT_UUID))
			.limit(1);

		expect(persisted!.stripePaymentLinkId).toBe("plink_test_integ_001");
		expect(persisted!.paymentLinkUrl).toBe("https://buy.stripe.com/integ_test");
		expect(typeof persisted!.stripeConnectAccountIdSnapshot).toBe("string");
		expect(persisted!.stripeConnectAccountIdSnapshot!.length).toBeGreaterThan(0);
		expect(typeof persisted!.applicationFeeAmount).toBe("number");
	});

	it("idempotency: second call without regenerate=true does NOT call Stripe again", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, {
			stripePaymentLinkId: "plink_existing_001",
			paymentLinkUrl: "https://buy.stripe.com/existing",
			applicationFeeAmount: 100,
			stripeConnectAccountIdSnapshot: "acct_1TWwNZGk6ShaTZfV",
		});

		const { createPaymentsRouter } = await import("./payments");
		const pricesCreate = mock(async () => ({ id: "price_should_not_be_called" }));
		const paymentLinksCreate = mock(async () => ({
			id: "plink_should_not_be_called",
			url: "https://buy.stripe.com/should_not_be_called",
		}));
		const stripe = makeStripeMock({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		});
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.sendPaymentLink,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		expect(result.paymentLinkId).toBe("plink_existing_001");
		expect(result.paymentLinkUrl).toBe("https://buy.stripe.com/existing");
		expect(pricesCreate).not.toHaveBeenCalled();
		expect(paymentLinksCreate).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND for a random appointmentId", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.sendPaymentLink,
				{ organizationId: TEST_ORG_ID, appointmentId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 3) getPaymentStatus
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.getPaymentStatus [integration]", () => {
	it("returns correct payment status fields for a seeded appointment", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, {
			paymentStatus: "paid",
			stripePaymentIntentId: "pi_integ_status_test",
			applicationFeeAmount: 100,
		});

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.getPaymentStatus,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		expect(result.paymentStatus).toBe("paid");
		expect(result.stripePaymentIntentId).toBe("pi_integ_status_test");
		expect(result.currency).toBe("MYR");
		expect(result.sessionTotal).toBe(10000);
	});

	it("returns pending status for an unpaid appointment", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, { paymentStatus: "pending" });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.getPaymentStatus,
			{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
			ctx,
		);

		expect(result.paymentStatus).toBe("pending");
		expect(result.stripePaymentIntentId).toBeNull();
	});

	it("throws NOT_FOUND for a random appointmentId", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.getPaymentStatus,
				{ organizationId: TEST_ORG_ID, appointmentId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 4) refund
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.refund [integration]", () => {
	it("calls Stripe refunds.create with correct args for a paid appointment", async () => {
		if (shouldSkipIntegration()) return;

		const STRIPE_ACCT = "acct_1TWwNZGk6ShaTZfV";
		const PI_ID = "pi_integ_paid_for_refund";

		await seedAppointment(sharedTenantDb, {
			paymentStatus: "paid",
			stripePaymentIntentId: PI_ID,
			stripeConnectAccountIdSnapshot: STRIPE_ACCT,
		});

		const refundsCreate = mock(async () => ({
			id: "re_integ_001",
			status: "succeeded",
			amount: 10000,
			currency: "myr",
		}));
		const stripe = makeStripeMock({ refunds: { create: refundsCreate } });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.refund,
			{
				organizationId: TEST_ORG_ID,
				appointmentId: APPT_UUID,
				reason: "requested_by_customer" as const,
			},
			ctx,
		);

		expect(result.refundId).toBe("re_integ_001");
		expect(result.status).toBe("succeeded");
		expect(result.amount).toBe(10000);
		expect(result.currency).toBe("MYR");

		expect(refundsCreate).toHaveBeenCalledTimes(1);
		const [params, options] = (refundsCreate.mock.calls[0] as unknown) as [
			{ payment_intent: string; reason: string },
			{ stripeAccount: string; idempotencyKey: string },
		];
		expect(params.payment_intent).toBe(PI_ID);
		expect(params.reason).toBe("requested_by_customer");
		expect(options.stripeAccount).toBe(STRIPE_ACCT);
		expect(options.idempotencyKey).toBe(`refund:appt:${APPT_UUID}`);
	});

	it("throws PRECONDITION_FAILED when appointment is not paid", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, { paymentStatus: "pending" });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.refund,
				{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
				ctx,
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("throws PRECONDITION_FAILED when stripeConnectAccountIdSnapshot is missing", async () => {
		if (shouldSkipIntegration()) return;

		await seedAppointment(sharedTenantDb, {
			paymentStatus: "paid",
			stripePaymentIntentId: "pi_integ_no_acct",
			stripeConnectAccountIdSnapshot: null,
		});

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.refund,
				{ organizationId: TEST_ORG_ID, appointmentId: APPT_UUID },
				ctx,
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("throws NOT_FOUND for a random appointmentId", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.refund,
				{ organizationId: TEST_ORG_ID, appointmentId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 5) createSetupIntent
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.createSetupIntent [integration]", () => {
	it("returns clientSecret + setupIntentId and persists stripeCustomerId to DB", async () => {
		if (shouldSkipIntegration()) return;

		await sharedTenantDb.insert(customerProfiles).values(makeCustomerProfileSeed());

		const setupIntentsCreate = mock(async () => ({
			id: "seti_integ_001",
			client_secret: "seti_secret_integ_001",
			status: "requires_payment_method",
		}));
		const customersCreate = mock(async () => ({ id: "cus_integ_001" }));
		const stripe = makeStripeMock({
			setupIntents: { create: setupIntentsCreate },
			customers: {
				create: customersCreate,
				retrieve: mock(async (id: string) => ({ id, deleted: false })),
			},
		});

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.createSetupIntent,
			{ organizationId: TEST_ORG_ID, customerProfileId: CUSTOMER_PROFILE_UUID },
			ctx,
		);

		expect(result.clientSecret).toBe("seti_secret_integ_001");
		expect(result.setupIntentId).toBe("seti_integ_001");
		expect(typeof result.stripeAccountId).toBe("string");
		expect(result.stripeCustomerId).toBe("cus_integ_001");

		// Re-query with the shared pool to see the committed write
		const [profile] = await sharedTenantDb
			.select()
			.from(customerProfiles)
			.where(eq(customerProfiles.id, CUSTOMER_PROFILE_UUID))
			.limit(1);

		expect(profile!.stripeCustomerId).toBe("cus_integ_001");
		expect(typeof profile!.stripeConnectAccountIdSnapshot).toBe("string");
		expect(profile!.stripeConnectAccountIdSnapshot!.length).toBeGreaterThan(0);
	});

	it("reuses existing stripeCustomerId when snapshot matches (no Stripe create call)", async () => {
		if (shouldSkipIntegration()) return;

		const EXISTING_CUS = "cus_already_exists_001";
		await sharedTenantDb.insert(customerProfiles).values(
			makeCustomerProfileSeed({
				stripeCustomerId: EXISTING_CUS,
				// Snapshot must match the real org's charges-enabled acct
				stripeConnectAccountIdSnapshot: "acct_1TWwNZGk6ShaTZfV",
			}),
		);

		const customersCreate = mock(async () => ({ id: "cus_should_not_be_created" }));
		const setupIntentsCreate = mock(async () => ({
			id: "seti_integ_reuse",
			client_secret: "seti_secret_reuse",
			status: "requires_payment_method",
		}));
		const stripe = makeStripeMock({
			customers: {
				create: customersCreate,
				retrieve: mock(async (id: string) => ({ id, deleted: false })),
			},
			setupIntents: { create: setupIntentsCreate },
		});

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.createSetupIntent,
			{ organizationId: TEST_ORG_ID, customerProfileId: CUSTOMER_PROFILE_UUID },
			ctx,
		);

		expect(result.stripeCustomerId).toBe(EXISTING_CUS);
		expect(customersCreate).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND for a random customerProfileId", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.createSetupIntent,
				{ organizationId: TEST_ORG_ID, customerProfileId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 6) listSavedCards
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.listSavedCards [integration]", () => {
	it("returns empty cards array when customer has no stripeCustomerId in DB", async () => {
		if (shouldSkipIntegration()) return;

		await sharedTenantDb.insert(customerProfiles).values(makeCustomerProfileSeed());

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.listSavedCards,
			{ organizationId: TEST_ORG_ID, customerProfileId: CUSTOMER_PROFILE_UUID },
			ctx,
		);

		expect(result.cards).toEqual([]);
	});

	it("returns mapped card list when stripeCustomerId is present in DB", async () => {
		if (shouldSkipIntegration()) return;

		await sharedTenantDb.insert(customerProfiles).values(
			makeCustomerProfileSeed({
				stripeCustomerId: "cus_integ_list_cards",
				stripeConnectAccountIdSnapshot: "acct_1TWwNZGk6ShaTZfV",
				defaultPaymentMethodId: "pm_test_integ_001",
			}),
		);

		const paymentMethodsList = mock(async () => ({
			data: [
				{
					id: "pm_test_integ_001",
					card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2028 },
				},
				{
					id: "pm_test_integ_002",
					card: { brand: "mastercard", last4: "5555", exp_month: 6, exp_year: 2027 },
				},
			],
		}));
		const stripe = makeStripeMock({ paymentMethods: { list: paymentMethodsList } });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.listSavedCards,
			{ organizationId: TEST_ORG_ID, customerProfileId: CUSTOMER_PROFILE_UUID },
			ctx,
		);

		expect(result.cards).toHaveLength(2);
		expect(result.cards[0]).toMatchObject({
			id: "pm_test_integ_001",
			brand: "visa",
			last4: "4242",
			expMonth: 12,
			expYear: 2028,
			isDefault: true,
		});
		expect(result.cards[1]).toMatchObject({
			id: "pm_test_integ_002",
			brand: "mastercard",
			last4: "5555",
			isDefault: false,
		});

		expect(paymentMethodsList).toHaveBeenCalledTimes(1);
		const [listParams, listOpts] = (paymentMethodsList.mock.calls[0] as unknown) as [
			{ customer: string; type: string },
			{ stripeAccount: string },
		];
		expect(listParams.customer).toBe("cus_integ_list_cards");
		expect(listParams.type).toBe("card");
		expect(listOpts.stripeAccount).toBe("acct_1TWwNZGk6ShaTZfV");
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 7) chargeSavedCard
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.chargeSavedCard [integration]", () => {
	it("returns paymentIntentId + status and calls stripe.paymentIntents.create with correct args", async () => {
		if (shouldSkipIntegration()) return;

		const STRIPE_CUS = "cus_integ_charge_saved";
		const PM_ID = "pm_integ_default_card";
		const STRIPE_ACCT = "acct_1TWwNZGk6ShaTZfV";

		await sharedTenantDb.insert(customerProfiles).values(
			makeCustomerProfileSeed({
				stripeCustomerId: STRIPE_CUS,
				stripeConnectAccountIdSnapshot: STRIPE_ACCT,
				defaultPaymentMethodId: PM_ID,
			}),
		);

		const piCreate = mock(async () => ({
			id: "pi_integ_charge_001",
			client_secret: "cs_integ_charge_001",
			status: "succeeded",
		}));
		const stripe = makeStripeMock({ paymentIntents: { create: piCreate } });

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(stripe as never);
		const ctx = makeContext();

		const result = await callProcedure(
			router.chargeSavedCard,
			{
				organizationId: TEST_ORG_ID,
				customerProfileId: CUSTOMER_PROFILE_UUID,
				amount: 7500,
				currency: "MYR",
				description: "Integration test charge",
			},
			ctx,
		);

		expect(result.paymentIntentId).toBe("pi_integ_charge_001");
		expect(result.status).toBe("succeeded");
		expect(result.amount).toBe(7500);
		expect(result.currency).toBe("MYR");
		expect(typeof result.applicationFeeAmount).toBe("number");

		expect(piCreate).toHaveBeenCalledTimes(1);
		const [params, opts] = (piCreate.mock.calls[0] as unknown) as [
			{
				amount: number;
				currency: string;
				customer: string;
				payment_method: string;
				confirm: boolean;
				off_session: boolean;
				application_fee_amount: number;
			},
			{ stripeAccount: string; idempotencyKey?: string },
		];
		expect(params.amount).toBe(7500);
		expect(params.currency).toBe("myr");
		expect(params.customer).toBe(STRIPE_CUS);
		expect(params.payment_method).toBe(PM_ID);
		expect(params.confirm).toBe(true);
		expect(params.off_session).toBe(true);
		expect(opts.stripeAccount).toBe(STRIPE_ACCT);
		expect(opts.idempotencyKey).toBeUndefined();
	});

	it("throws PRECONDITION_FAILED when customer has no stripeCustomerId", async () => {
		if (shouldSkipIntegration()) return;

		await sharedTenantDb.insert(customerProfiles).values(makeCustomerProfileSeed());

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.chargeSavedCard,
				{
					organizationId: TEST_ORG_ID,
					customerProfileId: CUSTOMER_PROFILE_UUID,
					amount: 5000,
					currency: "MYR",
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("throws PRECONDITION_FAILED for a random customerProfileId (no stripeCustomerId)", async () => {
		if (shouldSkipIntegration()) return;

		// NOTE: chargeSavedCard checks profile?.stripeCustomerId which is undefined
		// for both "missing row" and "row with no Stripe customer" — both throw
		// PRECONDITION_FAILED. This is intentional to avoid leaking profile existence.
		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.chargeSavedCard,
				{
					organizationId: TEST_ORG_ID,
					customerProfileId: "00000000-dead-4000-8000-000000000000",
					amount: 5000,
					currency: "MYR",
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 8) createSalesOrderPaymentLink — NOT_FOUND smoke test only
// ═════════════════════════════════════════════════════════════════════════════
//
// Full happy-path requires seeding: salesOrder + invoice + payment (3 joined
// tables with complex FK chains). The real DB write path is thoroughly covered
// by the unit tests (payments.test.ts D6 + set-capture assertions). We only
// verify the NOT_FOUND guard executes against a real DB query here.

describe("paymentsRouter.createSalesOrderPaymentLink [integration — NOT_FOUND only]", () => {
	it("throws NOT_FOUND when salesOrderId does not exist in DB", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.createSalesOrderPaymentLink,
				{ organizationId: TEST_ORG_ID, salesOrderId: "00000000-dead-4000-8000-000000000000" },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// 9) purchasePackage — input validation smoke test only
// ═════════════════════════════════════════════════════════════════════════════
//
// Seeding a full service + category chain is disproportionate given Stripe paths
// are already covered in unit tests (payments.test.ts D7). We verify the
// BAD_REQUEST guard fires before any DB or Stripe interaction.

describe("paymentsRouter.purchasePackage [integration — validation only]", () => {
	it("throws BAD_REQUEST when neither clientId nor walkInCustomerId is supplied", async () => {
		if (shouldSkipIntegration()) return;

		const { createPaymentsRouter } = await import("./payments");
		const router = createPaymentsRouter(makeStripeMock() as never);
		const ctx = makeContext();

		await expect(
			callProcedure(
				router.purchasePackage,
				{
					organizationId: TEST_ORG_ID,
					serviceId: "00000000-dead-4000-8000-000000000000",
					creditsTotal: 10,
					totalPrice: 50000,
					currency: "MYR",
					validityDays: 180,
					// clientId and walkInCustomerId intentionally omitted
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
