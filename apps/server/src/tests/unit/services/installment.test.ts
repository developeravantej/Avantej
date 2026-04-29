import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	DEFAULT_GRACE_PERIOD_DAYS,
	getGracePeriodDaysForPackage,
	evaluateAndLockIfOverdue,
	getAdminInstallmentOverview,
	setPackageOverdraft,
} from "@avantej-core/services";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

// ---------------------------------------------------------------------------
// Shared mock primitives
// ---------------------------------------------------------------------------

const mockSelectResult: any[] = [];

// `.limit(n)` — used by getGracePeriodDaysForPackage
const mockLimit = mock(() => Promise.resolve(mockSelectResult));

// `.for("update")` — used inside evaluateAndLockIfOverdue's transaction
// Each test pushes the pkg row(s) it expects via mockForUpdate.mockResolvedValueOnce([pkg]).
const mockForUpdate = mock(() => Promise.resolve([] as any[]));

// The terminal of `.where(...)` must be:
//   - thenable (to satisfy `select().from().where()` in evaluateAndExpireIfOverdue)
//   - have `.limit(...)` (for getGracePeriodDaysForPackage)
//   - have `.for(mode)` (for the select-for-update inside the transaction)
function makeWhereResult() {
	return {
		limit: mockLimit,
		for: mockForUpdate,
		then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
			Promise.resolve(mockSelectResult).then(resolve, reject),
	};
}

const mockWhere = mock(() => makeWhereResult());
const mockLeftJoin = mock(() => ({ where: mockWhere }));
// `.from(...)` must support both `.leftJoin(...).where(...)` and direct `.where(...)`.
const mockFrom = mock(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockFindFirst = mock(() => Promise.resolve(null));
const mockFindMany = mock(() => Promise.resolve([]));
const mockReturning = mock(() => Promise.resolve([]));
const mockSet = mock(() => ({ where: mock(() => ({ returning: mockReturning }) ) }));
const mockUpdate = mock(() => ({ set: mockSet }));
const mockInsertReturning = mock(() => Promise.resolve([]));
const mockInsertValues = mock(() => ({ returning: mockInsertReturning }));
const mockInsert = mock(() => ({ values: mockInsertValues }));

// `transaction(cb)` invokes cb with the same mockTenantDb so test assertions on
// mockUpdate / mockInsert capture both outer and tx-scoped calls uniformly.
const mockTransaction = mock(
	(cb: (tx: unknown) => Promise<unknown>) => cb(mockTenantDb),
);

const mockInstallmentsFindFirst = mock(() => Promise.resolve(null));

const mockTenantDb = {
	select: mockSelect,
	update: mockUpdate,
	insert: mockInsert,
	transaction: mockTransaction,
	query: {
		packageInstances: {
			findFirst: mockFindFirst,
			findMany: mockFindMany,
		},
		installments: {
			findFirst: mockInstallmentsFindFirst,
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
	mockForUpdate.mockClear();
	mockFindFirst.mockClear();
	mockFindMany.mockClear();
	mockInstallmentsFindFirst.mockClear();
	mockReturning.mockClear();
	mockInsert.mockClear();
	mockInsertValues.mockClear();
	mockInsertReturning.mockClear();
	mockUpdate.mockClear();
	mockSet.mockClear();
	mockTransaction.mockClear();
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
		// Service reads pkg via select-for-update inside the transaction
		mockForUpdate.mockResolvedValueOnce([pkg]);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg);
		// No update should have been issued
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when already locked", async () => {
		mockServiceGracePeriod(14);
		const pkg = makePackage({ isLocked: true });
		mockForUpdate.mockResolvedValueOnce([pkg]);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when not yet overdue (nextDueDate in future)", async () => {
		mockServiceGracePeriod(14);
		const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // +10 days
		const pkg = makePackage({ nextDueDate: future });
		mockForUpdate.mockResolvedValueOnce([pkg]);

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
		mockForUpdate.mockResolvedValueOnce([pkg]);

		// installments query (findFirst for next pending)
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" } as any);

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
		mockForUpdate.mockResolvedValueOnce([pkg]);

		// installments query
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" } as any);

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

// ---------------------------------------------------------------------------
// Tests: getAdminInstallmentOverview — due_soon filter
// ---------------------------------------------------------------------------

describe("due_soon filter", () => {
	/**
	 * Build a minimal package instance fixture for due_soon tests.
	 * nextDueDate is relative to now, computed at call time.
	 */
	function makePackageInstance(overrides: {
		id?: string;
		nextDueDate?: Date | null;
		gracePeriodEndsAt?: Date | null;
		isLocked?: boolean;
		paymentPlanType?: string | null;
		serviceId?: string;
		clientId?: string | null;
		[key: string]: unknown;
	} = {}) {
		return {
			id: "pi-due-1",
			paymentPlanType: "half",
			serviceId: "svc-1",
			clientId: null,
			isLocked: false,
			gracePeriodEndsAt: null,
			nextDueDate: null,
			creditsTotal: 10,
			creditsUsed: 0,
			creditsUnlocked: 5,
			creditsRemaining: 5,
			purchaseNumber: "P001",
			...overrides,
		};
	}

	test("(a) package with nextDueDate in 5 days → included in results", async () => {
		const db = createMockTenantDb() as any;
		const in5d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
		const pkg = makePackageInstance({ id: "pi-a", nextDueDate: in5d });

		// findMany for packageInstances returns the matching package
		db.query.packageInstances = {
			findMany: mock(() => Promise.resolve([pkg])),
			findFirst: mock(() => Promise.resolve(undefined)),
		};
		// findMany for services (join)
		db.query.services = {
			findMany: mock(() => Promise.resolve([])),
		};
		// select chain for the batch installments query and COUNT — override select to return []
		db.select = mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					orderBy: mock(() => Promise.resolve([])),
				})),
			})),
		}));
		// Provide a separate select mock that handles the COUNT aggregate
		// by returning a count row for the second call
		let selectCallCount = 0;
		db.select = mock(() => {
			selectCallCount++;
			if (selectCallCount === 1) {
				// batch installments select
				return {
					from: mock(() => ({
						where: mock(() => ({
							orderBy: mock(() => Promise.resolve([])),
						})),
					})),
				};
			}
			// COUNT select
			return {
				from: mock(() => ({
					where: mock(() => Promise.resolve([{ count: 1 }])),
				})),
			};
		});

		const result = await getAdminInstallmentOverview(db, { status: "due_soon" });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.id).toBe("pi-a");
		expect(result.total).toBe(1);
		// findMany was called — confirming due_soon branch hit the query path
		expect(db.query.packageInstances.findMany).toHaveBeenCalledTimes(1);
	});

	test("(b) package with nextDueDate in 20 days → excluded (SQL filters it out)", async () => {
		const db = createMockTenantDb() as any;
		// SQL excludes this row — simulate by returning empty array from findMany
		db.query.packageInstances = {
			findMany: mock(() => Promise.resolve([])),
			findFirst: mock(() => Promise.resolve(undefined)),
		};
		db.query.services = {
			findMany: mock(() => Promise.resolve([])),
		};
		let selectCallCount2 = 0;
		db.select = mock(() => {
			selectCallCount2++;
			if (selectCallCount2 === 1) {
				return {
					from: mock(() => ({
						where: mock(() => ({
							orderBy: mock(() => Promise.resolve([])),
						})),
					})),
				};
			}
			return {
				from: mock(() => ({
					where: mock(() => Promise.resolve([{ count: 0 }])),
				})),
			};
		});

		const result = await getAdminInstallmentOverview(db, { status: "due_soon" });

		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	test("(c) package in grace period (gracePeriodEndsAt set) → excluded even if nextDueDate < 14d", async () => {
		const db = createMockTenantDb() as any;
		// The due_soon filter requires gracePeriodEndsAt IS NULL — SQL excludes this row
		db.query.packageInstances = {
			findMany: mock(() => Promise.resolve([])),
			findFirst: mock(() => Promise.resolve(undefined)),
		};
		db.query.services = {
			findMany: mock(() => Promise.resolve([])),
		};
		let selectCallCount3 = 0;
		db.select = mock(() => {
			selectCallCount3++;
			if (selectCallCount3 === 1) {
				return {
					from: mock(() => ({
						where: mock(() => ({
							orderBy: mock(() => Promise.resolve([])),
						})),
					})),
				};
			}
			return {
				from: mock(() => ({
					where: mock(() => Promise.resolve([{ count: 0 }])),
				})),
			};
		});

		const result = await getAdminInstallmentOverview(db, { status: "due_soon" });

		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	test("(d) locked package → excluded even if nextDueDate is in 5 days", async () => {
		const db = createMockTenantDb() as any;
		// The due_soon filter requires isLocked = false — SQL excludes locked packages
		db.query.packageInstances = {
			findMany: mock(() => Promise.resolve([])),
			findFirst: mock(() => Promise.resolve(undefined)),
		};
		db.query.services = {
			findMany: mock(() => Promise.resolve([])),
		};
		let selectCallCount4 = 0;
		db.select = mock(() => {
			selectCallCount4++;
			if (selectCallCount4 === 1) {
				return {
					from: mock(() => ({
						where: mock(() => ({
							orderBy: mock(() => Promise.resolve([])),
						})),
					})),
				};
			}
			return {
				from: mock(() => ({
					where: mock(() => Promise.resolve([{ count: 0 }])),
				})),
			};
		});

		const result = await getAdminInstallmentOverview(db, { status: "due_soon" });

		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tests: setPackageOverdraft
// ---------------------------------------------------------------------------

describe("setPackageOverdraft", () => {
	const actor = { userId: "user-1", memberId: "member-1", role: "admin" };

	/**
	 * Build a minimal package instance fixture for overdraft tests.
	 */
	function makePkg(overrides: Partial<{
		id: string;
		allowCreditOverdraft: boolean;
		updatedAt: Date;
	}> = {}) {
		return {
			id: "pi-overdraft-1",
			serviceId: "svc-1",
			clientId: null,
			source: "assigned",
			paymentStatus: "paid",
			creditsTotal: 10,
			creditsUsed: 0,
			creditsRemaining: 10,
			creditsUnlocked: null,
			creditsAdminOverride: false,
			allowCreditOverdraft: false,
			isLocked: true,
			lockedAt: new Date(),
			lockedReason: "non_payment",
			installmentsTotal: 2,
			installmentsPaid: 0,
			paymentPlanType: "half",
			status: "active",
			startsAt: new Date(),
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			nextDueDate: null,
			gracePeriodEndsAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	test("enable → sets flag to true, writes event row and audit row", async () => {
		const pkg = makePkg({ allowCreditOverdraft: false });
		const updatedPkg = { ...pkg, allowCreditOverdraft: true };

		// transaction mock calls the callback with a nested db instance
		// We need to control what the nested tx does:
		// 1. select().from().where().for("update") → [pkg]
		// 2. update().set().where().returning() → [updatedPkg]
		// 3. insert().values() → (installmentEvents)
		// 4. insert().values() → (auditLog via writeAudit)

		const mockInsertValues = mock(() => Promise.resolve([]));
		const mockInsert = mock(() => ({ values: mockInsertValues }));

		const mockForUpdate = mock(() => Promise.resolve([pkg]));
		const mockSelectWhere = mock(() => ({ for: mockForUpdate }));
		const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
		const mockSelect = mock(() => ({ from: mockSelectFrom }));

		const mockUpdateReturning = mock(() => Promise.resolve([updatedPkg]));
		const mockUpdateWhere = mock(() => ({ returning: mockUpdateReturning }));
		const mockUpdateSet = mock(() => ({ where: mockUpdateWhere }));
		const mockUpdate = mock(() => ({ set: mockUpdateSet }));

		const tx = {
			select: mockSelect,
			update: mockUpdate,
			insert: mockInsert,
		} as any;

		const db = {
			transaction: mock((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
		} as any;

		const result = await setPackageOverdraft(db, pkg.id, true, "VIP customer", actor);

		expect(result.allowCreditOverdraft).toBe(true);
		// update was called once (package row)
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// insert was called twice: installmentEvents + auditLog
		expect(mockInsert).toHaveBeenCalledTimes(2);
		// first insert values contain overdraft_enabled eventType
		const firstInsertArg = mockInsertValues.mock.calls[0]?.[0] as any;
		expect(firstInsertArg?.eventType).toBe("overdraft_enabled");
	});

	test("enable when already enabled → no-op, no audit row, no event row", async () => {
		const pkg = makePkg({ allowCreditOverdraft: true });

		const mockInsert = mock(() => ({ values: mock(() => Promise.resolve([])) }));
		const mockUpdate = mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })) }));

		const mockForUpdate = mock(() => Promise.resolve([pkg]));
		const mockSelectWhere = mock(() => ({ for: mockForUpdate }));
		const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
		const mockSelect = mock(() => ({ from: mockSelectFrom }));

		const tx = {
			select: mockSelect,
			update: mockUpdate,
			insert: mockInsert,
		} as any;

		const db = {
			transaction: mock((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
		} as any;

		const result = await setPackageOverdraft(db, pkg.id, true, "already on", actor);

		// Returns original pkg without modification
		expect(result.allowCreditOverdraft).toBe(true);
		// No update, no insert (idempotent)
		expect(mockUpdate).not.toHaveBeenCalled();
		expect(mockInsert).not.toHaveBeenCalled();
	});

	test("disable → sets flag to false, writes overdraft_disabled event", async () => {
		const pkg = makePkg({ allowCreditOverdraft: true });
		const updatedPkg = { ...pkg, allowCreditOverdraft: false };

		const mockInsertValues = mock(() => Promise.resolve([]));
		const mockInsert = mock(() => ({ values: mockInsertValues }));

		const mockForUpdate = mock(() => Promise.resolve([pkg]));
		const mockSelectWhere = mock(() => ({ for: mockForUpdate }));
		const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
		const mockSelect = mock(() => ({ from: mockSelectFrom }));

		const mockUpdateReturning = mock(() => Promise.resolve([updatedPkg]));
		const mockUpdateWhere = mock(() => ({ returning: mockUpdateReturning }));
		const mockUpdateSet = mock(() => ({ where: mockUpdateWhere }));
		const mockUpdate = mock(() => ({ set: mockUpdateSet }));

		const tx = {
			select: mockSelect,
			update: mockUpdate,
			insert: mockInsert,
		} as any;

		const db = {
			transaction: mock((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
		} as any;

		const result = await setPackageOverdraft(db, pkg.id, false, "payment cleared", actor);

		expect(result.allowCreditOverdraft).toBe(false);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// event row written with overdraft_disabled
		const firstInsertArg = mockInsertValues.mock.calls[0]?.[0] as any;
		expect(firstInsertArg?.eventType).toBe("overdraft_disabled");
	});

	test("non-existent packageInstanceId → throws 'Package instance not found'", async () => {
		const mockForUpdate = mock(() => Promise.resolve([])); // empty — not found
		const mockSelectWhere = mock(() => ({ for: mockForUpdate }));
		const mockSelectFrom = mock(() => ({ where: mockSelectWhere }));
		const mockSelect = mock(() => ({ from: mockSelectFrom }));

		const tx = {
			select: mockSelect,
		} as any;

		const db = {
			transaction: mock((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
		} as any;

		await expect(
			setPackageOverdraft(db, "nonexistent-id", true, "test", actor),
		).rejects.toThrow("Package instance not found");
	});
});
