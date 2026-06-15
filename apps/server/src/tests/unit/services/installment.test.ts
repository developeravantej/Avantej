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
const mockLimit = mock(() => Promise.resolve(mockSelectResult));
const mockWhere = mock(() => ({ limit: mockLimit }));
const mockLeftJoin = mock(() => ({ where: mockWhere }));
// mockDirectWhere: used by select().from().where() (no join) — e.g. evaluateAndExpireIfOverdue
const mockDirectWhere = mock(() => Promise.resolve([]));
const mockFrom = mock(() => ({
	leftJoin: mockLeftJoin,
	where: mockDirectWhere,
}));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockFindFirst = mock(() => Promise.resolve(null));
const mockFindMany = mock(() => Promise.resolve([]));
const mockInstallmentsFindFirst = mock(() => Promise.resolve(null));
const mockReturning = mock(() => Promise.resolve([]));
const mockSet = mock(() => ({
	where: mock(() => ({ returning: mockReturning })),
}));
const mockUpdate = mock(() => ({ set: mockSet }));
const mockInsertReturning = mock(() => Promise.resolve([]));
const mockInsertValues = mock(() => ({ returning: mockInsertReturning }));
const mockInsert = mock(() => ({ values: mockInsertValues }));

// Transaction inner chain: tx.select().from().where().for("update")
const mockForUpdate = mock(() => Promise.resolve([]));
const mockTxInnerWhere = mock(() => ({ for: mockForUpdate }));
const mockTxFrom = mock(() => ({ where: mockTxInnerWhere }));
const mockTxSelect = mock(() => ({ from: mockTxFrom }));

// Transaction mock: calls callback with a tx that shares update/insert/query
const mockTransaction = mock((callback: (tx: unknown) => Promise<unknown>) => {
	const tx = {
		select: mockTxSelect,
		update: mockUpdate,
		insert: mockInsert,
		query: {
			packageInstances: { findFirst: mockFindFirst, findMany: mockFindMany },
			installments: {
				findFirst: mockInstallmentsFindFirst,
				findMany: mock(() => Promise.resolve([])),
			},
		},
	};
	return callback(tx);
});

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
	mockDirectWhere.mockClear();
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
	mockForUpdate.mockClear();
	mockTxInnerWhere.mockClear();
	mockTxFrom.mockClear();
	mockTxSelect.mockClear();
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

		const result = await getGracePeriodDaysForPackage(
			mockTenantDb,
			"nonexistent",
		);

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
	function makePackage(
		overrides: Partial<{
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
		}> = {},
	) {
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
		// tx.select().from().where().for("update") → [pkg]
		mockForUpdate.mockResolvedValueOnce([pkg] as any);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg as any);
		// No update should have been issued (early-exit inside tx)
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when already locked", async () => {
		mockServiceGracePeriod(14);
		const pkg = makePackage({ isLocked: true });
		mockForUpdate.mockResolvedValueOnce([pkg] as any);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg as any);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns package unchanged when not yet overdue (nextDueDate in future)", async () => {
		mockServiceGracePeriod(14);
		const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // +10 days
		const pkg = makePackage({ nextDueDate: future });
		mockForUpdate.mockResolvedValueOnce([pkg] as any);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result).toEqual(pkg as any);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("overdue by 10 days with gracePeriodDays=14 → starts grace period, does NOT lock", async () => {
		mockServiceGracePeriod(14);

		const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
		const pkg = makePackage({
			nextDueDate: tenDaysAgo,
			gracePeriodEndsAt: null,
		});
		// tx.select().from().where().for("update") → [pkg]
		mockForUpdate.mockResolvedValueOnce([pkg] as any);

		// tx.update(installments)…returning() → [] (no overdue rows yet)
		const mkUpdateSet = (rows: unknown[]) =>
			mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve(rows)) })),
			}));
		mockUpdate.mockImplementationOnce(() => ({ set: mkUpdateSet([]) }));

		// tx.query.installments.findFirst → first overdue installment
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" } as any);

		// tx.update(packageInstances)…returning() → updatedPkg with gracePeriodEndsAt set
		const updatedPkg = {
			...pkg,
			gracePeriodEndsAt: new Date(
				tenDaysAgo.getTime() + 14 * 24 * 60 * 60 * 1000,
			),
		};
		mockUpdate.mockImplementationOnce(() => ({
			set: mkUpdateSet([updatedPkg]),
		}));

		// tx.insert(installmentEvents).values(…).returning() for logInstallmentEvent
		mockInsertReturning.mockResolvedValueOnce([]);

		const result = await evaluateAndLockIfOverdue(mockTenantDb, "pi-test");

		expect(result.isLocked).toBeFalsy();
		expect(result.gracePeriodEndsAt).toBeDefined();
	});

	test("overdue by 15 days with gracePeriodDays=14 → locks the package", async () => {
		mockServiceGracePeriod(14);

		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
		const gracePeriodEndsAt = new Date(
			fifteenDaysAgo.getTime() + 14 * 24 * 60 * 60 * 1000,
		); // ended 1 day ago
		const pkg = makePackage({ nextDueDate: fifteenDaysAgo, gracePeriodEndsAt });
		mockForUpdate.mockResolvedValueOnce([pkg] as any);

		const mkUpdateSet = (rows: unknown[]) =>
			mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve(rows)) })),
			}));

		// update installments → [] (overdueRows empty)
		mockUpdate.mockImplementationOnce(() => ({ set: mkUpdateSet([]) }));

		// tx.query.installments.findFirst → first overdue
		mockInstallmentsFindFirst.mockResolvedValueOnce({ id: "inst-1" } as any);

		// update packageInstances (lock) → lockedPkg
		const lockedPkg = {
			...pkg,
			isLocked: true,
			lockedAt: new Date(),
			lockedReason: "non_payment",
		};
		mockUpdate.mockImplementationOnce(() => ({
			set: mkUpdateSet([lockedPkg]),
		}));

		// logInstallmentEvent insert
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
	function makePackageInstance(
		overrides: {
			id?: string;
			nextDueDate?: Date | null;
			gracePeriodEndsAt?: Date | null;
			isLocked?: boolean;
			paymentPlanType?: string | null;
			serviceId?: string;
			clientId?: string | null;
			[key: string]: unknown;
		} = {},
	) {
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

		const result = await getAdminInstallmentOverview(db, {
			status: "due_soon",
		});

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

		const result = await getAdminInstallmentOverview(db, {
			status: "due_soon",
		});

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

		const result = await getAdminInstallmentOverview(db, {
			status: "due_soon",
		});

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

		const result = await getAdminInstallmentOverview(db, {
			status: "due_soon",
		});

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
	function makePkg(
		overrides: Partial<{
			id: string;
			allowCreditOverdraft: boolean;
			updatedAt: Date;
		}> = {},
	) {
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

		const result = await setPackageOverdraft(
			db,
			pkg.id,
			true,
			"VIP customer",
			actor,
		);

		expect(result.allowCreditOverdraft).toBe(true);
		// update was called once (package row)
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// insert was called twice: installmentEvents + auditLog
		expect(mockInsert).toHaveBeenCalledTimes(2);
		// first insert values contain overdraft_enabled eventType
		const firstInsertArg = (mockInsertValues.mock.calls as any)[0]?.[0] as any;
		expect(firstInsertArg?.eventType).toBe("overdraft_enabled");
	});

	test("enable when already enabled → no-op, no audit row, no event row", async () => {
		const pkg = makePkg({ allowCreditOverdraft: true });

		const mockInsert = mock(() => ({
			values: mock(() => Promise.resolve([])),
		}));
		const mockUpdate = mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
			})),
		}));

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

		const result = await setPackageOverdraft(
			db,
			pkg.id,
			true,
			"already on",
			actor,
		);

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

		const result = await setPackageOverdraft(
			db,
			pkg.id,
			false,
			"payment cleared",
			actor,
		);

		expect(result.allowCreditOverdraft).toBe(false);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		// event row written with overdraft_disabled
		const firstInsertArg = (mockInsertValues.mock.calls as any)[0]?.[0] as any;
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
