/**
 * Recurrence Service
 *
 * Pure-function expansion of recurrence rules into virtual appointment occurrences,
 * plus the merged-list query used by the appointments list API.
 *
 * Timezone note: all date math is UTC for MVP. Malaysia is UTC+8 with no DST,
 * so for local scheduling the caller should shift the window by +8 h before
 * passing windowStart / windowEnd. Full tz support is a future enhancement.
 *
 * Monthly day_of_month edge case: JS setUTCMonth rolls over (e.g. Jan 31 + 1 month → Mar 3).
 * This is acceptable for MVP.
 */

import { eq, and, gte, lte, inArray, isNull, isNotNull } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type RecurrenceRule = typeof recurrenceRules.$inferSelect;
type AppointmentRow = typeof appointments.$inferSelect;

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_VIRTUAL_OCCURRENCES = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppointmentWithOccurrence extends AppointmentRow {
	occurrenceDate?: Date;
	isVirtual: boolean;
	parentId?: string;
	syntheticId?: string; // "virtual__{parentId}__{isoDate}"
}

// ─── Virtual ID helpers ───────────────────────────────────────────────────────

/** Build a stable synthetic ID for a virtual (not-yet-materialized) occurrence. */
export function makeVirtualId(parentId: string, isoDate: string): string {
	return `virtual__${parentId}__${isoDate}`;
}

/** Return true if the id is a synthetic virtual-occurrence id. */
export function isVirtualId(id: string): boolean {
	return id.startsWith("virtual__");
}

/**
 * Parse a virtual id back into its constituent parts.
 * Caller must ensure id is actually virtual (call isVirtualId first).
 */
export function parseVirtualId(id: string): { parentId: string; isoDate: string } {
	const parts = id.split("__", 3);
	return { parentId: parts[1] ?? "", isoDate: parts[2] ?? "" };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() + days);
	return d;
}

function addWeeks(date: Date, weeks: number): Date {
	return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
	const d = new Date(date);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d;
}

/** Returns the ISO date portion "YYYY-MM-DD" from a UTC date. */
function toIsoDateStr(d: Date): string {
	return d.toISOString().split("T")[0]!;
}

/**
 * Find the Nth weekday (0=Sun..6=Sat) of the month containing the given year/month.
 * weekOfMonth: 1 = first, 2 = second, etc. -1 = last.
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, weekOfMonth: number): Date {
	if (weekOfMonth === -1) {
		// Last occurrence: start from end of month
		const lastDay = new Date(Date.UTC(year, month + 1, 0));
		const lastDow = lastDay.getUTCDay();
		const diff = (lastDow - weekday + 7) % 7;
		return new Date(Date.UTC(year, month, lastDay.getUTCDate() - diff));
	}
	// First occurrence of the weekday in the month
	const firstDay = new Date(Date.UTC(year, month, 1));
	const firstDow = firstDay.getUTCDay();
	const diff = (weekday - firstDow + 7) % 7;
	const firstOccurrence = 1 + diff;
	return new Date(Date.UTC(year, month, firstOccurrence + (weekOfMonth - 1) * 7));
}

// ─── Core expansion function ──────────────────────────────────────────────────

/**
 * Pure date calculation — no DB access.
 * Expand the recurrence rule within [windowStart, windowEnd].
 *
 * @param rule - The recurrence_rules row
 * @param parentStartTime - The parent appointment's startTime (anchor for the series)
 * @param endsOn - The appointments.recurringEndDate value (may be null); used when endsType='on_date'
 * @param windowStart - Inclusive lower bound of the query window
 * @param windowEnd - Inclusive upper bound of the query window
 * @returns Array of occurrence start times within the window (preserves time-of-day from parentStartTime)
 */
export function expandRecurrenceRule(
	rule: RecurrenceRule,
	parentStartTime: Date,
	endsOn: Date | null,
	windowStart: Date,
	windowEnd: Date,
): Date[] {
	const {
		frequencyValue,
		timeUnit,
		repeatOn,
		monthlyType,
		monthlyDayOfWeek,
		monthlyWeekOfMonth,
		endsType,
		endsAfterOccurrences,
	} = rule;

	const results: Date[] = [];
	let occurrenceCount = 0;

	/**
	 * Attempt to push a candidate date. Returns false if a global stop condition was hit
	 * (caller should break the outer loop). Returns true otherwise (even if date was skipped
	 * for being before windowStart or after windowEnd).
	 */
	const tryPush = (candidate: Date): boolean => {
		// Check absolute end conditions
		if (candidate > windowEnd) return false;
		if (endsType === "on_date" && endsOn !== null && candidate > endsOn) return false;
		if (
			endsType === "after_occurrences" &&
			endsAfterOccurrences !== null &&
			occurrenceCount >= endsAfterOccurrences
		) return false;

		// Only collect dates within the window
		if (candidate >= windowStart) {
			results.push(new Date(candidate));
			occurrenceCount++;
			if (results.length >= MAX_VIRTUAL_OCCURRENCES) {
				console.warn(
					`[recurrence.service] expandRecurrenceRule: capped at ${MAX_VIRTUAL_OCCURRENCES} occurrences for rule ${rule.id}`,
				);
				return false; // signal caller to stop
			}
		}
		return true;
	};

	// Safety guard against infinite loops
	const MAX_ITERATIONS = MAX_VIRTUAL_OCCURRENCES * 20;
	let iterations = 0;
	let cursor = new Date(parentStartTime);

	if (timeUnit === "day") {
		while (iterations++ < MAX_ITERATIONS) {
			if (!tryPush(cursor)) break;
			cursor = addDays(cursor, frequencyValue);
		}
	} else if (timeUnit === "week") {
		const repeatDays = Array.isArray(repeatOn) && repeatOn.length > 0 ? repeatOn : null;

		if (!repeatDays) {
			// No repeatOn — repeat same weekday every N weeks
			while (iterations++ < MAX_ITERATIONS) {
				if (!tryPush(cursor)) break;
				cursor = addWeeks(cursor, frequencyValue);
			}
		} else {
			// repeatOn specified — emit one date per matching weekday per N-week cycle
			const timeH = parentStartTime.getUTCHours();
			const timeM = parentStartTime.getUTCMinutes();
			const timeS = parentStartTime.getUTCSeconds();
			const timeMs = parentStartTime.getUTCMilliseconds();

			// Normalize cursor to the Sunday of its UTC week
			const cursorDow = cursor.getUTCDay();
			const weekStart = new Date(cursor);
			weekStart.setUTCDate(weekStart.getUTCDate() - cursorDow);
			weekStart.setUTCHours(0, 0, 0, 0);

			const sortedDays = [...repeatDays].sort((a, b) => a - b);
			let done = false;

			while (!done && iterations++ < MAX_ITERATIONS) {
				for (const dow of sortedDays) {
					const candidate = new Date(weekStart);
					candidate.setUTCDate(weekStart.getUTCDate() + dow);
					candidate.setUTCHours(timeH, timeM, timeS, timeMs);

					// Skip candidates before the parent start time
					if (candidate < parentStartTime) continue;

					if (!tryPush(candidate)) {
						done = true;
						break;
					}
				}
				if (!done) {
					// Advance to next N-week cycle
					weekStart.setUTCDate(weekStart.getUTCDate() + frequencyValue * 7);
				}
			}
		}
	} else if (timeUnit === "month") {
		const effectiveMonthlyType = monthlyType ?? "day_of_month";

		if (effectiveMonthlyType === "day_of_month") {
			while (iterations++ < MAX_ITERATIONS) {
				if (!tryPush(cursor)) break;
				cursor = addMonths(cursor, frequencyValue);
			}
		} else {
			// day_of_week: Nth weekday of the month
			const targetDow = monthlyDayOfWeek ?? cursor.getUTCDay();
			const targetWeek = monthlyWeekOfMonth ?? 1;

			while (iterations++ < MAX_ITERATIONS) {
				const candidate = nthWeekdayOfMonth(
					cursor.getUTCFullYear(),
					cursor.getUTCMonth(),
					targetDow,
					targetWeek,
				);
				// Preserve time-of-day from parent
				candidate.setUTCHours(
					parentStartTime.getUTCHours(),
					parentStartTime.getUTCMinutes(),
					parentStartTime.getUTCSeconds(),
					parentStartTime.getUTCMilliseconds(),
				);

				if (!tryPush(candidate)) break;

				// Advance cursor to the 1st of next N months
				cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + frequencyValue, 1));
			}
		}
	}
	// Unknown timeUnit — return empty (no crash)

	return results;
}

// ─── Merged list query ────────────────────────────────────────────────────────

/**
 * Fetch appointments in a time window, expand recurring parents into virtual
 * occurrences, merge with any materialized (real) child rows, and return a
 * unified list sorted by startTime.
 *
 * Rules:
 * - Base query fetches ONLY rows where recurringParentId IS NULL (parents + standalone).
 * - Parents with isRecurring=true AND status != 'cancelled' are expanded via their rule.
 * - Each expansion date is checked against materialized children (recurringParentId IS NOT NULL).
 *   If a child exists for that parent + date, we return the real child (not a virtual).
 * - Virtual occurrences carry all fields copied from the parent (so enrichment — service name,
 *   trainer name, etc. — can work from parent data via the parent id).
 * - Materialized children are merged in directly.
 * - The parent row itself is NOT returned for its occurrence slots.
 *   Exception: a parent with isRecurring=false (shouldn't exist but belt-and-suspenders)
 *   is returned as a standalone row.
 */
export async function listAppointmentsWithRecurrence(
	tenantDb: TenantDb,
	params: {
		organizationId: string;
		trainerId?: string;
		startFrom: Date;
		startTo: Date;
		accessibleNodeIds: string[];
	},
): Promise<AppointmentWithOccurrence[]> {
	const { startFrom, startTo, accessibleNodeIds, trainerId } = params;

	// Guard: Drizzle inArray([]) crashes
	if (accessibleNodeIds.length === 0) return [];

	// ── Step 1: Fetch base rows (recurringParentId IS NULL) ───────────────────
	const baseConditions = [
		isNull(appointments.recurringParentId),
		gte(appointments.startTime, startFrom),
		lte(appointments.startTime, startTo),
		inArray(appointments.branchId, accessibleNodeIds),
	];
	if (trainerId) {
		baseConditions.push(eq(appointments.trainerId, trainerId));
	}

	const baseRows = await tenantDb
		.select()
		.from(appointments)
		.where(and(...baseConditions));

	// ── Step 2: Separate recurring parents from standalone rows ───────────────
	// Only expand parents that are active (not cancelled) — cancelled series must not keep emitting
	const recurringParents = baseRows.filter(
		(r) => r.isRecurring && r.status !== "cancelled",
	);
	const standaloneRows = baseRows.filter((r) => !r.isRecurring);

	// ── Step 3: For each recurring parent, fetch its recurrence rule ──────────
	const parentIds = recurringParents.map((r) => r.id);

	const ruleRows =
		parentIds.length > 0
			? await tenantDb
					.select()
					.from(recurrenceRules)
					.where(inArray(recurrenceRules.appointmentId, parentIds))
			: [];

	const ruleByParentId = new Map<string, RecurrenceRule>(
		ruleRows.map((r) => [r.appointmentId, r]),
	);

	// ── Step 4: Fetch materialized children in the window ─────────────────────
	// We fetch all materialized children for ALL accessible branches (not restricted to parentIds),
	// because cancelled series still have materialized children we need to include.
	const childConditions = [
		isNotNull(appointments.recurringParentId),
		gte(appointments.startTime, startFrom),
		lte(appointments.startTime, startTo),
		inArray(appointments.branchId, accessibleNodeIds),
	];
	if (trainerId) {
		childConditions.push(eq(appointments.trainerId, trainerId));
	}

	const materializedChildren = await tenantDb
		.select()
		.from(appointments)
		.where(and(...childConditions));

	// Build lookup: parentId → Set<"YYYY-MM-DD"> (dates that are already materialized)
	const materializedDates = new Map<string, Set<string>>();
	for (const child of materializedChildren) {
		if (!child.recurringParentId) continue;
		const dateStr = toIsoDateStr(child.startTime);
		if (!materializedDates.has(child.recurringParentId)) {
			materializedDates.set(child.recurringParentId, new Set());
		}
		materializedDates.get(child.recurringParentId)!.add(dateStr);
	}

	// ── Step 5: Expand recurring parents into virtual occurrences ─────────────
	const virtualOccurrences: AppointmentWithOccurrence[] = [];

	for (const parent of recurringParents) {
		const rule = ruleByParentId.get(parent.id);
		if (!rule) {
			// No rule found — treat as standalone (data integrity issue)
			standaloneRows.push(parent);
			continue;
		}

		const endsOn = parent.recurringEndDate;
		const occurrenceDates = expandRecurrenceRule(
			rule,
			parent.startTime,
			endsOn,
			startFrom,
			startTo,
		);

		for (const occDate of occurrenceDates) {
			const dateStr = toIsoDateStr(occDate);
			const alreadyMaterialized = materializedDates.get(parent.id)?.has(dateStr) ?? false;

			if (!alreadyMaterialized) {
				const syntheticId = makeVirtualId(parent.id, dateStr);
				virtualOccurrences.push({
					...parent,
					// Override id and times for this occurrence
					id: syntheticId,
					startTime: occDate,
					endTime: new Date(occDate.getTime() + parent.duration * 60 * 1000),
					// Virtual occurrence metadata
					isVirtual: true,
					parentId: parent.id,
					syntheticId,
					occurrenceDate: occDate,
				});
			}
			// If already materialized: the real child row will appear in childrenWithMeta below
		}
	}

	// ── Step 6: Combine all rows ──────────────────────────────────────────────
	const standaloneWithMeta: AppointmentWithOccurrence[] = standaloneRows.map((r) => ({
		...r,
		isVirtual: false,
	}));

	const childrenWithMeta: AppointmentWithOccurrence[] = materializedChildren.map((r) => ({
		...r,
		isVirtual: false,
		parentId: r.recurringParentId ?? undefined,
	}));

	const combined = [...standaloneWithMeta, ...virtualOccurrences, ...childrenWithMeta];

	// Sort by startTime ascending
	combined.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

	return combined;
}
