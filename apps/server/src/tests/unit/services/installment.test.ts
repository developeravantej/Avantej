import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	DEFAULT_GRACE_PERIOD_DAYS,
	getGracePeriodDaysForPackage,
	evaluateAndLockIfOverdue,
} from "@avantej-core/services";

// ---------------------------------------------------------------------------
// Shared mock primitives
// ---------------------------------------------------------------------------

const mockSelectResult: any[] = [];
const mockLimit = mock(() => Promise.resolve(mockSelectResult));
const mockWhere = mock(() => ({ limit: mockLimit }));
const mockLeftJoin = mock(() => ({ where: mockWhere }));
const mockFrom = mock(() => ({ leftJoin: mockLeftJoin }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockFindFirst = mock(() => Promise.resolve(null));
const mockFindMany = mock(() => Promise.resolve([]));
const mockReturning = mock(() => Promise.resolve([]));
const mockSet = mock(() => ({ where: mock(() => ({ returning: mockReturning }) ) }));
const mockUpdate = mock(() => ({ set: mockSet }));
const mockInsertReturning = mock(() => Promise.resolve([]));
const mockInsertValues = mock(() => ({ returning: mockInsertReturning }));
const mockInsert = mock(() => ({ values: mockInsertValues }));

const mockTenantDb = {
	select: mockSelect,
	update: mockUpdate,
	insert: mockInsert,
	query: {
		packageInstances: {
			findFirst: mockFindFirst,
			findMany: mockFindMany,
		},
		installments: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
	},
} as any;

beforeEach(() => {
	mockSelect.mockClear();
	mockFrom.mockClear();
	mockLeftJoin.mockClear();
	mockWhere.mockClear();
	mockLimit.mockClear();
	mockFindFirst.mockClear();
	mockFindMany.mockClear();
	mockReturning.mockClear();
	mockInsert.mockClear();
	mockInsertValues.mockClear();
	mockInsertReturning.mockClear();
	mockUpdate.mockClear();
	mockSet.mockClear();
	// Reset select result
	mockSelectResult.length = 0;
});

// ---------------------------------------------------------------------------
// Tests: DEFAULT_GRACE_PERIOD_DAYS
// ---------------------------------------------------------------------------

describe("DEFAULT_GRACE_PERIOD_DAYS", () => {
	test("equals 7", () => {
		expect(DEFAULT_GRACE_PERIOD_DAYS).toBe(7);
	});
});

// ---------------------------------------------------------------------------
// Tests: getGracePeriodDaysForPackage
// ---------------------------------------------------------------------------

describe("getGracePeriodDaysForPackage", () => {
	test("returns service gracePeriodDays when set", async () => {
		mockSelectResult.push({ gracePeriodDays: 14 });
		mockLimit.mockResolvedValueOnce([{ gracePeriodDays: 14 }]);

		const result = await getGracePeriodDaysForPackage(mockTenantDb, "pi-1");

		expect(result).toBe(14);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});

	test("returns DEFAULT_GRACE_PERIOD_DAYS when service gracePeriodDays is null", async () => {
		mockLimit.mockResolvedValueOnce([{ gracePeriodDays: null }]);

		const result = await getGracePeriodDaysForPackage(mockTenantDb, "pi-2");

		expect(result).toBe(DEFAULT_GRACE_PERIOD_DAYS);
	});

	test("returns DEFAULT_GRACE_PERIOD_DAYS when package instance not found", async () => {
		mockLimit.mockResolvedValueOnce([]);

		const result = await getGracePeriodDaysForPackage(mockTenantDb, "nonexistent");

		expect(result).toBe(DEFAULT_GRACE_PERIOD_DAYS);
	});

	test("returns 0 when service gracePeriodDays is explicitly 0", async () => {
		mockLimit.mockResolvedValueOnce([{ gracePeriodDays: 0 }]);

		const result = await getGracePeriodDaysForPackage(mockTenantDb, "pi-3");

		// 0 is falsy but should NOT fall back to the default
		expect(result).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tests: evaluateAndLockIfOverdue
// ---------------------------------------------------------------------------

describe("evaluateAndLockIfOverdue", () => {
	/**
	 * Build a package instance fixture. Dates relative to "now" are computed
	 * at call time so tests remain deterministic even if the clock advances.
	 */
	function makePackage(overrides: Partial<{
		id: string;
		paymentPlanType: string | null;
		installmentsPaid: number;
		installmentsTotal: number;
		nextDueDate: Date | null;
		gracePeriodEndsAt: Date | null;
		isLocked: boolean;
		serviceId: string;
		creditsTotal: number;
		creditsUsed: number;
		creditsUnlocked: number;
		creditsRemaining: number;
	}> = {}) {
		return {
			id: "pi-test",
			paymentPlanType: "half",
			installmentsPaid: 0,
			installmentsTotal: 2,
			nextDueDate: null,
			gracePeriodEndsAt: null,
			isLocked: false,
			serviceId: "svc-1",
			creditsTotal: 10,
			creditsUsed: 0,
			creditsUnlocked: 0,
			creditsRemaining: 10,
			...overrides,
		};
	}

	/**
	 * Simulate a service with gracePeriodDays=14 for the join call.
	 */
	function mockServiceGracePeriod(days: number) {
		mockLimit.mockResolvedValueOnce([{ gracePeriodDays: days }]);
	}

	test("returns package unchanged when not on installment plan", async () => {
		mockServiceGracePeriod(14);
		const pkg = makePackage({ paymentPlanType: null });
		mockFindFirst.mockResolvedValueOnce(pkg);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg);
		// No update should have been issued
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when already locked", async () => {
		mockServiceGracePeriod(14);
		const pkg = makePackage({ isLocked: true });
		mockFindFirst.mockResolvedValueOnce(pkg);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when not yet overdue (nextDueDate in future)", async () => {
		mockServiceGracePeriod(14);
		const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // +10 days
		const pkg = makePackage({ nextDueDate: future });
		mockFindFirst.mockResolvedValueOnce(pkg);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("overdue by 10 days with gracePeriodDays=14 → starts grace period, does NOT lock", async () => {
		// service grace = 14 days
		mockServiceGracePeriod(14);

		// nextDueDate was 10 days ago → overdue by 10 days
		const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
		const pkg = makePackage({ nextDueDate: tenDaysAgo, gracePeriodEndsAt: null });
		mockFindFirst.mockResolvedValueOnce(pkg);

		// installments query (findFirst for next pending)
		const mockInstallmentsFindFirst = mockTenantDb.query.installments.findFirst as ReturnType<typeof mock>;
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" });

		// update installments (mark overdue) — returns nothing significant
		const mockUpdateSet = mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockUpdateSet }));

		// update packageInstances (set gracePeriodEndsAt) — returns updated pkg
		const updatedPkg = { ...pkg, gracePeriodEndsAt: new Date(tenDaysAgo.getTime() + 14 * 24 * 60 * 60 * 1000) };
		const mockUpdateSet2 = mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([updatedPkg])) })) }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockUpdateSet2 }));

		// insert (logInstallmentEvent) — returns nothing significant
		mockInsertReturning.mockResolvedValueOnce([]);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result.isLocked).toBeFalsy();
		// gracePeriodEndsAt should have been set
		expect(result.gracePeriodEndsAt).toBeDefined();
	});

	test("overdue by 15 days with gracePeriodDays=14 → locks the package", async () => {
		// service grace = 14 days
		mockServiceGracePeriod(14);

		// nextDueDate was 15 days ago, grace period has already ended
		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
		const gracePeriodEndsAt = new Date(fifteenDaysAgo.getTime() + 14 * 24 * 60 * 60 * 1000); // ended 1 day ago
		const pkg = makePackage({ nextDueDate: fifteenDaysAgo, gracePeriodEndsAt });
		mockFindFirst.mockResolvedValueOnce(pkg);

		// installments query
		const mockInstallmentsFindFirst = mockTenantDb.query.installments.findFirst as ReturnType<typeof mock>;
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" });

		// update installments (mark overdue)
		const mockUpdateSet = mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockUpdateSet }));

		// update packageInstances (lock) — returns locked pkg
		const lockedPkg = { ...pkg, isLocked: true, lockedAt: new Date(), lockedReason: "non_payment" };
		const mockUpdateSet2 = mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([lockedPkg])) })) }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockUpdateSet2 }));

		// insert (logInstallmentEvent)
		mockInsertReturning.mockResolvedValueOnce([]);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result.isLocked).toBe(true);
	});
});
