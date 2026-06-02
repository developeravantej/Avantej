/**
 * Integration test: J3 — DB-level appointment overlap exclusion.
 *
 * Verifies the trainer/room EXCLUDE constraints introduced by migrations
 * 0026_pipeline_audit and 0030_add_appointment_exclude_constraints behave
 * as designed:
 *   (a) overlapping rows for same trainer → 23P01 exclusion_violation
 *   (b) cancelling the first → second insert succeeds (predicate excludes
 *       cancelled rows)
 *   (c) different trainers, same room same time, different rooms → both succeed
 *   (d) different trainers, no room → both succeed
 *
 * The shared tenant DB used by these tests is the same one that backs
 * dev — so we hit the *real* constraints. If the constraints aren't yet
 * applied on this DB the test is skipped with a clear message rather than
 * failing (so this works on every dev's machine before they run the
 * migrations locally).
 *
 * Run: bun test src/tests/integration/appointment-overlap.test.ts
 * Skip: SKIP_INTEGRATION_TESTS=true
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { rooms } from "@avantej-core/db/schema/tenant/rooms";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
} from "../helpers/integration-setup";

const SKIP = shouldSkipIntegration();
const describeOrSkip = SKIP ? describe.skip : describe;

const TS = Date.now();
const createdAppointmentIds: string[] = [];
const createdMemberIds: string[] = [];
const createdRoomIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;
let trainerAId: string;
let trainerBId: string;
let roomXId: string;
let roomYId: string;
let constraintsPresent = false;

async function checkConstraintsPresent(db: ReturnType<typeof createTenantDb>) {
	const res = await db.execute(sql`
		SELECT conname FROM pg_constraint
		WHERE conname IN ('appointments_trainer_no_overlap', 'appointments_room_no_overlap')
	`);
	// drizzle execute on neon returns { rows: [...] }
	// biome-ignore lint/suspicious/noExplicitAny: shape varies by adapter
	const rows = (res as any).rows ?? (res as any);
	const names = new Set<string>();
	for (const row of rows as Array<{ conname: string }>) {
		names.add(row.conname);
	}
	return (
		names.has("appointments_trainer_no_overlap") &&
		names.has("appointments_room_no_overlap")
	);
}

async function insertAppointment(opts: {
	startMinutes: number; // minutes from base time
	durationMinutes: number;
	trainerId: string | null;
	roomId?: string | null;
	status?: string;
}) {
	const base = new Date(`2099-01-15T09:00:00.000Z`);
	const start = new Date(base.getTime() + opts.startMinutes * 60_000);
	const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
	const [row] = await tenantDb
		.insert(appointments)
		.values({
			type: "private",
			startTime: start,
			duration: opts.durationMinutes,
			endTime: end,
			branchId: TEST_BRANCH_NODE_ID,
			status: opts.status ?? "confirmed",
			sessionTotal: 0,
			pricePerClient: 0,
			createdBy: TEST_USER_ID,
			trainerId: opts.trainerId,
			roomId: opts.roomId ?? null,
		})
		.returning();
	if (!row) throw new Error("Insert returned no row");
	createdAppointmentIds.push(row.id);
	return row;
}

beforeAll(async () => {
	if (SKIP) return;
	loadDevVars();
	tenantDb = createTenantDb();

	constraintsPresent = await checkConstraintsPresent(tenantDb);
	if (!constraintsPresent) {
		console.warn(
			"[appointment-overlap] EXCLUDE constraints not present — migrations 0026/0030 not yet applied on this DB. Tests will skip.",
		);
		return;
	}

	// Two trainer members
	const [trainerA] = await tenantDb
		.insert(members)
		.values({
			userId: `j3-overlap-trainer-a-${TS}`,
			role: "trainer",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
		})
		.returning();
	if (!trainerA) throw new Error("Failed to create trainer A");
	trainerAId = trainerA.id;
	createdMemberIds.push(trainerAId);

	const [trainerB] = await tenantDb
		.insert(members)
		.values({
			userId: `j3-overlap-trainer-b-${TS}`,
			role: "trainer",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
		})
		.returning();
	if (!trainerB) throw new Error("Failed to create trainer B");
	trainerBId = trainerB.id;
	createdMemberIds.push(trainerBId);

	// Two rooms
	const [roomX] = await tenantDb
		.insert(rooms)
		.values({
			name: `J3 Room X ${TS}`,
			type: "private",
			capacity: 1,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!roomX) throw new Error("Failed to create room X");
	roomXId = roomX.id;
	createdRoomIds.push(roomXId);

	const [roomY] = await tenantDb
		.insert(rooms)
		.values({
			name: `J3 Room Y ${TS}`,
			type: "private",
			capacity: 1,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!roomY) throw new Error("Failed to create room Y");
	roomYId = roomY.id;
	createdRoomIds.push(roomYId);
});

afterAll(async () => {
	if (SKIP || !constraintsPresent) return;

	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}
	if (createdRoomIds.length > 0) {
		await tenantDb.delete(rooms).where(inArray(rooms.id, createdRoomIds));
	}
	if (createdMemberIds.length > 0) {
		await tenantDb.delete(members).where(inArray(members.id, createdMemberIds));
	}
});

describeOrSkip("J3 — appointment overlap EXCLUDE constraints", () => {
	test("(a) overlapping bookings for same trainer fail with 23P01", async () => {
		if (SKIP || !constraintsPresent) return;
		await insertAppointment({
			startMinutes: 0, // 09:00
			durationMinutes: 60, // ends 10:00
			trainerId: trainerAId,
		});
		let caught: unknown = null;
		try {
			await insertAppointment({
				startMinutes: 30, // 09:30
				durationMinutes: 60, // ends 10:30 — overlaps [09:30, 10:00)
				trainerId: trainerAId,
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).not.toBeNull();
		// Walk the cause chain looking for the SQLSTATE / constraint name.
		let pgCode: string | undefined;
		let constraint: string | undefined;
		// biome-ignore lint/suspicious/noExplicitAny: walk error cause
		let cur: any = caught;
		for (let i = 0; i < 8 && cur; i++) {
			if (typeof cur.code === "string") {
				pgCode = cur.code;
				constraint = cur.constraint;
				break;
			}
			cur = cur.cause;
		}
		// Either the driver surfaced 23P01 directly, or the message mentions
		// the constraint name. Both are acceptable signals.
		const msg = caught instanceof Error ? caught.message : String(caught);
		const sawConstraint =
			constraint === "appointments_trainer_no_overlap" ||
			msg.includes("appointments_trainer_no_overlap");
		expect(pgCode === "23P01" || sawConstraint).toBe(true);
	});

	test("(b) cancelled prior booking does not block a new one in the same slot", async () => {
		if (SKIP || !constraintsPresent) return;
		const first = await insertAppointment({
			startMinutes: 120, // 11:00
			durationMinutes: 60,
			trainerId: trainerAId,
		});
		// Cancel it — predicate `status NOT IN ('cancelled', 'no-show')` should
		// remove this row from the constraint scope.
		await tenantDb
			.update(appointments)
			.set({ status: "cancelled" })
			.where(eq(appointments.id, first.id));

		// Now this should succeed.
		const second = await insertAppointment({
			startMinutes: 120,
			durationMinutes: 60,
			trainerId: trainerAId,
		});
		expect(second.id).toBeDefined();
	});

	test("(c) same trainer different rooms (no trainer overlap) — different times — both succeed", async () => {
		if (SKIP || !constraintsPresent) return;
		// Two non-overlapping appointments for same trainer, in different rooms.
		const a = await insertAppointment({
			startMinutes: 240, // 13:00
			durationMinutes: 60,
			trainerId: trainerAId,
			roomId: roomXId,
		});
		const b = await insertAppointment({
			startMinutes: 300, // 14:00 — adjacent, half-open range so no overlap
			durationMinutes: 60,
			trainerId: trainerAId,
			roomId: roomYId,
		});
		expect(a.id).toBeDefined();
		expect(b.id).toBeDefined();
	});

	test("(d) different trainers same time — both succeed", async () => {
		if (SKIP || !constraintsPresent) return;
		const a = await insertAppointment({
			startMinutes: 480, // 17:00
			durationMinutes: 60,
			trainerId: trainerAId,
		});
		const b = await insertAppointment({
			startMinutes: 480,
			durationMinutes: 60,
			trainerId: trainerBId,
		});
		expect(a.id).toBeDefined();
		expect(b.id).toBeDefined();
	});

	test("(e) overlapping bookings for same room fail with 23P01", async () => {
		if (SKIP || !constraintsPresent) return;
		await insertAppointment({
			startMinutes: 600, // 19:00
			durationMinutes: 60,
			trainerId: trainerAId,
			roomId: roomXId,
		});
		let caught: unknown = null;
		try {
			await insertAppointment({
				startMinutes: 630, // 19:30 overlaps
				durationMinutes: 60,
				trainerId: trainerBId, // different trainer — only the room collides
				roomId: roomXId,
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).not.toBeNull();
		// biome-ignore lint/suspicious/noExplicitAny: walk error cause
		let cur: any = caught;
		let pgCode: string | undefined;
		let constraint: string | undefined;
		for (let i = 0; i < 8 && cur; i++) {
			if (typeof cur.code === "string") {
				pgCode = cur.code;
				constraint = cur.constraint;
				break;
			}
			cur = cur.cause;
		}
		const msg = caught instanceof Error ? caught.message : String(caught);
		const sawConstraint =
			constraint === "appointments_room_no_overlap" ||
			msg.includes("appointments_room_no_overlap");
		expect(pgCode === "23P01" || sawConstraint).toBe(true);
	});
});
