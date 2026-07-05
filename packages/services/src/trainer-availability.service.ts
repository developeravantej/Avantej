import { and, eq, gte, lte, inArray, not, isNotNull, or } from "drizzle-orm";
import {
	trainerAvailability,
	trainerAvailabilityExceptions,
} from "@avantej-core/db/schema/tenant/trainer-availability";
import { coachIntakeAvailability } from "@avantej-core/db/schema/tenant/coach-intake-availability";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { externalBusyBlocks } from "@avantej-core/db/schema/tenant/external-busy-blocks";
import { members } from "@avantej-core/db/schema/tenant/members";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// ─── Types ──────────────────────────────────────────────────────────

export type TrainerAvailabilityKind = "available" | "blocked" | "timeoff";

export type AvailabilitySlot = {
	dayOfWeek: string;
	startTime: string;
	endTime: string;
	kind?: TrainerAvailabilityKind;
};

export type ConflictReason =
	| "outside_availability"
	| "overlaps_block"
	| "overlaps_timeoff";

export type ConflictEntry = {
	slotId: string;
	appointmentId: string;
	reason: ConflictReason;
};

export type TimeWindow = { startTime: string; endTime: string };

export type ComputedDayAvailability = {
	date: string; // YYYY-MM-DD
	dayOfWeek: string;
	windows: TimeWindow[];
};

// ─── Constants ─────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
	monday: 0,
	tuesday: 1,
	wednesday: 2,
	thursday: 3,
	friday: 4,
	saturday: 5,
	sunday: 6,
};

// ─── List ───────────────────────────────────────────────────────────

export async function listTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
	const rows = await tenantDb.query.trainerAvailability.findMany({
		where: eq(trainerAvailability.trainerId, trainerId),
	});
	return rows.sort((a, b) => {
		const dayDiff =
			(DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
		if (dayDiff !== 0) return dayDiff;
		return a.startTime.localeCompare(b.startTime);
	});
}

/**
 * List a trainer's active recurring windows from `coach_intake_availability`.
 *
 * This is the admin-managed companion to {@link listTrainerAvailability}: the
 * "Coach Intake Availability" admin page writes here, so the booking flow must
 * union-read both sources or admin-entered schedules never surface to clients.
 * Only `isActive` rows count. Mirrors the trainer-availability sort order.
 */
export async function listCoachIntakeAvailability(
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
		const dayDiff =
			(DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
		if (dayDiff !== 0) return dayDiff;
		return a.startTime.localeCompare(b.startTime);
	});
}

// ─── Upsert (replace-all) ──────────────────────────────────────────

export async function upsertTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	slots: AvailabilitySlot[],
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
	// Validate: endTime > startTime for each slot
	for (const slot of slots) {
		if (slot.endTime <= slot.startTime) {
			throw new Error(
				`Invalid time range: ${slot.startTime} – ${slot.endTime} on ${slot.dayOfWeek}`,
			);
		}
	}

	// Validate: no overlapping shifts on same day
	const byDay = new Map<string, AvailabilitySlot[]>();
	for (const slot of slots) {
		const daySlots = byDay.get(slot.dayOfWeek) ?? [];
		daySlots.push(slot);
		byDay.set(slot.dayOfWeek, daySlots);
	}
	for (const [day, daySlots] of byDay) {
		const sorted = daySlots.sort((a, b) =>
			a.startTime.localeCompare(b.startTime),
		);
		for (let i = 1; i < sorted.length; i++) {
			const current = sorted[i]!;
			const previous = sorted[i - 1]!;
			if (current.startTime < previous.endTime) {
				throw new Error(
					`Overlapping shifts on ${day}: ${previous.startTime}–${previous.endTime} and ${current.startTime}–${current.endTime}`,
				);
			}
		}
	}

	// Transaction: delete all existing → insert new
	return tenantDb.transaction(async (tx) => {
		await tx
			.delete(trainerAvailability)
			.where(eq(trainerAvailability.trainerId, trainerId));

		if (slots.length === 0) return [];

		const rows = await tx
			.insert(trainerAvailability)
			.values(
				slots.map((s) => ({
					trainerId,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
					kind: (s.kind ?? "available") as TrainerAvailabilityKind,
				})),
			)
			.returning();

		return rows;
	});
}

// ─── List by branch (grouped per trainer) ──────────────────────────

export type TrainerAvailabilityByBranchRow = {
	trainerId: string;
	trainerName: string;
	trainerEmail: string;
	specialization: string | null;
	slots: (typeof trainerAvailability.$inferSelect)[];
};

/**
 * List all active trainers (optionally branch-filtered) with their recurring
 * availability slots. Cross-DB resolves trainer names + emails from the
 * control panel `user` table in a single batch query.
 */
export async function listTrainerAvailabilityByBranch(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { branchId?: string },
): Promise<TrainerAvailabilityByBranchRow[]> {
	// 1. Get active trainers (optionally scoped to a branch) with their profile specialization
	const trainerConditions = [
		eq(members.role, "trainer"),
		eq(members.status, "active"),
	];
	if (params.branchId) {
		trainerConditions.push(eq(members.hierarchyScopeId, params.branchId));
	}

	const trainerMembers = await tenantDb
		.select({
			id: members.id,
			userId: members.userId,
			specialization: memberProfiles.specialization,
		})
		.from(members)
		.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
		.where(and(...trainerConditions));

	if (trainerMembers.length === 0) return [];

	const trainerIds = trainerMembers.map((m) => m.id);
	const trainerUserIds = [...new Set(trainerMembers.map((m) => m.userId))];

	// 2. Fetch availability for all trainers in one query
	const availabilityRows = await tenantDb
		.select()
		.from(trainerAvailability)
		.where(inArray(trainerAvailability.trainerId, trainerIds));

	// Group slots by trainerId, sorted by day-of-week and start time
	const slotsByTrainer = new Map<
		string,
		(typeof trainerAvailability.$inferSelect)[]
	>();
	for (const row of availabilityRows) {
		const list = slotsByTrainer.get(row.trainerId) ?? [];
		list.push(row);
		slotsByTrainer.set(row.trainerId, list);
	}
	for (const [, list] of slotsByTrainer) {
		list.sort((a, b) => {
			const dayDiff =
				(DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
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
		return {
			trainerId: m.id,
			trainerName: u?.name ?? "Unknown",
			trainerEmail: u?.email ?? "",
			specialization: m.specialization ?? null,
			slots: slotsByTrainer.get(m.id) ?? [],
		};
	});
}

// ─── Create single slot ────────────────────────────────────────────

export async function createTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		trainerId: string;
		dayOfWeek: string;
		startTime: string;
		endTime: string;
		kind?: TrainerAvailabilityKind;
	},
): Promise<typeof trainerAvailability.$inferSelect> {
	const [row] = await tenantDb
		.insert(trainerAvailability)
		.values({
			trainerId: params.trainerId,
			dayOfWeek: params.dayOfWeek,
			startTime: params.startTime,
			endTime: params.endTime,
			kind: params.kind ?? "available",
		})
		.returning();
	if (!row) throw new Error("Failed to create trainer availability slot");
	return row;
}

// ─── Update single slot ────────────────────────────────────────────

export async function updateTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: {
		dayOfWeek?: string;
		startTime?: string;
		endTime?: string;
		kind?: TrainerAvailabilityKind;
	},
): Promise<typeof trainerAvailability.$inferSelect> {
	const updates: Record<string, unknown> = {
		updatedAt: new Date(),
	};
	if (params.dayOfWeek !== undefined) updates.dayOfWeek = params.dayOfWeek;
	if (params.startTime !== undefined) updates.startTime = params.startTime;
	if (params.endTime !== undefined) updates.endTime = params.endTime;
	if (params.kind !== undefined) updates.kind = params.kind;

	const [row] = await tenantDb
		.update(trainerAvailability)
		.set(updates)
		.where(eq(trainerAvailability.id, id))
		.returning();
	if (!row) throw new Error("Trainer availability slot not found");
	return row;
}

// ─── Delete single slot ────────────────────────────────────────────

export async function deleteTrainerAvailabilitySlot(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<void> {
	await tenantDb
		.delete(trainerAvailability)
		.where(eq(trainerAvailability.id, id));
}

// ─── Utilisation ────────────────────────────────────────────────────

export type TrainerUtilisationEntry = {
	availableHours: number;
	bookedHours: number;
	utilisationPct: number;
};

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function slotMinutes(start: string, end: string): number {
	const toMins = (t: string) => {
		const [h, m] = t.split(":").map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	};
	return Math.max(0, toMins(end) - toMins(start));
}

/**
 * Given a weekStart (YYYY-MM-DD, Monday), compute per-trainer utilisation:
 * - availableHours: sum of recurring slot minutes for Mon–Sun ÷ 60
 * - bookedHours: sum of appointment durations (confirmed/completed) for that week ÷ 60
 * - utilisationPct: Math.round((booked / available) * 100), or 0 if no available time
 */
export async function getTrainerUtilisation(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { branchId?: string; weekStart: string },
): Promise<Record<string, TrainerUtilisationEntry>> {
	// Derive week window [Monday 00:00 → Sunday 23:59:59]
	const weekStartDate = new Date(`${params.weekStart}T00:00:00`);
	// Ensure weekStart is treated as a Monday; add 6 days to get Sunday
	const weekEndDate = new Date(weekStartDate);
	weekEndDate.setDate(weekEndDate.getDate() + 6);
	weekEndDate.setHours(23, 59, 59, 999);

	// 1. Get active trainers
	const trainerConditions = [
		eq(members.role, "trainer"),
		eq(members.status, "active"),
	];
	if (params.branchId) {
		trainerConditions.push(eq(members.hierarchyScopeId, params.branchId));
	}

	const trainerMembers = await tenantDb
		.select({ id: members.id })
		.from(members)
		.where(and(...trainerConditions));

	if (trainerMembers.length === 0) return {};

	const trainerIds = trainerMembers.map((m) => m.id);

	// 2. Fetch all recurring slots for these trainers
	const slots = await tenantDb
		.select({
			trainerId: trainerAvailability.trainerId,
			startTime: trainerAvailability.startTime,
			endTime: trainerAvailability.endTime,
		})
		.from(trainerAvailability)
		.where(inArray(trainerAvailability.trainerId, trainerIds));

	// Sum available minutes per trainer (slots repeat each week, so raw sum is correct for a 7-day window)
	const availMins = new Map<string, number>();
	for (const slot of slots) {
		const mins = slotMinutes(slot.startTime, slot.endTime);
		availMins.set(slot.trainerId, (availMins.get(slot.trainerId) ?? 0) + mins);
	}

	// 3. Fetch confirmed/completed appointments for that week
	const bookedAppts = await tenantDb
		.select({
			trainerId: appointments.trainerId,
			duration: appointments.duration,
		})
		.from(appointments)
		.where(
			and(
				isNotNull(appointments.trainerId),
				inArray(appointments.trainerId, trainerIds),
				gte(appointments.startTime, weekStartDate),
				lte(appointments.startTime, weekEndDate),
				// count confirmed + completed only
				not(eq(appointments.status, "cancelled")),
				not(eq(appointments.status, "pending")),
				not(eq(appointments.status, "no-show")),
			),
		);

	// Sum booked minutes per trainer
	const bookedMins = new Map<string, number>();
	for (const appt of bookedAppts) {
		if (!appt.trainerId) continue;
		bookedMins.set(
			appt.trainerId,
			(bookedMins.get(appt.trainerId) ?? 0) + appt.duration,
		);
	}

	// 4. Assemble result
	const result: Record<string, TrainerUtilisationEntry> = {};
	for (const { id } of trainerMembers) {
		const avail = availMins.get(id) ?? 0;
		const booked = bookedMins.get(id) ?? 0;
		result[id] = {
			availableHours: Math.round((avail / 60) * 10) / 10,
			bookedHours: Math.round((booked / 60) * 10) / 10,
			utilisationPct: avail > 0 ? Math.round((booked / avail) * 100) : 0,
		};
	}
	return result;
}

// ─── Computed Available Slots ─────────────────────────────────────

const JS_DAY_TO_NAME: Record<number, string> = {
	0: "sunday",
	1: "monday",
	2: "tuesday",
	3: "wednesday",
	4: "thursday",
	5: "friday",
	6: "saturday",
};

/**
 * Convert "HH:MM" to minutes since midnight for easy arithmetic.
 */
function hhmmToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Convert minutes since midnight back to "HH:MM".
 */
function minutesToHHMM(mins: number): string {
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Subtract booked time ranges from a set of available windows.
 * All inputs in "HH:MM" format. Returns remaining free windows (may split a window into multiple).
 */
function subtractBookings(
	windows: TimeWindow[],
	bookings: TimeWindow[],
): TimeWindow[] {
	let free: Array<{ start: number; end: number }> = windows.map((w) => ({
		start: hhmmToMinutes(w.startTime),
		end: hhmmToMinutes(w.endTime),
	}));

	for (const booking of bookings) {
		const bStart = hhmmToMinutes(booking.startTime);
		const bEnd = hhmmToMinutes(booking.endTime);
		const next: typeof free = [];

		for (const slot of free) {
			// No overlap — booking is entirely before or after the slot
			if (bEnd <= slot.start || bStart >= slot.end) {
				next.push(slot);
				continue;
			}
			// Left remainder (before booking)
			if (bStart > slot.start) {
				next.push({ start: slot.start, end: bStart });
			}
			// Right remainder (after booking)
			if (bEnd < slot.end) {
				next.push({ start: bEnd, end: slot.end });
			}
			// If booking covers the entire slot, nothing remains
		}

		free = next;
	}

	return free.map((s) => ({
		startTime: minutesToHHMM(s.start),
		endTime: minutesToHHMM(s.end),
	}));
}

/**
 * Format a Date to "YYYY-MM-DD".
 */
function toDateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/**
 * Extract "HH:MM" from a Date/timestamp (in the timezone the Date is constructed).
 */
function toHHMM(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Compute actual available time windows for a trainer over a date range.
 *
 * Algorithm:
 * 1. Fetch trainer's recurring weekly windows
 * 2. Fetch all non-cancelled appointments for the trainer in [startDate, endDate]
 * 3. For each calendar day, overlay recurring windows and subtract booked appointments
 * 4. Return date-by-date free windows
 */
export async function computeAvailableSlots(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	startDate: Date,
	endDate: Date,
): Promise<ComputedDayAvailability[]> {
	// 1. Get recurring availability from BOTH sources in parallel — the
	//    trainer-managed windows and the admin-managed coach-intake windows —
	//    then merge and dedupe by (day, start, end) so admin-entered schedules
	//    surface to the booking flow. (HH:MM math stays in UTC; org-tz-aware
	//    slotting is a tracked future enhancement, see appointment.service.ts.)
	const [primarySlots, intakeSlots] = await Promise.all([
		listTrainerAvailability(tenantDb, trainerId),
		listCoachIntakeAvailability(tenantDb, trainerId),
	]);

	// Group by day-of-week for fast lookup
	const seen = new Set<string>();
	const slotsByDay = new Map<string, TimeWindow[]>();
	for (const slot of [...primarySlots, ...intakeSlots]) {
		const key = `${slot.dayOfWeek}|${slot.startTime}|${slot.endTime}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const list = slotsByDay.get(slot.dayOfWeek) ?? [];
		list.push({ startTime: slot.startTime, endTime: slot.endTime });
		slotsByDay.set(slot.dayOfWeek, list);
	}

	// 2. Fetch all non-cancelled appointments for this trainer in the date range
	const bookedAppts = await tenantDb
		.select({
			startTime: appointments.startTime,
			endTime: appointments.endTime,
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.trainerId, trainerId),
				gte(appointments.startTime, startDate),
				lte(appointments.startTime, endDate),
				not(eq(appointments.status, "cancelled")),
			),
		);

	// Index appointments by date string for fast lookup
	const apptsByDate = new Map<string, TimeWindow[]>();
	for (const appt of bookedAppts) {
		const dateStr = toDateString(appt.startTime);
		const list = apptsByDate.get(dateStr) ?? [];
		list.push({
			startTime: toHHMM(appt.startTime),
			endTime: toHHMM(appt.endTime),
		});
		apptsByDate.set(dateStr, list);
	}

	// 2b. Subtract external (Google Calendar) busy blocks pulled into Avantej so a
	//     meeting created outside Avantej removes the overlapping slot (UAT §6).
	//     Treated exactly like a booking — same per-date subtraction below.
	const busyBlocks = await tenantDb
		.select({
			startTime: externalBusyBlocks.startTime,
			endTime: externalBusyBlocks.endTime,
		})
		.from(externalBusyBlocks)
		.where(
			and(
				eq(externalBusyBlocks.trainerId, trainerId),
				gte(externalBusyBlocks.startTime, startDate),
				lte(externalBusyBlocks.startTime, endDate),
			),
		);
	for (const block of busyBlocks) {
		const dateStr = toDateString(block.startTime);
		const list = apptsByDate.get(dateStr) ?? [];
		list.push({
			startTime: toHHMM(block.startTime),
			endTime: toHHMM(block.endTime),
		});
		apptsByDate.set(dateStr, list);
	}

	// 3. Fetch one-off exceptions and build a set of blocked date strings
	const exceptions = await listTrainerAvailabilityExceptions(
		tenantDb,
		trainerId,
		{
			from: toDateString(startDate),
			to: toDateString(endDate),
		},
	);
	const blockedDates = new Set(exceptions.map((e) => e.date));

	// 4. Iterate each day in range
	const result: ComputedDayAvailability[] = [];
	const current = new Date(startDate);
	current.setHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setHours(23, 59, 59, 999);

	while (current <= end) {
		const dateStr = toDateString(current);

		if (blockedDates.has(dateStr)) {
			current.setDate(current.getDate() + 1);
			continue;
		}

		const dayName = JS_DAY_TO_NAME[current.getDay()] ?? "monday";
		const dayWindows = slotsByDay.get(dayName);

		if (dayWindows && dayWindows.length > 0) {
			const dayBookings = apptsByDate.get(dateStr) ?? [];

			const freeWindows = subtractBookings(dayWindows, dayBookings);

			if (freeWindows.length > 0) {
				result.push({
					date: dateStr,
					dayOfWeek: dayName,
					windows: freeWindows,
				});
			}
		}

		current.setDate(current.getDate() + 1);
	}

	return result;
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/**
 * For a given week (Monday weekStart), find scheduling conflicts per trainer:
 *   - "outside_availability"  — confirmed/completed appointment falls on a day/time
 *     not covered by any `available` slot for that trainer.
 *   - "overlaps_block"        — confirmed/completed appointment overlaps a `blocked` slot.
 *   - "overlaps_timeoff"      — confirmed/completed appointment overlaps a `timeoff` slot.
 *
 * Returns a map keyed by trainerId.
 */
export async function getTrainerConflicts(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { branchId?: string; weekStart: string },
): Promise<Record<string, ConflictEntry[]>> {
	const weekStartDate = new Date(`${params.weekStart}T00:00:00`);
	const weekEndDate = new Date(weekStartDate);
	weekEndDate.setDate(weekEndDate.getDate() + 6);
	weekEndDate.setHours(23, 59, 59, 999);

	// 1. Get active trainers (optionally branch-scoped)
	const trainerConditions = [
		eq(members.role, "trainer"),
		eq(members.status, "active"),
	];
	if (params.branchId) {
		trainerConditions.push(eq(members.hierarchyScopeId, params.branchId));
	}
	const trainerMembers = await tenantDb
		.select({ id: members.id })
		.from(members)
		.where(and(...trainerConditions));

	if (trainerMembers.length === 0) return {};

	const trainerIds = trainerMembers.map((m) => m.id);

	// 2. Fetch all slots for these trainers
	const slots = await tenantDb
		.select()
		.from(trainerAvailability)
		.where(inArray(trainerAvailability.trainerId, trainerIds));

	// Index slots by trainerId
	const slotsByTrainer = new Map<
		string,
		(typeof trainerAvailability.$inferSelect)[]
	>();
	for (const slot of slots) {
		const list = slotsByTrainer.get(slot.trainerId) ?? [];
		list.push(slot);
		slotsByTrainer.set(slot.trainerId, list);
	}

	// 3. Fetch confirmed/completed appointments for the week
	const bookedAppts = await tenantDb
		.select({
			id: appointments.id,
			trainerId: appointments.trainerId,
			startTime: appointments.startTime,
			endTime: appointments.endTime,
		})
		.from(appointments)
		.where(
			and(
				isNotNull(appointments.trainerId),
				inArray(appointments.trainerId, trainerIds),
				gte(appointments.startTime, weekStartDate),
				lte(appointments.startTime, weekEndDate),
				or(
					eq(appointments.status, "confirmed"),
					eq(appointments.status, "completed"),
				),
			),
		);

	// 4. For each appointment check for conflicts
	const result: Record<string, ConflictEntry[]> = {};

	for (const appt of bookedAppts) {
		if (!appt.trainerId) continue;

		const apptDayName = JS_DAY_TO_NAME[appt.startTime.getDay()] ?? "monday";
		const apptStartMins = hhmmToMinutes(toHHMM(appt.startTime));
		const apptEndMins = hhmmToMinutes(toHHMM(appt.endTime));
		const trainerSlots = slotsByTrainer.get(appt.trainerId) ?? [];

		// Filter to slots matching the same day-of-week
		const daySlots = trainerSlots.filter((s) => s.dayOfWeek === apptDayName);

		let foundAvailableWindow = false;
		let overlapsBlock = false;
		let overlapsTimeoff = false;

		for (const slot of daySlots) {
			const slotStartMins = hhmmToMinutes(slot.startTime);
			const slotEndMins = hhmmToMinutes(slot.endTime);
			const overlaps =
				apptStartMins < slotEndMins && apptEndMins > slotStartMins;

			if (!overlaps) continue;

			if (slot.kind === "available") {
				// The appointment is inside an available window — not "outside"
				foundAvailableWindow = true;
			} else if (slot.kind === "blocked") {
				overlapsBlock = true;
			} else if (slot.kind === "timeoff") {
				overlapsTimeoff = true;
			}
		}

		const conflicts = result[appt.trainerId] ?? [];

		if (!foundAvailableWindow) {
			conflicts.push({
				slotId: "",
				appointmentId: appt.id,
				reason: "outside_availability",
			});
		}
		if (overlapsBlock) {
			const blockSlot = daySlots.find((s) => {
				const sS = hhmmToMinutes(s.startTime);
				const sE = hhmmToMinutes(s.endTime);
				return s.kind === "blocked" && apptStartMins < sE && apptEndMins > sS;
			});
			conflicts.push({
				slotId: blockSlot?.id ?? "",
				appointmentId: appt.id,
				reason: "overlaps_block",
			});
		}
		if (overlapsTimeoff) {
			const toSlot = daySlots.find((s) => {
				const sS = hhmmToMinutes(s.startTime);
				const sE = hhmmToMinutes(s.endTime);
				return s.kind === "timeoff" && apptStartMins < sE && apptEndMins > sS;
			});
			conflicts.push({
				slotId: toSlot?.id ?? "",
				appointmentId: appt.id,
				reason: "overlaps_timeoff",
			});
		}

		if (conflicts.length > 0) {
			result[appt.trainerId] = conflicts;
		}
	}

	return result;
}

// ─── Date-specific exceptions (one-off overrides) ──────────────────────────────

export type TrainerAvailabilityExceptionKind = "blocked" | "timeoff";

export type AddTrainerAvailabilityExceptionParams = {
	trainerId: string;
	date: string; // YYYY-MM-DD
	kind: TrainerAvailabilityExceptionKind;
	reason?: string;
	createdBy?: string;
};

/**
 * Add a one-off date-specific exception (time-off or blocked) for a trainer.
 * Throws if an exception for the same (trainerId, date) already exists — the
 * caller should delete and re-create if they want to overwrite.
 */
export async function addTrainerAvailabilityException(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: AddTrainerAvailabilityExceptionParams,
): Promise<typeof trainerAvailabilityExceptions.$inferSelect> {
	const [row] = await tenantDb
		.insert(trainerAvailabilityExceptions)
		.values({
			trainerId: params.trainerId,
			date: params.date,
			kind: params.kind,
			reason: params.reason,
			createdBy: params.createdBy,
		})
		.returning();
	if (!row) throw new Error("Failed to create trainer availability exception");
	return row;
}

/**
 * List exceptions for a trainer, optionally bounded by date range.
 * Dates are inclusive on both ends (YYYY-MM-DD strings).
 */
export async function listTrainerAvailabilityExceptions(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	range?: { from?: string; to?: string },
): Promise<(typeof trainerAvailabilityExceptions.$inferSelect)[]> {
	const conditions = [eq(trainerAvailabilityExceptions.trainerId, trainerId)];
	if (range?.from) {
		conditions.push(gte(trainerAvailabilityExceptions.date, range.from));
	}
	if (range?.to) {
		conditions.push(lte(trainerAvailabilityExceptions.date, range.to));
	}
	const rows = await tenantDb
		.select()
		.from(trainerAvailabilityExceptions)
		.where(and(...conditions));
	return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Delete a single exception by id.
 */
export async function deleteTrainerAvailabilityException(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<void> {
	await tenantDb
		.delete(trainerAvailabilityExceptions)
		.where(eq(trainerAvailabilityExceptions.id, id));
}
