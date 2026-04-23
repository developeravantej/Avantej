/**
 * Unit tests for the appointment.service.ts lock-check path.
 *
 * Specifically exercises the modified condition at A.1.5:
 *   if (lockedPkg.isLocked && !lockedPkg.allowCreditOverdraft) { throw ... }
 *
 * Three cases:
 *  1. isLocked=true  + allowCreditOverdraft=true  → booking proceeds (no throw)
 *  2. isLocked=true  + allowCreditOverdraft=false → throws "Package is locked..."
 *  3. isLocked=false + allowCreditOverdraft=false → booking proceeds (no throw)
 *
 * Implementation strategy:
 * createAppointment calls inside its transaction:
 *   - evaluateAndExpireIfOverdue(tx)  → select({id, status, expiresAt}).from().where() → limit(1) chain
 *   - evaluateAndLockIfOverdue(tx)    → tx.transaction() → select().from().leftJoin().where().limit(1) (grace period)
 *                                       + tx select().from().where().for("update") (pkg row)
 *   - A.1.3: tx.select().from().where().for("update") → lockedPkg
 *   - tx.insert().values().returning() → new appointment row
 *   - tx.insert().values() → audit log (writeAudit)
 *
 * We control which row the A.1.3 select returns to exercise the lock gate.
 * We stub the earlier select calls to return safe no-op values that cause
 * evaluateAndExpireIfOverdue and evaluateAndLockIfOverdue to early-return.
 */

import { describe, test, expect, mock } from "bun:test";
import { createAppointment } from "@avantej-core/services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLockedPkg(overrides: {
	isLocked: boolean;
	allowCreditOverdraft: boolean;
}) {
	return {
		id: "pi-lock-test",
		serviceId: "svc-1",
		clientId: null,
		source: "assigned",
		paymentStatus: "paid",
		paymentPlanType: "half",
		creditsTotal: 10,
		creditsUsed: 0,
		creditsRemaining: 10,
		creditsUnlocked: null,
		creditsAdminOverride: false,
		installmentsTotal: 2,
		installmentsPaid: 0,
		status: "active",
		startsAt: new Date(),
		expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		nextDueDate: null,
		gracePeriodEndsAt: null,
		isLocked: overrides.isLocked,
		allowCreditOverdraft: overrides.allowCreditOverdraft,
		lockedAt: overrides.isLocked ? new Date() : null,
		lockedReason: overrides.isLocked ? "non_payment" : null,
		createdAt: new Date(),
		updatedAt: new Date(),
		// generatedAlwaysAs columns need to be present for type compat
		purchaseNumber: null,
		paymentId: null,
		totalPrice: null,
		taxAmount: 0,
		paymentMethod: null,
		eSignature: null,
		termsAgreedAt: null,
		walkInCustomerId: null,
		assignedBy: null,
		remark: null,
	};
}

/**
 * Build a chainable select mock that returns different values on successive calls.
 *
 * call 0: evaluateAndExpireIfOverdue — returns [{ id, status:"active", expiresAt: future }]
 *         → service does nothing (not expired)
 * call 1: getGracePeriodDaysForPackage (leftJoin path) — returns [{ gracePeriodDays: 7 }]
 * call 2: evaluateAndLockIfOverdue inner FOR UPDATE — returns [pkg with isLocked state]
 *         → if isLocked is already set and pkg.isLocked==true in pkg, locks early-return;
 *           if pkg.isLocked==false, early-return (already locked / not overdue)
 * call 3: A.1.3 FOR UPDATE (the gate we're testing) — returns [lockedPkg]
 */
function buildMockDb(lockedPkg: ReturnType<typeof makeLockedPkg>) {
	// Pkg row used by evaluateAndLockIfOverdue's inner select (call 2)
	// This must have isLocked=true for the early-return to trigger (pkg already locked → return)
	// or nextDueDate=null for early-return (no due date → nothing to do)
	const innerPkg = {
		...lockedPkg,
		nextDueDate: null, // → evaluateAndLockIfOverdue returns early because "No due date set"
		isLocked: false,   // must be false so it doesn't hit the "already locked" early-return
		paymentPlanType: "half",
		installmentsPaid: 0,
		installmentsTotal: 2,
	};

	function makeSelectChain(result: unknown[]): Record<string, unknown> {
		const forMock = mock(() => Promise.resolve(result));
		const orderByMock = mock(() => Promise.resolve(result));
		const limitMock = mock(() => Promise.resolve(result));

		// whereMock must be both an object (so .for(), .limit() can be chained)
		// AND thenable (so `await ...where(...)` works when nothing is chained after it)
		const whereResult: Record<string, unknown> = {
			for: forMock,
			orderBy: orderByMock,
			limit: limitMock,
			returning: mock(() => Promise.resolve(result)),
			// Make it awaitable directly
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve(result).then(resolve),
		};
		const whereMock = mock(() => whereResult);

		const leftJoinResult: Record<string, unknown> = {
			where: whereMock,
			// Also make leftJoin chain awaitable
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve(result).then(resolve),
		};
		const leftJoinMock = mock(() => leftJoinResult);

		const fromResult: Record<string, unknown> = {
			where: whereMock,
			leftJoin: leftJoinMock,
			// Also make from chain awaitable
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve(result).then(resolve),
		};
		const fromMock = mock(() => fromResult);

		return { from: fromMock };
	}

	// update mock (not called in the happy path when no expiry/lock triggers)
	const updateMock = mock(() => ({
		set: mock(() => ({
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		})),
	}));

	// insert mock — appointment row + audit log
	const appointmentRow = {
		...lockedPkg,
		id: "appt-new-1",
		type: "private",
		startTime: new Date(),
		endTime: new Date(),
		duration: 60,
		status: "pending",
		packageInstanceId: lockedPkg.id,
		creditsUsed: 1,
	};
	let insertCount = 0;
	const insertMock = mock(() => {
		insertCount++;
		if (insertCount === 1) {
			// First insert: the appointment row itself — must return .returning()
			return {
				values: mock(() => ({
					returning: mock(() => Promise.resolve([appointmentRow])),
				})),
			};
		}
		// Audit log and any other inserts
		return {
			values: mock(() => Promise.resolve([])),
		};
	});

	// query mock — needed for buffer time check (resolveBufferTime), commission lookups
	const queryMock = {
		appointments: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		appointmentClients: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		commissionSplits: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		packageInstances: {
			findFirst: mock(() => Promise.resolve(innerPkg)),
			findMany: mock(() => Promise.resolve([])),
		},
		installments: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		services: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		bufferTimeRules: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
		commissionConfigs: {
			findFirst: mock(() => Promise.resolve(null)),
			findMany: mock(() => Promise.resolve([])),
		},
	};

	// The tx object — note: evaluateAndLockIfOverdue calls tx.transaction(innerCb)
	// so tx must have a transaction method. We make it call innerCb with tx itself
	// (single level of recursion is fine since inner select returns nextDueDate=null → early exit)
	let txSelectCount = 0;
	const txSelectResults = [
		// call 0 on tx: getGracePeriodDaysForPackage (called from evaluateAndLockIfOverdue)
		[{ gracePeriodDays: 7 }],
		// call 1 on tx: evaluateAndLockIfOverdue inner FOR UPDATE
		[innerPkg],
	];
	const txSelectMock = mock(() => {
		const result = txSelectResults[txSelectCount] ?? [];
		txSelectCount++;
		return makeSelectChain(result);
	});

	const txUpdateMock = mock(() => ({
		set: mock(() => ({
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		})),
	}));

	let txInsertCount = 0;
	const txInsertMock = mock(() => {
		txInsertCount++;
		if (txInsertCount === 1) {
			return {
				values: mock(() => ({
					returning: mock(() => Promise.resolve([appointmentRow])),
				})),
			};
		}
		return {
			values: mock(() => Promise.resolve([])),
		};
	});

	const tx: Record<string, unknown> = {
		select: txSelectMock,
		update: txUpdateMock,
		insert: txInsertMock,
		query: queryMock,
		// Inner transaction call from evaluateAndLockIfOverdue
		transaction: mock((cb: (innerTx: unknown) => Promise<unknown>) => {
			// For the inner transaction, reset tx select to handle the inner selects
			txSelectCount = 0;
			return cb(tx);
		}),
	};

	// Outer db — its transaction calls cb with tx
	// evaluateAndExpireIfOverdue is called on (tx as TenantDb) which uses tx.select
	// but the first call from createAppointment is on db.transaction → tx is passed in
	// Note: evaluateAndExpireIfOverdue is called as evaluateAndExpireIfOverdue(tx, ...)
	// so it uses tx.select (not db.select). Let's wire tx.select to handle call 0 too.
	// Actually looking at the code again:
	// Line 247: evaluateAndExpireIfOverdue(tx as unknown as TenantDb, params.packageInstanceId)
	// Line 248: evaluateAndLockIfOverdue(tx as unknown as NeonDatabase<...>, params.packageInstanceId)
	// Line 251-255: tx.select().from().where().for("update") → lockedPkg (A.1.3)
	// So ALL selects happen on tx, not on db. We need tx.select to handle all 4 calls.

	const allTxSelectResults = [
		// call 0: evaluateAndExpireIfOverdue (line 247 in createAppointment)
		[{ id: lockedPkg.id, status: "active", expiresAt: lockedPkg.expiresAt }],
		// call 1: evaluateAndExpireIfOverdue AGAIN (called internally by evaluateAndLockIfOverdue)
		[{ id: lockedPkg.id, status: "active", expiresAt: lockedPkg.expiresAt }],
		// call 2: getGracePeriodDaysForPackage (inside evaluateAndLockIfOverdue, before tx)
		[{ gracePeriodDays: 7 }],
		// call 3: evaluateAndLockIfOverdue FOR UPDATE (inside its inner transaction)
		[innerPkg],
		// call 4: A.1.3 FOR UPDATE (the gate we're testing, in createAppointment)
		[lockedPkg],
	];
	let allTxSelectCount = 0;
	const allTxSelectMock = mock(() => {
		const result = allTxSelectResults[allTxSelectCount] ?? [];
		allTxSelectCount++;
		return makeSelectChain(result);
	});

	(tx as any).select = allTxSelectMock;

	// Fix inner transaction to reset allTxSelectCount but only for the inner selects
	// evaluateAndLockIfOverdue calls tx.transaction(innerCb):
	//   innerCb needs: call 0→gracePeriod, call 1→inner FOR UPDATE
	// But by the time tx.transaction is called, allTxSelectCount is already 1 (after expiry check)
	// So the inner transaction starts at count 1, which maps to gracePeriodDays → correct
	// Then count 2 → innerPkg (FOR UPDATE) → correct
	// Then after the inner tx returns, A.1.3 select happens at count 3 → lockedPkg → correct
	(tx as any).transaction = mock((cb: (innerTx: unknown) => Promise<unknown>) => cb(tx));

	const db = {
		transaction: mock((cb: (txArg: unknown) => Promise<unknown>) => cb(tx)),
		query: queryMock,
		// db.select is never called directly (all calls go through tx)
		select: mock(() => makeSelectChain([])),
		update: updateMock,
		insert: insertMock,
	} as any;

	return db;
}

// Minimal valid createAppointment params (packageInstanceId triggers the lock path)
function makeParams(packageInstanceId: string) {
	return {
		type: "private" as const,
		startTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
		duration: 60,
		branchId: "branch-1",
		serviceId: "svc-1",
		createdBy: "staff-user-1",
		sessionTotal: 1,
		pricePerClient: 0,
		packageInstanceId,
		creditsUsed: 1,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("appointment.service.ts — lock-check gate (A.1.5)", () => {
	test("isLocked=true + allowCreditOverdraft=true → booking proceeds (no throw)", async () => {
		const pkg = makeLockedPkg({ isLocked: true, allowCreditOverdraft: true });
		const db = buildMockDb(pkg);

		// Overdraft flag bypasses the lock check — should resolve
		await expect(
			createAppointment(db, makeParams(pkg.id)),
		).resolves.toBeDefined();
	});

	test("isLocked=true + allowCreditOverdraft=false → throws locked error", async () => {
		const pkg = makeLockedPkg({ isLocked: true, allowCreditOverdraft: false });
		const db = buildMockDb(pkg);

		await expect(
			createAppointment(db, makeParams(pkg.id)),
		).rejects.toThrow(
			"Package is locked due to unpaid installment. Please complete your payment to continue booking.",
		);
	});

	test("isLocked=false + allowCreditOverdraft=false → booking proceeds (no throw)", async () => {
		const pkg = makeLockedPkg({ isLocked: false, allowCreditOverdraft: false });
		const db = buildMockDb(pkg);

		// Not locked at all → booking should proceed regardless of overdraft flag
		await expect(
			createAppointment(db, makeParams(pkg.id)),
		).resolves.toBeDefined();
	});
});
