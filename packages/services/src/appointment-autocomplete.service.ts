/**
 * WS4 (MOVE parity) — appointment auto-complete.
 *
 * MOVE auto-completes a booked session once its window has closed. Avantej
 * matches that: any `confirmed` appointment whose `end_time` has passed is
 * transitioned to `completed` — THROUGH `updateAppointment`, so the same
 * commission (runAppointmentCommission "completion") + status-history + audit
 * fire exactly as a manual completion. NEVER writes appointments.status
 * directly (that would silently skip commission).
 *
 * Idempotent: completed rows drop out of the WHERE clause on the next run.
 * Only `confirmed → completed` is driven (the sole legal auto path; `pending`
 * needs a human confirm first, terminal states are excluded). Per-appointment
 * failures (e.g. a locked package) are counted and skipped, never fatal.
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { updateAppointment } from "./appointment.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

/**
 * Cron actor — attribution only; commission staff come from the appointment.
 * memberId MUST be null (not "system"): it is written to the nullable uuid
 * column audit_logs.actor_member_id, and a non-uuid string throws 22P02 and
 * rolls back the whole updateAppointment transaction.
 */
const SYSTEM_ACTOR = {
	userId: "system",
	memberId: null,
	role: "system",
} as const;

export interface AutoCompleteResult {
	/** confirmed appointments whose window had closed. */
	candidates: number;
	completed: number;
	/** transitions that threw (e.g. locked package) — logged, non-fatal. */
	skipped: number;
}

/**
 * Complete every `confirmed` appointment whose session end time is in the
 * past. Returns per-tenant counts.
 */
export async function autoCompleteOverdueAppointments(
	tenantDb: TenantDb,
	now: Date = new Date(),
): Promise<AutoCompleteResult> {
	const rows = await tenantDb
		.select({ id: appointments.id })
		.from(appointments)
		.where(
			and(
				eq(appointments.status, "confirmed"),
				lt(appointments.endTime, now),
				// A service is required for commission; skip service-less rows so
				// they aren't churned every hour to no effect.
				isNotNull(appointments.serviceId),
			),
		);

	const result: AutoCompleteResult = {
		candidates: rows.length,
		completed: 0,
		skipped: 0,
	};

	for (const { id } of rows) {
		try {
			await updateAppointment(tenantDb, id, {
				status: "completed",
				actor: SYSTEM_ACTOR,
			});
			result.completed++;
		} catch (err) {
			// Locked package, race with a manual edit, invalid transition, etc.
			// Count + continue — one bad row must not stall the sweep.
			result.skipped++;
			console.warn(
				`[appointment-autocomplete] skipped appointment=${id}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return result;
}
