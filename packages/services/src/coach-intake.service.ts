import { eq, and, gte, lte, lt, inArray, ne } from "drizzle-orm";
import { coachIntakeAvailability } from "@avantej-core/db/schema/tenant/coach-intake-availability";
import { coachIntakeExceptions } from "@avantej-core/db/schema/tenant/coach-intake-exceptions";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// ─── Types ──────────────────────────────────────────────────────────

export type IntakeSlot = {
	dayOfWeek: string; // "monday" through "sunday"
	startTime: string; // HH:MM
	endTime: string; // HH:MM
};

export type OpenIntakeDay = {
	date: string; // YYYY-MM-DD
	dayOfWeek: string;
	windows: Array<{ startTime: string; endTime: string }>;
};

// ─── Constants ──────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
	monday: 0,
	tuesday: 1,
	wednesday: 2,
	thursday: 3,
	friday: 4,
	saturday: 5,
	sunday: 6,
};

const JS_DAY_TO_NAME: Record<number, string> = {
	0: "sunday",
	1: "monday",
	2: "tuesday",
	3: "wednesday",
	4: "thursday",
	5: "friday",
	6: "saturday",
};

// ─── Helpers ────────────────────────────────────────────────────────

function toDateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// ─── 1. List recurring slots ─────────────────────────────────────────

export async function listCoachIntakeSlots(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
): Promise<(typeof coachIntakeAvailability.$inferSelect)[]> {
	const rows = await tenantDb.query.coachIntakeAvailability.findMany({
		where: and(
			eq(coachIntakeAvailability.trainerId, trainerId),
			eq(coachIntakeAvailability.isActive, true),
		),
	});
	return rows.sort((a, b) => {
		const dayDiff = (DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
		if (dayDiff !== 0) return dayDiff;
		return a.startTime.localeCompare(b.startTime);
	});
}

// ─── 2. Upsert (replace-all) ────────────────────────────────────────

export async function upsertCoachIntakeSlots(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	slots: IntakeSlot[],
): Promise<(typeof coachIntakeAvailability.$inferSelect)[]> {
	// Validate: endTime > startTime
	for (const slot of slots) {
		if (slot.endTime <= slot.startTime) {
			throw new Error(
				`Invalid time range: ${slot.startTime} – ${slot.endTime} on ${slot.dayOfWeek}`,
			);
		}
	}

	// Validate: no overlapping windows per day
	const byDay = new Map<string, IntakeSlot[]>();
	for (const slot of slots) {
		const daySlots = byDay.get(slot.dayOfWeek) ?? [];
		daySlots.push(slot);
		byDay.set(slot.dayOfWeek, daySlots);
	}
	for (const [day, daySlots] of byDay) {
		const sorted = daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
		for (let i = 1; i < sorted.length; i++) {
			const current = sorted[i]!;
			const previous = sorted[i - 1]!;
			if (current.startTime < previous.endTime) {
				throw new Error(
					`Overlapping windows on ${day}: ${previous.startTime}–${previous.endTime} and ${current.startTime}–${current.endTime}`,
				);
			}
		}
	}

	// Transaction: delete all → insert new
	return tenantDb.transaction(async (tx) => {
		await tx
			.delete(coachIntakeAvailability)
			.where(eq(coachIntakeAvailability.trainerId, trainerId));

		if (slots.length === 0) return [];

		const rows = await tx
			.insert(coachIntakeAvailability)
			.values(
				slots.map((s) => ({
					trainerId,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
				})),
			)
			.returning();

		return rows;
	});
}

// ─── 3. Compute open slots (recurring minus exceptions) ──────────────

export async function computeOpenIntakeSlots(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	startDate: string, // YYYY-MM-DD
	endDate: string, // YYYY-MM-DD
): Promise<OpenIntakeDay[]> {
	// 1. Fetch active recurring slots
	const recurringSlots = await listCoachIntakeSlots(tenantDb, trainerId);

	// Group by day-of-week for fast lookup
	const slotsByDay = new Map<string, Array<{ startTime: string; endTime: string }>>();
	for (const slot of recurringSlots) {
		const list = slotsByDay.get(slot.dayOfWeek) ?? [];
		list.push({ startTime: slot.startTime, endTime: slot.endTime });
		slotsByDay.set(slot.dayOfWeek, list);
	}

	if (slotsByDay.size === 0) return [];

	// 2. Fetch exceptions in date range
	const startTs = new Date(`${startDate}T00:00:00Z`);
	const endTs = new Date(`${endDate}T23:59:59Z`);

	const exceptions = await tenantDb
		.select()
		.from(coachIntakeExceptions)
		.where(
			and(
				eq(coachIntakeExceptions.trainerId, trainerId),
				gte(coachIntakeExceptions.date, startTs),
				lte(coachIntakeExceptions.date, endTs),
			),
		);

	// Build claimed-key Set: "YYYY-MM-DD|HH:MM|HH:MM"
	const claimedKeys = new Set<string>();
	for (const exc of exceptions) {
		const dateStr = toDateString(exc.date);
		claimedKeys.add(`${dateStr}|${exc.startTime}|${exc.endTime}`);
	}

	// F-CRM-08: also subtract the trainer's REAL appointments so a slot that
	// overlaps an existing booking is not shown as open. coach_intake_availability
	// and appointments both key trainerId on members.id, so we match directly.
	// One range query (not per-slot): fetch the trainer's non-cancelled
	// appointments whose start falls within the requested window, then test each
	// candidate intake slot for time overlap on its calendar day.
	const apptRangeStart = new Date(`${startDate}T00:00:00`);
	// Exclusive upper bound = day AFTER endDate at 00:00 local, so the whole of
	// endDate is covered regardless of appointment time.
	const apptRangeEnd = new Date(`${endDate}T00:00:00`);
	apptRangeEnd.setDate(apptRangeEnd.getDate() + 1);

	const trainerAppointments = await tenantDb
		.select({
			startTime: appointments.startTime,
			endTime: appointments.endTime,
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.trainerId, trainerId),
				gte(appointments.startTime, apptRangeStart),
				lt(appointments.startTime, apptRangeEnd),
				// Cancelled appointments free the slot back up.
				ne(appointments.status, "cancelled"),
			),
		);

	// Build a slot Date from a calendar date + HH:MM in local time, matching the
	// local-time day iteration used below and the appointment timestamps (which
	// are stored without a timezone).
	const slotDate = (dateStr: string, hhmm: string): Date =>
		new Date(`${dateStr}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}`);

	const overlapsAppointment = (
		dateStr: string,
		startHHMM: string,
		endHHMM: string,
	): boolean => {
		const winStart = slotDate(dateStr, startHHMM).getTime();
		const winEnd = slotDate(dateStr, endHHMM).getTime();
		for (const appt of trainerAppointments) {
			const aStart = appt.startTime.getTime();
			const aEnd = appt.endTime.getTime();
			// Half-open overlap: [winStart, winEnd) intersects [aStart, aEnd)
			if (winStart < aEnd && aStart < winEnd) return true;
		}
		return false;
	};

	// 3. Iterate each calendar day
	const result: OpenIntakeDay[] = [];
	const current = new Date(`${startDate}T12:00:00`);
	const end = new Date(`${endDate}T12:00:00`);

	while (current <= end) {
		const dayName = JS_DAY_TO_NAME[current.getDay()] ?? "monday";
		const dayWindows = slotsByDay.get(dayName);

		if (dayWindows && dayWindows.length > 0) {
			const dateStr = toDateString(current);
			const openWindows = dayWindows.filter(
				(w) =>
					!claimedKeys.has(`${dateStr}|${w.startTime}|${w.endTime}`) &&
					!overlapsAppointment(dateStr, w.startTime, w.endTime),
			);

			if (openWindows.length > 0) {
				result.push({
					date: dateStr,
					dayOfWeek: dayName,
					windows: openWindows,
				});
			}
		}

		current.setDate(current.getDate() + 1);
	}

	return result;
}

// ─── 4. Claim a slot (insert exception) ─────────────────────────────

export async function claimIntakeSlot(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	date: string, // YYYY-MM-DD
	startTime: string,
	endTime: string,
	reason?: string,
): Promise<typeof coachIntakeExceptions.$inferSelect> {
	// Derive day of week from date
	const dayOfWeek = JS_DAY_TO_NAME[new Date(`${date}T12:00:00`).getDay()] ?? "monday";

	// Validate a recurring slot exists for this day+time
	const existing = await tenantDb.query.coachIntakeAvailability.findFirst({
		where: and(
			eq(coachIntakeAvailability.trainerId, trainerId),
			eq(coachIntakeAvailability.dayOfWeek, dayOfWeek),
			eq(coachIntakeAvailability.startTime, startTime),
			eq(coachIntakeAvailability.endTime, endTime),
			eq(coachIntakeAvailability.isActive, true),
		),
	});

	if (!existing) {
		throw new Error(
			`No active recurring slot found for trainer on ${dayOfWeek} at ${startTime}–${endTime}`,
		);
	}

	// Insert exception (UNIQUE constraint handles duplicates)
	try {
		const [row] = await tenantDb
			.insert(coachIntakeExceptions)
			.values({
				trainerId,
				date: new Date(`${date}T00:00:00Z`),
				startTime,
				endTime,
				reason: reason ?? null,
			})
			.returning();

		if (!row) throw new Error("Insert returned no row");
		return row;
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique")) {
			throw new Error("Slot already claimed");
		}
		throw error;
	}
}

// ─── 5. Unclaim a slot (delete exception) ───────────────────────────

export async function unclaimIntakeSlot(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	exceptionId: string,
): Promise<void> {
	await tenantDb
		.delete(coachIntakeExceptions)
		.where(eq(coachIntakeExceptions.id, exceptionId));
}

// ─── 6. List exceptions in date range ───────────────────────────────

export async function listIntakeExceptions(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	startDate: string, // YYYY-MM-DD
	endDate: string, // YYYY-MM-DD
): Promise<(typeof coachIntakeExceptions.$inferSelect)[]> {
	const startTs = new Date(`${startDate}T00:00:00Z`);
	const endTs = new Date(`${endDate}T23:59:59Z`);

	return tenantDb
		.select()
		.from(coachIntakeExceptions)
		.where(
			and(
				eq(coachIntakeExceptions.trainerId, trainerId),
				gte(coachIntakeExceptions.date, startTs),
				lte(coachIntakeExceptions.date, endTs),
			),
		);
}

// ─── 7. List by branch ──────────────────────────────────────────────

export type CoachIntakeByBranchRow = {
	trainerId: string;
	trainerName: string;
	trainerEmail: string;
	slots: (typeof coachIntakeAvailability.$inferSelect)[];
	hasOpenSlots: boolean;
};

export async function listCoachIntakeByBranch(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { branchId?: string },
): Promise<CoachIntakeByBranchRow[]> {
	// 1. Get active trainers (optionally scoped to branchId)
	const trainerConditions = [
		eq(members.role, "trainer"),
		eq(members.status, "active"),
	];
	if (params.branchId) {
		trainerConditions.push(eq(members.hierarchyScopeId, params.branchId));
	}

	const trainerMembers = await tenantDb
		.select({ id: members.id, userId: members.userId })
		.from(members)
		.where(and(...trainerConditions));

	if (trainerMembers.length === 0) return [];

	const trainerIds = trainerMembers.map((m) => m.id);
	const trainerUserIds = [...new Set(trainerMembers.map((m) => m.userId))];

	// 2. Fetch intake slots for all trainers in one query
	const intakeRows = await tenantDb
		.select()
		.from(coachIntakeAvailability)
		.where(
			and(
				inArray(coachIntakeAvailability.trainerId, trainerIds),
				eq(coachIntakeAvailability.isActive, true),
			),
		);

	// Group slots by trainerId, sorted by day-of-week and start time
	const slotsByTrainer = new Map<
		string,
		(typeof coachIntakeAvailability.$inferSelect)[]
	>();
	for (const row of intakeRows) {
		const list = slotsByTrainer.get(row.trainerId) ?? [];
		list.push(row);
		slotsByTrainer.set(row.trainerId, list);
	}
	for (const [, list] of slotsByTrainer) {
		list.sort((a, b) => {
			const dayDiff = (DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
			if (dayDiff !== 0) return dayDiff;
			return a.startTime.localeCompare(b.startTime);
		});
	}

	// 3. Batch-resolve names + emails from control panel
	const userRows = await controlPanelDb
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, trainerUserIds));
	const userMap = new Map(
		userRows.map((u) => [u.id, { name: u.name, email: u.email }]),
	);

	// 4. Build response
	return trainerMembers.map((m) => {
		const u = userMap.get(m.userId);
		const slots = slotsByTrainer.get(m.id) ?? [];
		return {
			trainerId: m.id,
			trainerName: u?.name ?? "Unknown",
			trainerEmail: u?.email ?? "",
			slots,
			hasOpenSlots: slots.length > 0,
		};
	});
}
