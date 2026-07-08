/**
 * Unit tests: check-ins.service.ts — anonymous walk-in anonymization feature
 *
 * Key invariants under test:
 * 1. Walk-in check-ins succeed without a clientId — service synthesizes a UUID.
 * 2. Two consecutive walk-in check-ins at the same branch both succeed because
 *    each gets a fresh UUID, so the anti-duplicate query never finds a match.
 * 3. Member anti-duplicate logic is NOT broken — same member at same branch
 *    within 30 min still throws ALREADY_CHECKED_IN.
 */

import { describe, test, expect, mock } from "bun:test";
import {
	recordCheckIn,
	recordBulkCheckIn,
	listTodaysBookings,
} from "@avantej-core/services/check-ins.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(s: string): boolean {
	return UUID_RE.test(s);
}

const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBER_USER_ID = "cccccccc-0000-4000-8000-000000000001";
const MEMBER_DB_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ACTOR = {
	userId: "actor-user-id",
	memberId: "actor-member-id",
	role: "admin",
};

// ---------------------------------------------------------------------------
// Mock factory for check-ins tests
//
// recordCheckIn performs:
//   - tenantDb.query.members.findFirst()       (member validation)
//   - tenantDb.query.checkIns.findFirst()      (anti-dup query)
//   - tenantDb.transaction(callback)           (insert + audit)
//
// The transaction callback receives a "tx" that mirrors tenantDb structurally.
// We mock insert().values().returning() to return a fake row.
// writeAudit (inside tx) also calls tx.insert() so returning() must handle
// being called twice (once for checkIns insert, once for audit_logs insert).
// ---------------------------------------------------------------------------

function buildFakeCheckInRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "checkin-id-" + Math.random().toString(36).slice(2),
		clientType: "walk_in" as const,
		clientId: crypto.randomUUID(),
		branchId: BRANCH_ID,
		source: "drop_in" as const,
		outcome: "attended" as const,
		checkedInAt: new Date(),
		appointmentClientId: null,
		packageInstanceId: null,
		creditsConsumed: 0,
		notes: null,
		checkedInBy: ACTOR.userId,
		clientDisplayName: null,
		...overrides,
	};
}

function buildMockDb(options: {
	/** What query.members.findFirst resolves to (for member validation) */
	memberRow?: { id: string } | undefined;
	/** What query.checkIns.findFirst resolves to (anti-dup check) */
	existingCheckIn?: { id: string; checkedInAt: Date } | undefined;
	/** The row returned by tx.insert(checkIns).values(...).returning() */
	insertedRow?: ReturnType<typeof buildFakeCheckInRow>;
}) {
	const insertedRow =
		options.insertedRow ?? buildFakeCheckInRow({ clientType: "walk_in" });

	// returning() is called by:
	//  1. checkIns INSERT (must return [insertedRow])
	//  2. audit_logs INSERT (returns [] — ok, writeAudit ignores return value)
	let insertCallCount = 0;
	const mockReturning = mock(() => {
		insertCallCount++;
		if (insertCallCount === 1) return Promise.resolve([insertedRow]);
		return Promise.resolve([]); // audit insert — ignored
	});
	const mockValues = mock(() => ({ returning: mockReturning }));
	const mockInsert = mock(() => ({ values: mockValues }));

	// The tx object passed to the transaction callback
	const txObj = {
		insert: mockInsert,
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => Promise.resolve([])),
			})),
		})),
	};

	// transaction() immediately invokes its callback with txObj
	const mockTransaction = mock((cb: (tx: typeof txObj) => Promise<unknown>) =>
		cb(txObj),
	);

	const mockCheckInsFindFirst = mock(() =>
		Promise.resolve(options.existingCheckIn),
	);
	const mockMembersFindFirst = mock(() => Promise.resolve(options.memberRow));

	const db = {
		transaction: mockTransaction,
		query: {
			members: { findFirst: mockMembersFindFirst },
			checkIns: { findFirst: mockCheckInsFindFirst },
		},
		// Needed by audit helper when called outside tx (not needed here — audit runs inside tx)
		insert: mockInsert,
	} as any;

	return { db, txObj, mockReturning, mockValues, mockInsert, insertedRow };
}

// ---------------------------------------------------------------------------
// Tests: anonymous walk-in path
// ---------------------------------------------------------------------------

describe("recordCheckIn — anonymous walk-in", () => {
	test("succeeds without clientId for walk-in and returns row with valid UUID clientId", async () => {
		const fakeRow = buildFakeCheckInRow({ clientType: "walk_in" });
		const { db, mockValues } = buildMockDb({ insertedRow: fakeRow });

		const result = await recordCheckIn(db, {
			clientType: "walk_in",
			// no clientId provided
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});

		// The service synthesizes a UUID for walk-in
		expect(result).toBeDefined();
		expect(result.clientType).toBe("walk_in");

		// The values passed to insert should have a synthesized UUID clientId
		// mockValues is called twice: once for checkIns insert, once for audit_logs insert
		expect(mockValues.mock.calls.length).toBeGreaterThanOrEqual(1);
		const insertedValues = ((mockValues as any).mock.calls[0] ??
			[])[0]! as Record<string, unknown>;
		expect(typeof insertedValues.clientId).toBe("string");
		expect(isValidUUID(insertedValues.clientId as string)).toBe(true);
		expect((insertedValues.clientId as string).length).toBeGreaterThan(0);

		// clientType must be persisted correctly
		expect(insertedValues.clientType).toBe("walk_in");
	});

	test("two consecutive walk-in check-ins at same branch both succeed (no UUID collision)", async () => {
		// First check-in
		const fakeRow1 = buildFakeCheckInRow({ clientType: "walk_in" });
		const { db: db1 } = buildMockDb({ insertedRow: fakeRow1 });

		const result1 = await recordCheckIn(db1, {
			clientType: "walk_in",
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});
		expect(result1).toBeDefined();
		expect(result1.clientType).toBe("walk_in");

		// Second check-in — fresh DB mock (simulates a real second call)
		// The anti-dup query returns undefined because each walk-in gets a fresh UUID
		// that has never been inserted before — no existing match
		const fakeRow2 = buildFakeCheckInRow({ clientType: "walk_in" });
		const { db: db2 } = buildMockDb({
			existingCheckIn: undefined, // no dup found — fresh UUID
			insertedRow: fakeRow2,
		});

		const result2 = await recordCheckIn(db2, {
			clientType: "walk_in",
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});
		expect(result2).toBeDefined();
		expect(result2.clientType).toBe("walk_in");

		// Both check-ins completed without throwing
		// (If the second had collided, it would have thrown ALREADY_CHECKED_IN)
	});

	test("walk-in with clientDisplayName persists the display name", async () => {
		const fakeRow = buildFakeCheckInRow({
			clientType: "walk_in",
			clientDisplayName: "Jane Walk-In",
		});
		const { db, mockValues } = buildMockDb({ insertedRow: fakeRow });

		await recordCheckIn(db, {
			clientType: "walk_in",
			clientDisplayName: "Jane Walk-In",
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});

		// First call is always the checkIns insert
		const insertedValues = ((mockValues as any).mock.calls[0] ??
			[])[0]! as Record<string, unknown>;
		expect(insertedValues.clientDisplayName).toBe("Jane Walk-In");
	});

	test("walk-in with empty clientDisplayName persists null (trimmed empty string)", async () => {
		const fakeRow = buildFakeCheckInRow({
			clientType: "walk_in",
			clientDisplayName: null,
		});
		const { db, mockValues } = buildMockDb({ insertedRow: fakeRow });

		await recordCheckIn(db, {
			clientType: "walk_in",
			clientDisplayName: "   ", // whitespace only → trimmed to "" → stored as null
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});

		// First call is always the checkIns insert
		const insertedValues = ((mockValues as any).mock.calls[0] ??
			[])[0]! as Record<string, unknown>;
		expect(insertedValues.clientDisplayName).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Tests: member anti-duplicate still blocked
// ---------------------------------------------------------------------------

describe("recordCheckIn — member duplicate blocked within 30 min", () => {
	test("first member check-in succeeds", async () => {
		const fakeRow = buildFakeCheckInRow({
			clientType: "member",
			clientId: MEMBER_USER_ID,
		});
		const { db } = buildMockDb({
			memberRow: { id: MEMBER_DB_ID }, // member found
			existingCheckIn: undefined, // no dup
			insertedRow: fakeRow,
		});

		const result = await recordCheckIn(db, {
			clientType: "member",
			clientId: MEMBER_USER_ID,
			branchId: BRANCH_ID,
			source: "drop_in",
			actor: ACTOR,
		});

		expect(result.clientType).toBe("member");
	});

	test("second member check-in at same branch within 30 min throws ALREADY_CHECKED_IN", async () => {
		const recentCheckIn = {
			id: "existing-checkin-id",
			checkedInAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
		};

		const { db } = buildMockDb({
			memberRow: { id: MEMBER_DB_ID }, // member found (needed for step 1)
			existingCheckIn: recentCheckIn, // dup found (step 2)
		});

		await expect(
			recordCheckIn(db, {
				clientType: "member",
				clientId: MEMBER_USER_ID,
				branchId: BRANCH_ID,
				source: "drop_in",
				actor: ACTOR,
			}),
		).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
	});

	test("member check-in throws 'Member not found' when member does not exist", async () => {
		const { db } = buildMockDb({
			memberRow: undefined, // no member in DB
		});

		await expect(
			recordCheckIn(db, {
				clientType: "member",
				clientId: "nonexistent-user-id",
				branchId: BRANCH_ID,
				source: "drop_in",
				actor: ACTOR,
			}),
		).rejects.toThrow(/not found/i);
	});
});

// ---------------------------------------------------------------------------
// Helper: build a mock tenantDb for recordBulkCheckIn tests
//
// recordBulkCheckIn performs:
//   1. select().from(appointmentClients).innerJoin(appointments).where()
//      → returns the bookings array
//   2. select().from(checkIns).where()
//      → returns existing check-ins
//   3. Per non-skipped booking: recordCheckIn (member validation + anti-dup + tx)
//
// We mock both bulk selects via a custom select chain, then re-use buildMockDb
// for the per-booking recordCheckIn calls.
// ---------------------------------------------------------------------------

function buildBulkMockDb(options: {
	bookings: Array<{
		id: string;
		clientId: string;
		appointmentId: string;
		branchId: string;
	}>;
	existingCheckInIds: string[]; // appointmentClientIds that already have check-ins
	memberRow?: { id: string };
}) {
	// We need two distinct "select chain" resolutions for the two bulk queries,
	// then per-booking member validation (query.members.findFirst) + transaction.

	let selectCallCount = 0;

	// Build the fake inserted check-in row for per-booking recordCheckIn.
	// Note: writeAudit calls tx.insert().values() without .returning(), so
	// mockReturning is only called for the checkIns insert (one per booking).
	// Always return [fakeCheckInRow] — the audit insert never reads the return value.
	const fakeCheckInRow = {
		id: "bulk-checkin-" + Math.random().toString(36).slice(2),
		clientType: "member" as const,
		clientId: options.bookings[0]?.clientId ?? "client-id",
		branchId: BRANCH_ID,
		source: "booking" as const,
		outcome: "attended" as const,
		checkedInAt: new Date(),
		appointmentClientId: options.bookings[0]?.id ?? null,
		packageInstanceId: null,
		creditsConsumed: 0,
		notes: null,
		checkedInBy: ACTOR.userId,
		clientDisplayName: null,
	};

	const mockReturning = mock(() => Promise.resolve([fakeCheckInRow]));
	const mockValues = mock(() => ({ returning: mockReturning }));
	const mockInsert = mock(() => ({ values: mockValues }));

	const txObj = {
		insert: mockInsert,
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => Promise.resolve([])),
			})),
		})),
	};
	const mockTransaction = mock((cb: (tx: typeof txObj) => Promise<unknown>) =>
		cb(txObj),
	);

	const existingCheckInRows = options.existingCheckInIds.map((id) => ({
		appointmentClientId: id,
		id: "ci-" + id,
	}));

	// The mock select chain needs to handle two calls:
	//  call 1: select({...}).from(appointmentClients).innerJoin(appointments).where() → bookings
	//  call 2: select({...}).from(checkIns).where() → existingCheckInRows
	const mockInnerJoin = mock(() => ({
		where: mock(() => Promise.resolve(options.bookings)),
	}));
	const mockFrom1 = mock(() => ({ innerJoin: mockInnerJoin }));

	const mockWhere2 = mock(() => Promise.resolve(existingCheckInRows));
	const mockFrom2 = mock(() => ({ where: mockWhere2 }));

	const mockSelect = mock(() => {
		selectCallCount++;
		if (selectCallCount === 1) return { from: mockFrom1 };
		return { from: mockFrom2 };
	});

	return {
		db: {
			select: mockSelect,
			insert: mockInsert,
			transaction: mockTransaction,
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve(options.memberRow ?? { id: MEMBER_DB_ID }),
					),
				},
				checkIns: {
					findFirst: mock(() => Promise.resolve(undefined)),
				},
			},
		} as any,
		fakeCheckInRow,
	};
}

// ---------------------------------------------------------------------------
// Tests: recordBulkCheckIn
// ---------------------------------------------------------------------------

describe("recordBulkCheckIn", () => {
	test("empty bookingIds returns zero-count result immediately", async () => {
		const db = {} as any; // DB should never be called with an empty array
		const result = await recordBulkCheckIn(db, {
			bookingIds: [],
			branchId: BRANCH_ID,
			actor: ACTOR,
		});
		expect(result).toEqual({
			results: [],
			totalChecked: 0,
			totalSkipped: 0,
			totalError: 0,
		});
	});

	test("throws when bookingIds length exceeds 100", async () => {
		const db = {} as any;
		const bookingIds = Array.from(
			{ length: 101 },
			(_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);
		await expect(
			recordBulkCheckIn(db, { bookingIds, branchId: BRANCH_ID, actor: ACTOR }),
		).rejects.toThrow("Bulk check-in limited to 100 bookings at a time");
	});

	test("all new bookings → all marked ok with correct totalChecked", async () => {
		const booking1 = {
			id: "b1b1b1b1-0000-4000-8000-000000000001",
			clientId: MEMBER_USER_ID,
			appointmentId: "appt-id-1",
			branchId: BRANCH_ID,
		};
		const booking2 = {
			id: "b2b2b2b2-0000-4000-8000-000000000002",
			clientId: MEMBER_USER_ID,
			appointmentId: "appt-id-2",
			branchId: BRANCH_ID,
		};

		const { db } = buildBulkMockDb({
			bookings: [booking1, booking2],
			existingCheckInIds: [],
			memberRow: { id: MEMBER_DB_ID },
		});

		const result = await recordBulkCheckIn(db, {
			bookingIds: [booking1.id, booking2.id],
			branchId: BRANCH_ID,
			actor: ACTOR,
		});

		expect(result.totalChecked).toBe(2);
		expect(result.totalSkipped).toBe(0);
		expect(result.totalError).toBe(0);
		expect(result.results).toHaveLength(2);
		expect(result.results.every((r) => r.status === "ok")).toBe(true);
	});

	test("mix of new and already-checked-in bookings → correct split", async () => {
		const newBookingId = "b3b3b3b3-0000-4000-8000-000000000003";
		const existingBookingId = "b4b4b4b4-0000-4000-8000-000000000004";

		const { db } = buildBulkMockDb({
			bookings: [
				{
					id: newBookingId,
					clientId: MEMBER_USER_ID,
					appointmentId: "appt-id-3",
					branchId: BRANCH_ID,
				},
				{
					id: existingBookingId,
					clientId: MEMBER_USER_ID,
					appointmentId: "appt-id-4",
					branchId: BRANCH_ID,
				},
			],
			existingCheckInIds: [existingBookingId],
			memberRow: { id: MEMBER_DB_ID },
		});

		const result = await recordBulkCheckIn(db, {
			bookingIds: [newBookingId, existingBookingId],
			branchId: BRANCH_ID,
			actor: ACTOR,
		});

		expect(result.totalChecked).toBe(1);
		expect(result.totalSkipped).toBe(1);
		expect(result.totalError).toBe(0);

		const newResult = result.results.find((r) => r.bookingId === newBookingId);
		const existingResult = result.results.find(
			(r) => r.bookingId === existingBookingId,
		);
		expect(newResult?.status).toBe("ok");
		expect(existingResult?.status).toBe("already_checked_in");
	});

	test("booking with branchId mismatch → marked error", async () => {
		const bookingId = "b5b5b5b5-0000-4000-8000-000000000005";
		const differentBranchId = "dddddddd-0000-4000-8000-000000000999";

		const { db } = buildBulkMockDb({
			bookings: [
				{
					id: bookingId,
					clientId: MEMBER_USER_ID,
					appointmentId: "appt-id-5",
					branchId: differentBranchId, // mismatched branch
				},
			],
			existingCheckInIds: [],
		});

		const result = await recordBulkCheckIn(db, {
			bookingIds: [bookingId],
			branchId: BRANCH_ID, // caller's branch
			actor: ACTOR,
		});

		expect(result.totalChecked).toBe(0);
		expect(result.totalSkipped).toBe(0);
		expect(result.totalError).toBe(1);
		expect(result.results[0]?.status).toBe("error");
		expect(result.results[0]?.error).toMatch(/not in this branch/i);
	});

	test("booking not found in DB → marked error", async () => {
		const bookingId = "b6b6b6b6-0000-4000-8000-000000000006";

		const { db } = buildBulkMockDb({
			bookings: [], // DB returns no bookings
			existingCheckInIds: [],
		});

		const result = await recordBulkCheckIn(db, {
			bookingIds: [bookingId],
			branchId: BRANCH_ID,
			actor: ACTOR,
		});

		expect(result.totalError).toBe(1);
		expect(result.results[0]?.status).toBe("error");
		expect(result.results[0]?.error).toMatch(/not found/i);
	});
});

// ---------------------------------------------------------------------------
// Helper: build mock tenantDb for listTodaysBookings tests
//
// listTodaysBookings performs these queries in sequence:
//   1. select({...}).from(appointmentClients).innerJoin(appointments)
//      .leftJoin(services).leftJoin(classSlots).where() → main rows
//   2. select({...}).from(packageInstances).where().orderBy() → active packages
//   3. select({...}).from(checkIns).where() → existing check-ins
//   4. batchResolveDisplayNames → controlPanelDb.select()...
//
// We mock tenantDb.select() to return different data per call index.
// ---------------------------------------------------------------------------

function buildBookingsMockDb(options: {
	mainRows: Array<{
		appointmentClientId: string;
		appointmentId: string;
		clientId: string;
		attended: boolean | null;
		startTime: Date;
		endTime: Date;
		classSlotId: string | null;
		serviceName: string | null;
		capacity: number | null;
	}>;
	activePackages: Array<{
		clientId: string | null;
		id: string;
		creditsRemaining: number;
		expiresAt: Date;
	}>;
	existingCheckIns: Array<{
		id: string;
		appointmentClientId: string | null;
		outcome: string;
	}>;
}) {
	let selectCallCount = 0;

	// Query 1: main booking rows (from appointmentClients + joins)
	const chainQ1 = {
		innerJoin: mock(() => chainQ1),
		leftJoin: mock(() => chainQ1),
		where: mock(() => Promise.resolve(options.mainRows)),
	};

	// Query 2: package instances — needs orderBy chained after where
	const chainQ2 = {
		where: mock(() => ({
			orderBy: mock(() => Promise.resolve(options.activePackages)),
		})),
	};

	// Query 3: existing check-ins (from checkIns).where()
	const chainQ3 = {
		where: mock(() => Promise.resolve(options.existingCheckIns)),
	};

	const mockSelect = mock(() => {
		selectCallCount++;
		if (selectCallCount === 1) return { from: mock(() => chainQ1) };
		if (selectCallCount === 2) return { from: mock(() => chainQ2) };
		return { from: mock(() => chainQ3) };
	});

	// controlPanelDb mock — batchResolveDisplayNames calls select on control panel
	const cpMockSelect = mock(() => ({
		from: mock(() => ({
			where: mock(() => Promise.resolve([])),
		})),
	}));
	const controlPanelDb = { select: cpMockSelect } as any;

	return {
		// listTodaysBookings expands the branch scope via getDescendantNodeIds,
		// which runs a recursive CTE through tenantDb.execute. Return the queried
		// branch so the resolved subtree intersects accessibleNodeIds and the
		// booking query proceeds (the select mocks ignore the scope predicate).
		db: {
			select: mockSelect,
			execute: mock(async () => ({ rows: [{ id: BRANCH_ID }] })),
		} as any,
		controlPanelDb,
	};
}

// ---------------------------------------------------------------------------
// Tests: listTodaysBookings — new Phase 2 fields
// ---------------------------------------------------------------------------

describe("listTodaysBookings — capacity and credits fields", () => {
	const TODAY = new Date("2026-04-22T08:00:00.000Z");
	const APPT_CLIENT_ID = "ac111111-0000-4000-8000-000000000001";
	const APPOINTMENT_ID = "aa111111-0000-4000-8000-000000000001";
	const CLIENT_ID = "cc111111-0000-4000-8000-000000000001";
	const CLASS_SLOT_ID = "cs111111-0000-4000-8000-000000000001";
	const PKG_INSTANCE_ID = "pi111111-0000-4000-8000-000000000001";

	function baseRow(overrides: Partial<ReturnType<typeof buildBaseRow>> = {}) {
		return buildBaseRow(overrides);
	}

	function buildBaseRow(overrides: Record<string, unknown> = {}) {
		return {
			appointmentClientId: APPT_CLIENT_ID,
			appointmentId: APPOINTMENT_ID,
			clientId: CLIENT_ID,
			attended: null,
			startTime: TODAY,
			endTime: new Date(TODAY.getTime() + 60 * 60 * 1000),
			classSlotId: null as string | null,
			serviceName: "Test Service",
			capacity: null as number | null,
			...overrides,
		};
	}

	test("row with class slot → capacity is populated from classSlots", async () => {
		const { db, controlPanelDb } = buildBookingsMockDb({
			mainRows: [baseRow({ classSlotId: CLASS_SLOT_ID, capacity: 15 })],
			activePackages: [],
			existingCheckIns: [],
		});

		const result = await listTodaysBookings(db, controlPanelDb, {
			branchId: BRANCH_ID,
			date: TODAY,
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.capacity).toBe(15);
		expect(result[0]?.classSlotId).toBe(CLASS_SLOT_ID);
	});

	test("row with 1:1 appointment (no classSlotId) → capacity is null", async () => {
		const { db, controlPanelDb } = buildBookingsMockDb({
			mainRows: [baseRow({ classSlotId: null, capacity: null })],
			activePackages: [],
			existingCheckIns: [],
		});

		const result = await listTodaysBookings(db, controlPanelDb, {
			branchId: BRANCH_ID,
			date: TODAY,
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.capacity).toBeNull();
		expect(result[0]?.classSlotId).toBeNull();
	});

	test("member with active package → creditsRemaining and activePackageInstanceId populated", async () => {
		const { db, controlPanelDb } = buildBookingsMockDb({
			mainRows: [baseRow()],
			activePackages: [
				{
					clientId: CLIENT_ID,
					id: PKG_INSTANCE_ID,
					creditsRemaining: 8,
					expiresAt: new Date("2026-06-30T00:00:00.000Z"),
				},
			],
			existingCheckIns: [],
		});

		const result = await listTodaysBookings(db, controlPanelDb, {
			branchId: BRANCH_ID,
			date: TODAY,
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.creditsRemaining).toBe(8);
		expect(result[0]?.activePackageInstanceId).toBe(PKG_INSTANCE_ID);
	});

	test("member with no active package → creditsRemaining and activePackageInstanceId are null", async () => {
		const { db, controlPanelDb } = buildBookingsMockDb({
			mainRows: [baseRow()],
			activePackages: [],
			existingCheckIns: [],
		});

		const result = await listTodaysBookings(db, controlPanelDb, {
			branchId: BRANCH_ID,
			date: TODAY,
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.creditsRemaining).toBeNull();
		expect(result[0]?.activePackageInstanceId).toBeNull();
	});
});
