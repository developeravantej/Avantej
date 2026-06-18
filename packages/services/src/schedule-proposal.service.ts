/**
 * Schedule Proposal Service
 *
 * Converts an approved package instance's preferred times + the assigned
 * trainer's availability into a list of concrete proposed session slots — one
 * per remaining credit — that an admin/trainer can confirm or adjust before the
 * appointments are actually created.
 *
 * TIMEZONE CONTRACT (important):
 * This service works ENTIRELY in wall-clock terms — it returns each proposed
 * slot as `{ date: "YYYY-MM-DD", time: "HH:MM", duration }`, never an ISO
 * instant. This matches the frame that `preferred_times` and
 * `trainer_availability` already live in (both store naive "HH:MM" / weekday),
 * so classification (ok / conflict / outside_availability) is timezone-safe.
 * The CLIENT assembles the final ISO instant from these parts in the browser's
 * timezone — identical to the existing appointment edit/create flow
 * (`new Date(y, mo-1, d, h, min).toISOString()`), so the stored instant matches
 * what the user saw.
 */

import { eq } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import {
	computeAvailableSlots as computeAvailableSlotsImpl,
	listTrainerAvailability as listTrainerAvailabilityImpl,
} from "./trainer-availability.service";
import { listPreferredTimes as listPreferredTimesImpl } from "./preferred-time.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type ProposedSlotStatus =
	| "ok"
	| "conflict"
	| "outside_availability"
	| "after_expiry";

export type ProposedSlot = {
	index: number;
	/** Wall-clock date "YYYY-MM-DD" (client assembles the instant in browser TZ). */
	date: string;
	/** Wall-clock time "HH:MM". */
	time: string;
	/** Session length in minutes. */
	duration: number;
	/** Which preferred-time priority generated this slot (null = availability fallback). */
	sourcePriority: number | null;
	status: ProposedSlotStatus;
	conflictReason?: string;
};

export type ProposeScheduleResult = {
	packageInstanceId: string;
	creditsRemaining: number;
	/** Session length in minutes (services.duration is seconds → minutes). */
	duration: number;
	/** members.id of the assigned trainer (null if none assigned yet). */
	trainerId: string | null;
	/** Package validity end as ISO (informational; client renders in browser TZ). */
	validUntil: string;
	preferredTimes: { dayOfWeek: string; time: string; priority: number }[];
	proposed: ProposedSlot[];
};

export type ProposeScheduleParams = {
	packageInstanceId: string;
	/** Wall-clock start date "YYYY-MM-DD". Defaults to today (server wall-clock). */
	fromDate?: string;
};

type ScheduleProposalDeps = {
	computeAvailableSlots: typeof computeAvailableSlotsImpl;
	listTrainerAvailability: typeof listTrainerAvailabilityImpl;
	listPreferredTimes: typeof listPreferredTimesImpl;
};

const DEFAULT_DEPS: ScheduleProposalDeps = {
	computeAvailableSlots: computeAvailableSlotsImpl,
	listTrainerAvailability: listTrainerAvailabilityImpl,
	listPreferredTimes: listPreferredTimesImpl,
};

// JS Date.getDay(): 0 = Sunday … 6 = Saturday.
const DAY_NAME_TO_JS_IDX: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};
const JS_IDX_TO_DAY_NAME: Record<number, string> = {
	0: "sunday",
	1: "monday",
	2: "tuesday",
	3: "wednesday",
	4: "thursday",
	5: "friday",
	6: "saturday",
};

function hhmmToMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

export type PreferredTimeCoverage = {
	dayOfWeek: string;
	time: string;
	priority: number;
	covered: boolean;
};

export type CoverageResult = {
	trainerId: string;
	coverage: PreferredTimeCoverage[];
	coveredCount: number;
	totalCount: number;
};

type CoverageDeps = {
	listTrainerAvailability: typeof listTrainerAvailabilityImpl;
	listPreferredTimes: typeof listPreferredTimesImpl;
};

/**
 * Compute how many of a package instance's preferred times the given trainer can
 * cover, by matching each preferred `{dayOfWeek, time}` against the trainer's
 * recurring `available` windows (weekly template — no date projection needed).
 */
export async function coverageForPreferredTimes(
	tenantDb: TenantDb,
	trainerId: string,
	packageInstanceId: string,
	deps: CoverageDeps = {
		listTrainerAvailability: listTrainerAvailabilityImpl,
		listPreferredTimes: listPreferredTimesImpl,
	},
): Promise<CoverageResult> {
	const [prefRows, recurring] = await Promise.all([
		deps.listPreferredTimes(tenantDb, packageInstanceId),
		deps.listTrainerAvailability(tenantDb, trainerId),
	]);

	const windowsByDay = new Map<
		string,
		{ startTime: string; endTime: string }[]
	>();
	for (const slot of recurring) {
		if (slot.kind && slot.kind !== "available") continue;
		const list = windowsByDay.get(slot.dayOfWeek) ?? [];
		list.push({ startTime: slot.startTime, endTime: slot.endTime });
		windowsByDay.set(slot.dayOfWeek, list);
	}

	const coverage: PreferredTimeCoverage[] = prefRows.map((p) => {
		const windows = windowsByDay.get(p.dayOfWeek.toLowerCase()) ?? [];
		const t = hhmmToMinutes(p.time);
		const covered = windows.some(
			(w) => hhmmToMinutes(w.startTime) <= t && hhmmToMinutes(w.endTime) > t,
		);
		return {
			dayOfWeek: p.dayOfWeek,
			time: p.time,
			priority: p.priority,
			covered,
		};
	});

	return {
		trainerId,
		coverage,
		coveredCount: coverage.filter((c) => c.covered).length,
		totalCount: coverage.length,
	};
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function toDateStr(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type AvailIndex = {
	freeByDate: Map<string, { startTime: string; endTime: string }[]>;
	recurringByDay: Map<string, { startTime: string; endTime: string }[]>;
};

/**
 * Classify a proposed wall-clock slot against the trainer's availability.
 * - after_expiry        → date is past the package validity window
 * - ok                  → fits inside a free window for that date
 * - conflict            → the trainer has a recurring window covering it, but it's booked
 * - outside_availability→ no recurring window covers it (trainer doesn't work then)
 */
function classifySlot(
	slotDate: Date,
	time: string,
	duration: number,
	expiresAt: Date,
	trainerId: string | null,
	avail: AvailIndex,
): { status: ProposedSlotStatus; reason?: string } {
	if (slotDate.getTime() > expiresAt.getTime()) {
		return { status: "after_expiry", reason: "After package expiry" };
	}
	// No trainer assigned yet — nothing to validate against.
	if (!trainerId) return { status: "ok" };

	const dateStr = toDateStr(slotDate);
	const startMin = hhmmToMinutes(time);
	const endMin = startMin + duration;

	const freeWindows = avail.freeByDate.get(dateStr) ?? [];
	const fitsFree = freeWindows.some(
		(w) =>
			hhmmToMinutes(w.startTime) <= startMin &&
			hhmmToMinutes(w.endTime) >= endMin,
	);
	if (fitsFree) return { status: "ok" };

	const dayName = JS_IDX_TO_DAY_NAME[slotDate.getDay()];
	const recurring = dayName ? (avail.recurringByDay.get(dayName) ?? []) : [];
	const inRecurring = recurring.some(
		(w) =>
			hhmmToMinutes(w.startTime) <= startMin &&
			hhmmToMinutes(w.endTime) >= endMin,
	);
	if (inRecurring) {
		return {
			status: "conflict",
			reason: "Trainer already booked at this time",
		};
	}
	return {
		status: "outside_availability",
		reason: "Outside trainer's available hours",
	};
}

/**
 * Build the proposed schedule for a package instance. Pure-ish: availability,
 * preferred-time and recurring-window reads are injected for testability.
 */
export async function proposeSchedule(
	tenantDb: TenantDb,
	params: ProposeScheduleParams,
	deps: ScheduleProposalDeps = DEFAULT_DEPS,
): Promise<ProposeScheduleResult> {
	const pkg = await tenantDb.query.packageInstances.findFirst({
		where: eq(packageInstances.id, params.packageInstanceId),
	});
	if (!pkg) throw new Error("Package instance not found");

	// Mirror createAppointment's credit formula exactly (creditsTotal - creditsUsed)
	// rather than the generated creditsRemaining column, so the proposal count and
	// the create-time credit guard agree.
	const creditsRemaining = Math.max(0, pkg.creditsTotal - pkg.creditsUsed);

	const svc = await tenantDb.query.services.findFirst({
		where: eq(services.id, pkg.serviceId),
	});
	// services.duration is stored in SECONDS; appointments.duration is MINUTES.
	const duration = svc?.duration
		? Math.max(1, Math.floor(svc.duration / 60))
		: 60;

	const prefRows = await deps.listPreferredTimes(
		tenantDb,
		params.packageInstanceId,
	);
	const preferredTimes = prefRows.map((p) => ({
		dayOfWeek: p.dayOfWeek,
		time: p.time,
		priority: p.priority,
	}));

	const trainerId = pkg.assignedTrainerId;
	const expiresAt = pkg.expiresAt;
	const validUntil = expiresAt.toISOString();

	const fromDate = params.fromDate
		? new Date(`${params.fromDate}T00:00:00`)
		: new Date();
	fromDate.setHours(0, 0, 0, 0);

	const base: Omit<ProposeScheduleResult, "proposed"> = {
		packageInstanceId: pkg.id,
		creditsRemaining,
		duration,
		trainerId,
		validUntil,
		preferredTimes,
	};

	if (creditsRemaining <= 0) {
		return { ...base, proposed: [] };
	}

	// Build availability index (only when a trainer is assigned).
	const avail: AvailIndex = {
		freeByDate: new Map(),
		recurringByDay: new Map(),
	};
	if (trainerId) {
		const computed = await deps.computeAvailableSlots(
			tenantDb,
			trainerId,
			fromDate,
			expiresAt,
		);
		for (const day of computed) avail.freeByDate.set(day.date, day.windows);

		const recurring = await deps.listTrainerAvailability(tenantDb, trainerId);
		for (const slot of recurring) {
			if (slot.kind && slot.kind !== "available") continue;
			const list = avail.recurringByDay.get(slot.dayOfWeek) ?? [];
			list.push({ startTime: slot.startTime, endTime: slot.endTime });
			avail.recurringByDay.set(slot.dayOfWeek, list);
		}
	}

	const proposed: ProposedSlot[] = [];

	if (preferredTimes.length > 0) {
		// Round-robin the preferred times forward from `fromDate`, one slot per
		// remaining credit. Each preferred index keeps its own cursor so repeated
		// uses land on successive weeks.
		const cursor: Record<number, Date> = {};
		for (let i = 0; i < creditsRemaining; i++) {
			const prefIdx = i % preferredTimes.length;
			const pref = preferredTimes[prefIdx]!;
			const targetDow = DAY_NAME_TO_JS_IDX[pref.dayOfWeek.toLowerCase()] ?? 1;

			const search = cursor[prefIdx]
				? new Date(cursor[prefIdx]!)
				: new Date(fromDate);
			// Advance to the next matching weekday (>= search).
			let guard = 0;
			while (search.getDay() !== targetDow && guard < 7) {
				search.setDate(search.getDate() + 1);
				guard++;
			}

			const [hh, mm] = pref.time.split(":").map(Number);
			const slotDate = new Date(search);
			slotDate.setHours(hh ?? 0, mm ?? 0, 0, 0);

			// Move this preferred index's cursor to the next week.
			const nextCursor = new Date(search);
			nextCursor.setDate(nextCursor.getDate() + 7);
			cursor[prefIdx] = nextCursor;

			const { status, reason } = classifySlot(
				slotDate,
				pref.time,
				duration,
				expiresAt,
				trainerId,
				avail,
			);
			proposed.push({
				index: i,
				date: toDateStr(slotDate),
				time: pref.time,
				duration,
				sourcePriority: pref.priority,
				status,
				conflictReason: reason,
			});
		}
	} else if (trainerId) {
		// No preferred times → fall back to the earliest free windows, one per credit.
		const computed = await deps.computeAvailableSlots(
			tenantDb,
			trainerId,
			fromDate,
			expiresAt,
		);
		let i = 0;
		for (const day of computed) {
			if (i >= creditsRemaining) break;
			for (const w of day.windows) {
				if (i >= creditsRemaining) break;
				const slotDate = new Date(`${day.date}T00:00:00`);
				const [hh, mm] = w.startTime.split(":").map(Number);
				slotDate.setHours(hh ?? 0, mm ?? 0, 0, 0);
				const afterExpiry = slotDate.getTime() > expiresAt.getTime();
				proposed.push({
					index: i,
					date: day.date,
					time: w.startTime,
					duration,
					sourcePriority: null,
					status: afterExpiry ? "after_expiry" : "ok",
					conflictReason: afterExpiry ? "After package expiry" : undefined,
				});
				i++;
			}
		}
		// If availability can't fill every credit, the UI lets the actor add the
		// remaining slots manually — we don't fabricate placeholder dates here.
	}
	// No preferred times AND no trainer → empty proposed; the UI is fully manual.

	return { ...base, proposed };
}
