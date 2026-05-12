import { and, eq, gte, lte, inArray, not } from "drizzle-orm";
import { trainerAvailability } from "@avantej-core/db/schema/tenant/trainer-availability";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilitySlot = {
	dayOfWeek: string;
	startTime: string;
	endTime: string;
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
	// 1. Get active trainers (optionally scoped to a branch)
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
		})
		.from(members)
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
			slots: slotsByTrainer.get(m.id) ?? [],
		};
	});
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
	// 1. Get recurring availability
	const recurringSlots = await listTrainerAvailability(tenantDb, trainerId);

	// Group by day-of-week for fast lookup
	const slotsByDay = new Map<string, TimeWindow[]>();
	for (const slot of recurringSlots) {
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

	// 3. Iterate each day in range
	const result: ComputedDayAvailability[] = [];
	const current = new Date(startDate);
	current.setHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setHours(23, 59, 59, 999);

	while (current <= end) {
		const dayName = JS_DAY_TO_NAME[current.getDay()] ?? "monday";
		const dayWindows = slotsByDay.get(dayName);

		if (dayWindows && dayWindows.length > 0) {
			const dateStr = toDateString(current);
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
