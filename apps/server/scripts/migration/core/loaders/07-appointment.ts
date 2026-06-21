/**
 * CanonicalAppointment[] → appointments.
 *
 * Resolves branch (required), trainer, booked-by, and client via crosswalks.
 * Price/commission fields (session_total, price_per_client) are absent from the
 * source for historical rows → set 0 and flagged; coach payout lives in
 * redemption.claim_amount. sales_order / redemption / package / reschedule links
 * are deferred (blocked or later loaders).
 *
 * NOTE: in this client's sample the transactional client refs (CL-xxxx) do not
 * match the client dimension's populated key — those links resolve to null and
 * are flagged as a source data-quality issue.
 */
import { sql } from "drizzle-orm";
import type { CanonicalAppointment } from "../canonical";
import { lookup, record } from "../crosswalk";
import type { Tx } from "../../lib/db";
import type { MigrationLog } from "../../lib/log";

interface Ctx {
	tx: Tx;
	log: MigrationLog;
}

export async function loadAppointments(
	appointments: CanonicalAppointment[],
	ctx: Ctx,
): Promise<void> {
	const { tx, log } = ctx;

	for (const a of appointments) {
		if (await lookup(tx, "appointment", a.legacyId, a.sourceSystem)) {
			log.skipped("appointment", a.legacyId);
			continue;
		}

		// branch is NOT NULL — skip the row if unresolved.
		const branchId = a.branchLegacyId
			? await lookup(tx, "location", a.branchLegacyId, a.sourceSystem)
			: null;
		if (!branchId) {
			log.dropField(`appointment.branch unresolved (${a.legacyId})`);
			continue;
		}
		if (!a.startTime || !a.endTime) {
			log.dropField(`appointment.times missing (${a.legacyId})`);
			continue;
		}

		const trainerId = a.coachLegacyId
			? await lookup(tx, "staff_member", a.coachLegacyId, a.sourceSystem)
			: null;
		const userId = a.clientLegacyId
			? await lookup(tx, "client", a.clientLegacyId, a.sourceSystem)
			: null;
		if (a.clientLegacyId && !userId) {
			log.dropField(
				`appointment.client unresolved (${a.clientLegacyId} — key mismatch)`,
			);
		}
		const createdBy =
			(a.bookedByLegacyId
				? await lookup(tx, "staff", a.bookedByLegacyId, a.sourceSystem)
				: null) ?? "migration";

		const r = await tx.execute(sql`
			INSERT INTO appointments
				(type, start_time, duration, end_time, branch_id, status,
				 session_total, price_per_client, created_by, user_id, trainer_id,
				 notes, booking_number, cancelled_at, cancellation_reason)
			VALUES
				(${a.type}, ${a.startTime}, ${a.durationMinutes}, ${a.endTime}, ${branchId}, ${a.status},
				 0, 0, ${createdBy}, ${userId}, ${trainerId},
				 ${a.notes ?? null}, ${a.bookingNumber ?? null}, ${a.cancelledAt ?? null}, ${a.cancellationReason ?? null})
			RETURNING id
		`);
		const id = r.rows[0]?.id;
		if (typeof id !== "string")
			throw new Error(`appointment insert failed: ${a.legacyId}`);
		await record(
			tx,
			"appointment",
			a.legacyId,
			a.sourceSystem,
			"appointments",
			id,
		);
		log.created("appointment", a.legacyId);
	}

	if (appointments.length > 0) {
		log.dropField(
			"appointment.session_total / price_per_client (0 — no source; commission via redemption)",
		);
	}
}
