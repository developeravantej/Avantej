import { and, eq, gte, lte, lt, gt, inArray, isNull, not } from "drizzle-orm";
import { trainerAvailability } from "@avantej-core/db/schema/tenant/trainer-availability";
import { coachIntakeAvailability } from "@avantej-core/db/schema/tenant/coach-intake-availability";
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
	// Soft-deleted members must not surface availability. JOIN ensures the trainer
	// member row is alive (deletedAt IS NULL).
	const rows = await tenantDb
		.select({
			id: trainerAvailability.id,
			trainerId: trainerAvailability.trainerId,
			dayOfWeek: trainerAvailability.dayOfWeek,
			startTime: trainerAvailability.startTime,
			endTime: trainerAvailability.endTime,
			isActive: trainerAvailability.isActive,
			createdAt: trainerAvailability.createdAt,
			updatedAt: trainerAvailability.updatedAt,
		})
		.from(trainerAvailability)
		.innerJoin(members, eq(members.id, trainerAvailability.trainerId))
		.where(
			and(
				eq(trainerAvailability.trainerId, trainerId),
				isNull(members.deletedAt),
			),
		);
	return rows.sort((a, b) => {
		const dayDiff =
			(DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
		if (dayDiff !== 0) return dayDiff;
		return a.startTime.localeCompare(b.startTime);
	});
}

/**
 * List a trainer's intake-specific recurring availability windows (from
 * `coach_intake_availability`). Mirrors {@link listTrainerAvailability} —
 * active rows only, soft-deleted members hidden. The web admin "Trainer
 * Availability" page writes here today, so the booking flow must union read
 * to avoid silent invisibility of legitimate windows.
 */
export async function listCoachIntakeAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
): Promise<(typeof coachIntakeAvailability.$inferSelect)[]> {
	const rows = await tenantDb
		.select({
			id: coachIntakeAvailability.id,
			trainerId: coachIntakeAvailability.trainerId,
			dayOfWeek: coachIntakeAvailability.dayOfWeek,
			startTime: coachIntakeAvailability.startTime,
			endTime: coachIntakeAvailability.endTime,
			isActive: coachIntakeAvailability.isActive,
			createdAt: coachIntakeAvailability.createdAt,
			updatedAt: coachIntakeAvailability.updatedAt,
		})
		.from(coachIntakeAvailability)
		.innerJoin(members, eq(members.id, coachIntakeAvailability.trainerId))
		.where(
			and(
				eq(coachIntakeAvailability.trainerId, trainerId),
				eq(coachIntakeAvailability.isActive, true),
				isNull(members.deletedAt),
			),
		);
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
 * Format a Date to "YYYY-MM-DD" in the given IANA timezone.
 * Workers-compatible (uses Intl.DateTimeFormat, not Date.getFullYear()).
 */
function toDateStringInTz(date: Date, tz: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const y = parts.find((p) => p.type === "year")?.value ?? "0000";
	const m = parts.find((p) => p.type === "month")?.value ?? "01";
	const d = parts.find((p) => p.type === "day")?.value ?? "01";
	return `${y}-${m}-${d}`;
}

/**
 * Extract "HH:MM" from a Date in the given IANA timezone. Workers' Date.getHours()
 * returns UTC — this preserves the admin's wall-clock semantics.
 */
function toHHMMInTz(date: Date, tz: string): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const h = parts.find((p) => p.type === "hour")?.value ?? "00";
	const m = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${h === "24" ? "00" : h}:${m}`;
}

/**
 * Day-of-week name ("monday"..."sunday") for a Date in the given IANA timezone.
 */
function dayNameInTz(date: Date, tz: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		weekday: "long",
	})
		.format(date)
		.toLowerCase();
}

/**
 * Compute actual available time windows for a trainer over a date range.
 *
 * Reads the **union** of `trainer_availability` ∪ `coach_intake_availability`
 * (deduped by `(dayOfWeek, startTime, endTime)`). All HH:MM math is performed
 * in `orgTimezone` (sourced from `organizations.timezone` in the control-panel
 * DB), because the recurring rows store the admin's local wall-clock — using
 * UTC `Date.getHours()` on Cloudflare Workers would silently misalign windows
 * against bookings and let double-bookings slip through.
 *
 * Algorithm:
 * 1. Fetch recurring weekly windows from BOTH tables in parallel, then dedupe
 * 2. Fetch all non-cancelled appointments for the trainer in [startDate, endDate]
 * 3. For each calendar day (interpreted in `orgTimezone`), overlay recurring
 *    windows and subtract booked appointments (also interpreted in `orgTimezone`)
 * 4. Return date-by-date free windows
 */
export async function computeAvailableSlots(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	startDate: Date,
	endDate: Date,
	orgTimezone: string,
): Promise<ComputedDayAvailability[]> {
	// 1. Get recurring availability from BOTH sources in parallel, then merge + dedupe.
	const [primary, intake] = await Promise.all([
		listTrainerAvailability(tenantDb, trainerId),
		listCoachIntakeAvailability(tenantDb, trainerId),
	]);

	const seen = new Set<string>();
	const slotsByDay = new Map<string, TimeWindow[]>();
	for (const slot of [...primary, ...intake]) {
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

	// Index appointments by date string for fast lookup (in org tz, not UTC)
	const apptsByDate = new Map<string, TimeWindow[]>();
	for (const appt of bookedAppts) {
		const dateStr = toDateStringInTz(appt.startTime, orgTimezone);
		const list = apptsByDate.get(dateStr) ?? [];
		list.push({
			startTime: toHHMMInTz(appt.startTime, orgTimezone),
			endTime: toHHMMInTz(appt.endTime, orgTimezone),
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
		const dayName = dayNameInTz(current, orgTimezone);
		const dayWindows = slotsByDay.get(dayName);

		if (dayWindows && dayWindows.length > 0) {
			const dateStr = toDateStringInTz(current, orgTimezone);
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

// ─── Slot Lock & Re-check (concurrency guard) ──────────────────────

/**
 * Asserts that the given trainer is free for [startTime, endTime). Must be
 * called inside a transaction with row locking. Throws Error('SLOT_TAKEN')
 * on overlap or Error('OUT_OF_WINDOW') if the slot is no longer within any
 * free availability window.
 */
export async function assertTrainerSlotAvailable(
	tx: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	startTime: Date,
	endTime: Date,
	orgTimezone: string,
): Promise<void> {
	// 1. Lock + read conflicting non-cancelled appointments. The FOR UPDATE
	//    lock serializes concurrent bookers — the second TX blocks until the
	//    first commits, then sees the row this query inserted and bails out.
	const conflicts = await tx
		.select({
			id: appointments.id,
			startTime: appointments.startTime,
			endTime: appointments.endTime,
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.trainerId, trainerId),
				not(eq(appointments.status, "cancelled")),
				lt(appointments.startTime, endTime),
				gt(appointments.endTime, startTime),
			),
		)
		.for("update");

	if (conflicts.length > 0) {
		throw new Error("SLOT_TAKEN");
	}

	// 2. Re-derive the day-of-week and HH:MM bounds in orgTimezone so we
	//    interpret the slot against the admin's wall-clock — matching the
	//    semantics used by computeAvailableSlots and the booking UI.
	const requestedStartHHMM = toHHMMInTz(startTime, orgTimezone);
	const requestedEndHHMM = toHHMMInTz(endTime, orgTimezone);
	const requestedDate = toDateStringInTz(startTime, orgTimezone);

	// computeAvailableSlots already subtracts non-cancelled bookings. We
	// hand it a single-day window (startTime, startTime) — it expands to
	// the full org-local day and returns free windows for that day.
	const dayAvailability = await computeAvailableSlots(
		tx,
		trainerId,
		startTime,
		startTime,
		orgTimezone,
	);
	const today = dayAvailability.find((d) => d.date === requestedDate);
	if (!today) {
		throw new Error("OUT_OF_WINDOW");
	}
	const covered = today.windows.some(
		(w) =>
			w.startTime <= requestedStartHHMM && w.endTime >= requestedEndHHMM,
	);
	if (!covered) {
		throw new Error("OUT_OF_WINDOW");
	}
}
