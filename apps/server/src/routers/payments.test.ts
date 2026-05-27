/**
 * Payments Router — unit tests.
 *
 * Tests:
 *   A) Behavioural happy-path tests for getPaymentStatus (2 tests)
 *   B) Behavioural happy-path tests for refund (3 tests)
 *   C) Guard smoke tests — 7 procedures × 2 cases = 14 tests
 *   D) Behavioural happy-path + DB-write-shape tests for the 7 refactored procedures
 *
 * NOTE ON MODULE MOCKS
 * ────────────────────
 * bun:test requires mock.module() calls to be placed BEFORE the module under
 * test is first imported. Because several procedures in payments.ts call
 * services from connect-account.service, branch-country.service,
 * customer-stripe.service, and @avantej-core/services, those modules are
 * stubbed here. The payments router itself is loaded via dynamic import in a
 * beforeAll so the mocks are installed first.
 */

import { describe, expect, it, mock, beforeAll } from "bun:test";

// ─── Service stubs (must precede SUT import) ─────────────────────────────────

mock.module("../services/connect-account.service", () => ({
	getConnectAccountForOrg: mock(async () => ({
		acctId: "acct_test_123",
		appFeeBps: 100,
		chargesEnabled: true,
		tier: "standard",
		currency: "MYR",
		countryCode: "MY",
	})),
	getConnectAccountForOrgCountry: mock(async () => ({
		acctId: "acct_test_123",
		appFeeBps: 100,
		chargesEnabled: true,
		tier: "standard",
		currency: "MYR",
		countryCode: "MY",
	})),
	computeApplicationFee: (amount: number, bps: number) =>
		Math.floor((amount * bps) / 10000),
}));

mock.module("../services/branch-country.service", () => ({
	resolveBranchCountryCode: mock(async () => "MY"),
}));

mock.module("../services/customer-stripe.service", () => ({
	getOrCreateStripeCustomer: mock(async () => ({ customerId: "cus_test_123" })),
}));

// PermissionDeniedError must be a real class (guards.ts does `instanceof` checks via
// isBranchAccessDeniedError). We provide minimal real implementations here so that
// assertOrgContextMatch / assertTenantContext continue to work correctly in guard
// smoke tests, while createPackageInstance is fully stubbed.
class PermissionDeniedError extends Error {
	resource: string;
	action: string;
	role: string;
	constructor(resource: string, action: string, role: string) {
		super(`Permission denied: ${resource}:${action} for role ${role}`);
		this.name = "PermissionDeniedError";
		this.resource = resource;
		this.action = action;
		this.role = role;
	}
}

mock.module("@avantej-core/services", () => ({
	createPackageInstance: mock(async () => ({
		id: "pkg_inst_abc",
		serviceId: "svc-1",
		status: "pending",
	})),
	// Hierarchy guards used by @avantej-core/api/guards.ts
	assertBranchAccessible: (branchId: string, accessibleNodeIds: string[]) => {
		if (!accessibleNodeIds.includes(branchId)) {
			throw new PermissionDeniedError("branch", "access", "staff");
		}
	},
	getDescendantNodeIds: mock(async () => []),
	isBranchAccessDeniedError: (err: unknown) =>
		err instanceof PermissionDeniedError,
	PermissionDeniedError,
	// Permission checks
	requirePermission: mock(async () => undefined),
}));

// ─── SUT (dynamic import so mocks are already registered) ────────────────────

let createPaymentsRouter: (typeof import("./payments"))["createPaymentsRouter"];

beforeAll(async () => {
	const mod = await import("./payments");
	createPaymentsRouter = mod.createPaymentsRouter;
});

// ─── Constants ───────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CUSTOMER_PROFILE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SALES_ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SERVICE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const MOCK_MEMBER = {
	id: "member-1",
	role: "admin",
	hierarchyScopeId: "scope-1",
	userId: "user-1",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read-only tenantDb mock. Resolves `.select().from().where().limit()` with
 * the provided rows array.
 */
function makeTenantDb(rows: unknown[]) {
	const chain = {
		from: mock(() => chain),
		where: mock(() => chain),
		limit: mock(() => Promise.resolve(rows)),
	};
	return {
		select: mock(() => chain),
	} as unknown as never;
}

/**
 * Extended tenantDb mock that also supports update/insert operations.
 *
 * When multiple sequential selects are needed (e.g. sendPaymentLink reads the
 * appointment then the service, createSalesOrderPaymentLink reads salesOrder →
 * invoice → payment), pass `selectRowsList` — an array of row-arrays, one
 * per `.select()` call in order.
 */
function makeTenantDbWithWrites(opts: {
	selectRowsList?: unknown[][];
	/** single rows array for the common single-select case */
	selectRows?: unknown[];
	updateWhereSpy?: ReturnType<typeof mock>;
	insertValuesSpy?: ReturnType<typeof mock>;
	/** When provided, each payload passed to .update().set() is pushed here */
	setCapture?: unknown[];
}) {
	let selectCallIndex = 0;
	const rowsList =
		opts.selectRowsList ??
		(opts.selectRows !== undefined ? [opts.selectRows] : [[]]);

	const makeSelectChain = (rows: unknown[]) => {
		const chain = {
			from: mock(() => chain),
			where: mock(() => chain),
			limit: mock(() => Promise.resolve(rows)),
		};
		return chain;
	};

	const selectMock = mock(() => {
		const rows = rowsList[selectCallIndex] ?? [];
		selectCallIndex++;
		return makeSelectChain(rows);
	});

	const updateWhere = opts.updateWhereSpy ?? mock(() => Promise.resolve());
	// Capture is returned here so callers can inspect payloads without post-hoc
	// mutation of the tenantDb object.
	const makeUpdateChain = (): { set: ReturnType<typeof mock>; where: ReturnType<typeof mock> } => {
		const chain: { set: ReturnType<typeof mock>; where: ReturnType<typeof mock> } = {
			set: mock((payload: unknown) => {
				opts.setCapture?.push(payload);
				return chain;
			}),
			where: updateWhere,
		};
		return chain;
	};

	const insertValues = opts.insertValuesSpy ?? mock(() => Promise.resolve());
	const insertChain = {
		values: insertValues,
	};

	const updateMock = mock(() => makeUpdateChain());
	const insertMock = mock(() => insertChain);

	return {
		select: selectMock,
		update: updateMock,
		insert: insertMock,
	} as unknown as {
		select: typeof selectMock;
		update: typeof updateMock;
		insert: typeof insertMock;
	};
}

/** Build a context with a honoContext wrapping a controlPanelDb stub. */
function makeContext(opts: {
	tenantDb: ReturnType<typeof makeTenantDb> | ReturnType<typeof makeTenantDbWithWrites>;
	cpDb?: Record<string, unknown>;
}) {
	const cpDb = opts.cpDb ?? {};
	const mockHonoContext = {
		get: mock((key: string) => (key === "controlPanelDb" ? cpDb : undefined)),
	};
	return {
		organizationId: ORG_ID,
		tenantDb: opts.tenantDb,
		member: MOCK_MEMBER,
		honoContext: mockHonoContext,
	};
}

/**
 * Type-safe extraction of the first call args from a bun:test mock function.
 * `mock.calls[0]` has type `[] | undefined` in TypeScript; this helper applies
 * the double-cast needed to assert a concrete tuple shape.
 */
function getFirstCallArgs<T extends unknown[]>(
	// biome-ignore lint/suspicious/noExplicitAny: mock type inference
	mockFn: { mock: { calls: any[] } },
): T {
	return (mockFn.mock.calls[0] as unknown) as T;
}

function callProcedure(
	procedure: unknown,
	input: unknown,
	context: Record<string, unknown>,
) {
	// biome-ignore lint/suspicious/noExplicitAny: test helper
	return (procedure as any)["~orpc"].handler({ input, context });
}

// ═════════════════════════════════════════════════════════════════════════════
// A) getPaymentStatus
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.getPaymentStatus", () => {
	it("returns appointment payment fields when found", async () => {
		const appt = {
			id: APPT_ID,
			paymentStatus: "paid",
			stripePaymentIntentId: "pi_123",
			stripePaymentLinkId: null,
			paymentLinkUrl: null,
			currency: "MYR",
			sessionTotal: 5000,
			applicationFeeAmount: 100,
			paidAt: new Date(),
			paymentFailureReason: null,
			paymentMethodType: "card",
		};
		const router = createPaymentsRouter();
		const result = await callProcedure(
			router.getPaymentStatus,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			{ tenantDb: makeTenantDb([appt]), member: MOCK_MEMBER },
		);
		expect(result.paymentStatus).toBe("paid");
		expect(result.stripePaymentIntentId).toBe("pi_123");
	});

	it("throws NOT_FOUND when appointment missing", async () => {
		const router = createPaymentsRouter();
		await expect(
			callProcedure(
				router.getPaymentStatus,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{ tenantDb: makeTenantDb([]), member: MOCK_MEMBER },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// B) refund
// ═════════════════════════════════════════════════════════════════════════════

describe("paymentsRouter.refund", () => {
	const paidAppt = {
		id: APPT_ID,
		paymentStatus: "paid",
		stripePaymentIntentId: "pi_123",
		stripeConnectAccountIdSnapshot: "acct_123",
	};

	it("rejects refund when payment_status is not paid", async () => {
		const router = createPaymentsRouter({
			refunds: {
				create: mock(() =>
					Promise.resolve({
						id: "re_1",
						status: "succeeded",
						amount: 5000,
						currency: "myr",
					}),
				),
			},
		} as never);
		await expect(
			callProcedure(
				router.refund,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{
					tenantDb: makeTenantDb([
						{ ...paidAppt, paymentStatus: "pending" },
					]),
					member: MOCK_MEMBER,
				},
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("creates Stripe refund with idempotency key on happy path", async () => {
		const refundCreate = mock(() =>
			Promise.resolve({
				id: "re_123",
				status: "succeeded",
				amount: 5000,
				currency: "myr",
			}),
		);
		const router = createPaymentsRouter({
			refunds: { create: refundCreate },
		} as never);

		const result = await callProcedure(
			router.refund,
			{
				organizationId: ORG_ID,
				appointmentId: APPT_ID,
				reason: "requested_by_customer",
			},
			{ tenantDb: makeTenantDb([paidAppt]), member: MOCK_MEMBER },
		);

		expect(result.refundId).toBe("re_123");
		expect(refundCreate).toHaveBeenCalledTimes(1);
		const firstCall = refundCreate.mock.calls[0] as unknown[] | undefined;
		expect(firstCall).toBeDefined();
		const options = firstCall![1] as {
			stripeAccount?: string;
			idempotencyKey?: string;
		};
		expect(options.stripeAccount).toBe("acct_123");
		expect(options.idempotencyKey).toBe(`refund:appt:${APPT_ID}`);
	});

	it("rejects when stripe connect account snapshot is missing", async () => {
		const router = createPaymentsRouter({
			refunds: {
				create: mock(() =>
					Promise.resolve({
						id: "re_1",
						status: "succeeded",
						amount: 5000,
						currency: "myr",
					}),
				),
			},
		} as never);
		await expect(
			callProcedure(
				router.refund,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{
					tenantDb: makeTenantDb([
						{ ...paidAppt, stripeConnectAccountIdSnapshot: null },
					]),
					member: MOCK_MEMBER,
				},
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// C) Guard smoke tests — 7 procedures × 2 cases = 14 tests
// ═════════════════════════════════════════════════════════════════════════════
//
// These tests don't exercise Stripe or Drizzle behaviour — they pin down the
// post-refactor security guards: `assertOrgContextMatch` (cross-tenant
// spoofing) and `assertTenantContext` (missing tenantDb / missing member).
// Each procedure must fail FAST before any side effect, so we can assert
// without setting up the full pipeline.

type GuardCase = {
	name: string;
	pick: (router: ReturnType<typeof createPaymentsRouter>) => unknown;
	input: Record<string, unknown>;
};

const GUARDED_PROCEDURES: GuardCase[] = [
	{
		name: "createPaymentIntent",
		pick: (r) => r.createPaymentIntent,
		input: { organizationId: ORG_ID, appointmentId: APPT_ID },
	},
	{
		name: "sendPaymentLink",
		pick: (r) => r.sendPaymentLink,
		input: { organizationId: ORG_ID, appointmentId: APPT_ID },
	},
	{
		name: "createSetupIntent",
		pick: (r) => r.createSetupIntent,
		input: { organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
	},
	{
		name: "listSavedCards",
		pick: (r) => r.listSavedCards,
		input: { organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
	},
	{
		name: "chargeSavedCard",
		pick: (r) => r.chargeSavedCard,
		input: {
			organizationId: ORG_ID,
			customerProfileId: CUSTOMER_PROFILE_ID,
			amount: 5000,
			currency: "MYR",
		},
	},
	{
		name: "createSalesOrderPaymentLink",
		pick: (r) => r.createSalesOrderPaymentLink,
		input: { organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID },
	},
	{
		name: "purchasePackage",
		pick: (r) => r.purchasePackage,
		input: {
			organizationId: ORG_ID,
			serviceId: SERVICE_ID,
			clientId: "user_abc",
			creditsTotal: 10,
			totalPrice: 50000,
			currency: "MYR",
		},
	},
];

describe("paymentsRouter guard smoke tests", () => {
	describe.each(GUARDED_PROCEDURES)("$name", ({ pick, input }) => {
		it("throws FORBIDDEN when input.organizationId disagrees with context.organizationId", async () => {
			const router = createPaymentsRouter();
			const procedure = pick(router);
			await expect(
				callProcedure(procedure, input, {
					organizationId: OTHER_ORG_ID,
					tenantDb: makeTenantDb([]),
					member: MOCK_MEMBER,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("throws FORBIDDEN when context has tenantDb but no member", async () => {
			const router = createPaymentsRouter();
			const procedure = pick(router);
			await expect(
				callProcedure(procedure, input, {
					tenantDb: makeTenantDb([]),
					// member intentionally absent — assertTenantContext should fire
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// D) Behavioural happy-path + DB-write-shape tests (7 procedures)
// ═════════════════════════════════════════════════════════════════════════════

// ── D1) createPaymentIntent ──────────────────────────────────────────────────

describe("paymentsRouter.createPaymentIntent", () => {
	const apptRow = {
		id: APPT_ID,
		paymentStatus: "pending",
		stripePaymentIntentId: null,
		stripeConnectAccountIdSnapshot: null,
		sessionTotal: 10000,
		pricePerClient: null,
		currency: "MYR",
		branchId: "branch-1",
		serviceId: "svc-1",
	};

	it("returns clientSecret + paymentIntentId and calls stripe.paymentIntents.create with correct args", async () => {
		const piCreate = mock(() =>
			Promise.resolve({ id: "pi_new_abc", client_secret: "cs_test_xyz", status: "requires_payment_method" }),
		);
		const router = createPaymentsRouter({ paymentIntents: { create: piCreate } } as never);

		const updateWhere = mock(() => Promise.resolve());
		const tenantDb = makeTenantDbWithWrites({ selectRows: [apptRow], updateWhereSpy: updateWhere });

		const result = await callProcedure(
			router.createPaymentIntent,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			makeContext({ tenantDb }),
		);

		expect(result.clientSecret).toBe("cs_test_xyz");
		expect(result.paymentIntentId).toBe("pi_new_abc");
		expect(result.stripeAccountId).toBe("acct_test_123");
		expect(result.amount).toBe(10000);
		expect(result.currency).toBe("MYR");
		// applicationFeeAmount = floor(10000 * 100 / 10000) = 100
		expect(result.applicationFeeAmount).toBe(100);

		expect(piCreate).toHaveBeenCalledTimes(1);
		const [params, opts] = getFirstCallArgs<[
			{ amount: number; currency: string; application_fee_amount: number; metadata: Record<string, string> },
			{ stripeAccount: string; idempotencyKey: string },
		]>(piCreate);
		expect(params.amount).toBe(10000);
		expect(params.currency).toBe("myr");
		expect(params.application_fee_amount).toBe(100);
		expect(params.metadata.appointmentId).toBe(APPT_ID);
		expect(params.metadata.organizationId).toBe(ORG_ID);
		expect(opts.stripeAccount).toBe("acct_test_123");
		expect(opts.idempotencyKey).toBe(`pi:appt:${APPT_ID}`);
	});

	it("writes stripePaymentIntentId + stripeConnectAccountIdSnapshot + applicationFeeAmount to DB", async () => {
		const piCreate = mock(() =>
			Promise.resolve({ id: "pi_new_abc", client_secret: "cs_test_xyz", status: "requires_payment_method" }),
		);
		const router = createPaymentsRouter({ paymentIntents: { create: piCreate } } as never);

		const setCapture: unknown[] = [];
		const tenantDb = makeTenantDbWithWrites({ selectRows: [apptRow], setCapture });

		await callProcedure(
			router.createPaymentIntent,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			makeContext({ tenantDb }),
		);

		expect(setCapture.length).toBeGreaterThanOrEqual(1);
		const setPayload = setCapture[0] as Record<string, unknown>;
		expect(setPayload.stripePaymentIntentId).toBe("pi_new_abc");
		expect(setPayload.stripeConnectAccountIdSnapshot).toBe("acct_test_123");
		expect(setPayload.applicationFeeAmount).toBe(100);
		expect(setPayload.currency).toBe("MYR");
	});
});

// ── D2) sendPaymentLink ───────────────────────────────────────────────────────

describe("paymentsRouter.sendPaymentLink", () => {
	const apptRow = {
		id: APPT_ID,
		paymentStatus: "pending",
		stripePaymentLinkId: null,
		paymentLinkUrl: null,
		applicationFeeAmount: null,
		sessionTotal: 8000,
		pricePerClient: null,
		currency: "MYR",
		branchId: "branch-1",
		serviceId: "svc-1",
	};
	const serviceRow = { name: "Yoga Class" };

	it("returns paymentLinkId + paymentLinkUrl and calls stripe.prices.create + stripe.paymentLinks.create", async () => {
		const pricesCreate = mock(() => Promise.resolve({ id: "price_abc" }));
		const paymentLinksCreate = mock(() =>
			Promise.resolve({ id: "plink_abc", url: "https://buy.stripe.com/test_link" }),
		);
		const router = createPaymentsRouter({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		} as never);

		const updateWhere = mock(() => Promise.resolve());
		const tenantDb = makeTenantDbWithWrites({
			selectRowsList: [[apptRow], [serviceRow]],
			updateWhereSpy: updateWhere,
		});

		const result = await callProcedure(
			router.sendPaymentLink,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			makeContext({ tenantDb }),
		);

		expect(result.paymentLinkId).toBe("plink_abc");
		expect(result.paymentLinkUrl).toBe("https://buy.stripe.com/test_link");
		expect(result.amount).toBe(8000);
		expect(result.currency).toBe("MYR");
		expect(result.applicationFeeAmount).toBe(80); // floor(8000*100/10000)

		expect(pricesCreate).toHaveBeenCalledTimes(1);
		const [priceParams, priceOpts] = getFirstCallArgs<[
			{ unit_amount: number; currency: string; product_data: { name: string } },
			{ stripeAccount: string },
		]>(pricesCreate);
		expect(priceParams.unit_amount).toBe(8000);
		expect(priceParams.currency).toBe("myr");
		expect(priceParams.product_data.name).toBe("Yoga Class");
		expect(priceOpts.stripeAccount).toBe("acct_test_123");

		expect(paymentLinksCreate).toHaveBeenCalledTimes(1);
		const [linkParams, linkOpts] = getFirstCallArgs<[
			{ application_fee_amount: number; metadata: Record<string, string> },
			{ stripeAccount: string },
		]>(paymentLinksCreate);
		expect(linkParams.application_fee_amount).toBe(80);
		expect(linkParams.metadata.appointmentId).toBe(APPT_ID);
		expect(linkOpts.stripeAccount).toBe("acct_test_123");
	});

	it("writes stripePaymentLinkId + paymentLinkUrl + stripeConnectAccountIdSnapshot + applicationFeeAmount to DB", async () => {
		const pricesCreate = mock(() => Promise.resolve({ id: "price_abc" }));
		const paymentLinksCreate = mock(() =>
			Promise.resolve({ id: "plink_abc", url: "https://buy.stripe.com/test_link" }),
		);
		const router = createPaymentsRouter({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		} as never);

		const setCapture: unknown[] = [];
		const tenantDb = makeTenantDbWithWrites({
			selectRowsList: [[apptRow], [serviceRow]],
			setCapture,
		});

		await callProcedure(
			router.sendPaymentLink,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			makeContext({ tenantDb }),
		);

		expect(setCapture.length).toBeGreaterThanOrEqual(1);
		const setPayload = setCapture[0] as Record<string, unknown>;
		expect(setPayload.stripePaymentLinkId).toBe("plink_abc");
		expect(setPayload.paymentLinkUrl).toBe("https://buy.stripe.com/test_link");
		expect(setPayload.stripeConnectAccountIdSnapshot).toBe("acct_test_123");
		expect(setPayload.applicationFeeAmount).toBe(80);
	});
});

// ── D3) createSetupIntent ─────────────────────────────────────────────────────

describe("paymentsRouter.createSetupIntent", () => {
	const profileRow = {
		id: CUSTOMER_PROFILE_ID,
		stripeCustomerId: null,
		stripeConnectAccountIdSnapshot: null,
		defaultPaymentMethodId: null,
	};

	it("returns clientSecret + setupIntentId and calls stripe.setupIntents.create with correct stripeAccount", async () => {
		const setupIntentsCreate = mock(() =>
			Promise.resolve({ id: "seti_abc", client_secret: "seti_secret_xyz", status: "requires_payment_method" }),
		);
		const router = createPaymentsRouter({ setupIntents: { create: setupIntentsCreate } } as never);

		const tenantDb = makeTenantDbWithWrites({ selectRows: [profileRow] });

		const result = await callProcedure(
			router.createSetupIntent,
			{ organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
			makeContext({ tenantDb }),
		);

		expect(result.clientSecret).toBe("seti_secret_xyz");
		expect(result.setupIntentId).toBe("seti_abc");
		expect(result.stripeAccountId).toBe("acct_test_123");
		expect(result.stripeCustomerId).toBe("cus_test_123");

		expect(setupIntentsCreate).toHaveBeenCalledTimes(1);
		const [params, opts] = getFirstCallArgs<[
			{ customer: string; usage: string; metadata: Record<string, string> },
			{ stripeAccount: string },
		]>(setupIntentsCreate);
		expect(params.customer).toBe("cus_test_123");
		expect(params.usage).toBe("off_session");
		expect(params.metadata.customerProfileId).toBe(CUSTOMER_PROFILE_ID);
		expect(params.metadata.organizationId).toBe(ORG_ID);
		expect(opts.stripeAccount).toBe("acct_test_123");
	});
});

// ── D4) listSavedCards ────────────────────────────────────────────────────────

describe("paymentsRouter.listSavedCards", () => {
	it("returns empty cards array when customer has no stripeCustomerId", async () => {
		const profileRow = {
			id: CUSTOMER_PROFILE_ID,
			stripeCustomerId: null,
			stripeConnectAccountIdSnapshot: null,
			defaultPaymentMethodId: null,
		};
		const router = createPaymentsRouter();
		const tenantDb = makeTenantDbWithWrites({ selectRows: [profileRow] });

		const result = await callProcedure(
			router.listSavedCards,
			{ organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
			makeContext({ tenantDb }),
		);

		expect(result.cards).toEqual([]);
	});

	it("returns mapped card list from stripe.paymentMethods.list", async () => {
		const profileRow = {
			id: CUSTOMER_PROFILE_ID,
			stripeCustomerId: "cus_abc",
			stripeConnectAccountIdSnapshot: "acct_test_123",
			defaultPaymentMethodId: "pm_default_1",
		};
		const paymentMethodsList = mock(() =>
			Promise.resolve({
				data: [
					{
						id: "pm_default_1",
						card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2026 },
					},
					{
						id: "pm_other_2",
						card: { brand: "mastercard", last4: "5555", exp_month: 6, exp_year: 2025 },
					},
				],
			}),
		);
		const router = createPaymentsRouter({ paymentMethods: { list: paymentMethodsList } } as never);
		const tenantDb = makeTenantDbWithWrites({ selectRows: [profileRow] });

		const result = await callProcedure(
			router.listSavedCards,
			{ organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
			makeContext({ tenantDb }),
		);

		expect(result.cards).toHaveLength(2);
		expect(result.cards[0]).toMatchObject({
			id: "pm_default_1",
			brand: "visa",
			last4: "4242",
			expMonth: 12,
			expYear: 2026,
			isDefault: true,
		});
		expect(result.cards[1]).toMatchObject({
			id: "pm_other_2",
			isDefault: false,
		});

		expect(paymentMethodsList).toHaveBeenCalledTimes(1);
		const [listParams, listOpts] = getFirstCallArgs<[
			{ customer: string; type: string },
			{ stripeAccount: string },
		]>(paymentMethodsList);
		expect(listParams.customer).toBe("cus_abc");
		expect(listParams.type).toBe("card");
		expect(listOpts.stripeAccount).toBe("acct_test_123");
	});
});

// ── D5) chargeSavedCard ───────────────────────────────────────────────────────

describe("paymentsRouter.chargeSavedCard", () => {
	const profileRow = {
		id: CUSTOMER_PROFILE_ID,
		stripeCustomerId: "cus_abc",
		stripeConnectAccountIdSnapshot: "acct_test_123",
		defaultPaymentMethodId: "pm_default_1",
	};

	it("returns paymentIntentId + status and calls stripe.paymentIntents.create off_session", async () => {
		const piCreate = mock(() =>
			Promise.resolve({ id: "pi_charge_abc", client_secret: "cs_abc", status: "succeeded" }),
		);
		const router = createPaymentsRouter({ paymentIntents: { create: piCreate } } as never);
		const tenantDb = makeTenantDbWithWrites({ selectRows: [profileRow] });

		const result = await callProcedure(
			router.chargeSavedCard,
			{
				organizationId: ORG_ID,
				customerProfileId: CUSTOMER_PROFILE_ID,
				amount: 6000,
				currency: "MYR",
			},
			makeContext({ tenantDb }),
		);

		expect(result.paymentIntentId).toBe("pi_charge_abc");
		expect(result.status).toBe("succeeded");
		expect(result.amount).toBe(6000);
		expect(result.currency).toBe("MYR");
		expect(result.applicationFeeAmount).toBe(60); // floor(6000*100/10000)

		expect(piCreate).toHaveBeenCalledTimes(1);
		const [params, opts] = getFirstCallArgs<[
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
		]>(piCreate);
		expect(params.amount).toBe(6000);
		expect(params.currency).toBe("myr");
		expect(params.customer).toBe("cus_abc");
		expect(params.payment_method).toBe("pm_default_1");
		expect(params.confirm).toBe(true);
		expect(params.off_session).toBe(true);
		expect(params.application_fee_amount).toBe(60);
		// No appointmentId → no idempotency key
		expect(opts.idempotencyKey).toBeUndefined();
		expect(opts.stripeAccount).toBe("acct_test_123");
	});
});

// ── D6) createSalesOrderPaymentLink ──────────────────────────────────────────

describe("paymentsRouter.createSalesOrderPaymentLink", () => {
	const salesOrderRow = {
		id: SALES_ORDER_ID,
		salesOrderNumber: "SO-001",
		branchId: "branch-1",
	};
	const invoiceRow = {
		id: "inv-1",
		salesOrderId: SALES_ORDER_ID,
		paymentId: "pay-1",
	};
	const paymentRow = {
		id: "pay-1",
		status: "pending",
		paymentLinkUrl: null,
		stripePaymentLinkId: null,
		totalAmount: 15000,
		currency: "myr",
		platformFeeAmount: null,
	};

	it("returns paymentLinkId + paymentLinkUrl and calls stripe with correct stripeAccount", async () => {
		const pricesCreate = mock(() => Promise.resolve({ id: "price_sale_abc" }));
		const paymentLinksCreate = mock(() =>
			Promise.resolve({ id: "plink_sale_abc", url: "https://buy.stripe.com/sale_link" }),
		);
		const router = createPaymentsRouter({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		} as never);

		const updateWhere = mock(() => Promise.resolve());
		const tenantDb = makeTenantDbWithWrites({
			selectRowsList: [[salesOrderRow], [invoiceRow], [paymentRow]],
			updateWhereSpy: updateWhere,
		});

		const result = await callProcedure(
			router.createSalesOrderPaymentLink,
			{ organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID },
			makeContext({ tenantDb }),
		);

		expect(result.paymentLinkId).toBe("plink_sale_abc");
		expect(result.paymentLinkUrl).toBe("https://buy.stripe.com/sale_link");
		expect(result.paymentId).toBe("pay-1");
		expect(result.amount).toBe(15000);
		expect(result.currency).toBe("MYR");
		expect(result.applicationFeeAmount).toBe(150); // floor(15000*100/10000)

		const [priceParams, priceOpts] = getFirstCallArgs<[
			{ unit_amount: number; product_data: { name: string } },
			{ stripeAccount: string },
		]>(pricesCreate);
		expect(priceParams.unit_amount).toBe(15000);
		expect(priceParams.product_data.name).toBe("Sale SO-001");
		expect(priceOpts.stripeAccount).toBe("acct_test_123");

		const [linkParams, linkOpts] = getFirstCallArgs<[
			{ application_fee_amount: number; metadata: Record<string, string> },
			{ stripeAccount: string },
		]>(paymentLinksCreate);
		expect(linkParams.application_fee_amount).toBe(150);
		expect(linkParams.metadata.type).toBe("sales_order");
		expect(linkParams.metadata.salesOrderId).toBe(SALES_ORDER_ID);
		expect(linkOpts.stripeAccount).toBe("acct_test_123");
	});

	it("writes stripePaymentLinkId + paymentLinkUrl + stripeConnectAccountIdSnapshot to payment row", async () => {
		const pricesCreate = mock(() => Promise.resolve({ id: "price_sale_abc" }));
		const paymentLinksCreate = mock(() =>
			Promise.resolve({ id: "plink_sale_abc", url: "https://buy.stripe.com/sale_link" }),
		);
		const router = createPaymentsRouter({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		} as never);

		const setCapture: unknown[] = [];
		const tenantDb = makeTenantDbWithWrites({
			selectRowsList: [[salesOrderRow], [invoiceRow], [paymentRow]],
			setCapture,
		});

		await callProcedure(
			router.createSalesOrderPaymentLink,
			{ organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID },
			makeContext({ tenantDb }),
		);

		expect(setCapture.length).toBeGreaterThanOrEqual(1);
		const setPayload = setCapture[0] as Record<string, unknown>;
		expect(setPayload.stripePaymentLinkId).toBe("plink_sale_abc");
		expect(setPayload.paymentLinkUrl).toBe("https://buy.stripe.com/sale_link");
		expect(setPayload.stripeConnectAccountIdSnapshot).toBe("acct_test_123");
	});
});

// ── D7) purchasePackage ───────────────────────────────────────────────────────
//
// purchasePackage delegates heavily to createPackageInstance (mocked) and then
// creates a Stripe Price + PaymentLink. We verify the return shape and Stripe
// call args. Full deep testing of createPackageInstance is out of scope here
// (that function has its own tests in @avantej-core/services).

describe("paymentsRouter.purchasePackage", () => {
	it("returns packageInstanceId + paymentLinkId and calls stripe with correct amount and metadata", async () => {
		const pricesCreate = mock(() => Promise.resolve({ id: "price_pkg_abc" }));
		const paymentLinksCreate = mock(() =>
			Promise.resolve({ id: "plink_pkg_abc", url: "https://buy.stripe.com/pkg_link" }),
		);
		const router = createPaymentsRouter({
			prices: { create: pricesCreate },
			paymentLinks: { create: paymentLinksCreate },
		} as never);

		const tenantDb = makeTenantDbWithWrites({ selectRows: [] });

		const result = await callProcedure(
			router.purchasePackage,
			{
				organizationId: ORG_ID,
				serviceId: SERVICE_ID,
				clientId: "user_abc",
				creditsTotal: 10,
				totalPrice: 50000,
				currency: "MYR",
				validityDays: 180,
			},
			makeContext({ tenantDb }),
		);

		expect(result.packageInstanceId).toBe("pkg_inst_abc");
		expect(result.paymentLinkId).toBe("plink_pkg_abc");
		expect(result.paymentLinkUrl).toBe("https://buy.stripe.com/pkg_link");
		expect(result.amount).toBe(50000);
		expect(result.currency).toBe("MYR");
		expect(result.applicationFeeAmount).toBe(500); // floor(50000*100/10000)

		expect(pricesCreate).toHaveBeenCalledTimes(1);
		const [priceParams, priceOpts] = getFirstCallArgs<[
			{ unit_amount: number; currency: string; product_data: { name: string } },
			{ stripeAccount: string },
		]>(pricesCreate);
		expect(priceParams.unit_amount).toBe(50000);
		expect(priceParams.currency).toBe("myr");
		expect(priceParams.product_data.name).toBe("Package (10 sessions)");
		expect(priceOpts.stripeAccount).toBe("acct_test_123");

		expect(paymentLinksCreate).toHaveBeenCalledTimes(1);
		const [linkParams, linkOpts] = getFirstCallArgs<[
			{
				application_fee_amount: number;
				metadata: Record<string, string>;
				payment_intent_data: { metadata: Record<string, string> };
			},
			{ stripeAccount: string },
		]>(paymentLinksCreate);
		expect(linkParams.application_fee_amount).toBe(500);
		expect(linkParams.metadata.type).toBe("package");
		expect(linkParams.metadata.packageInstanceId).toBe("pkg_inst_abc");
		expect(linkParams.metadata.organizationId).toBe(ORG_ID);
		expect(linkParams.payment_intent_data.metadata.packageInstanceId).toBe("pkg_inst_abc");
		expect(linkOpts.stripeAccount).toBe("acct_test_123");
	});
});
