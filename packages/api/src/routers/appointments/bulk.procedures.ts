/**
 * WS4 (MOVE parity) — bulk appointment status transitions.
 *
 * Loops the SAME `updateAppointment` engine per id (never a raw UPDATE), so
 * credit restore + commission (runAppointmentCommission) + status-history +
 * audit fire for every row exactly as a single update would. Runs sequentially
 * to avoid contending on the per-package row locks updateAppointment takes, and
 * returns a per-id result so a partial failure (a locked package, a 24h-lock
 * cancel) surfaces per row instead of failing the whole batch.
 */

import { getAppointmentById, updateAppointment } from "@avantej-core/services";
import { z } from "zod";

import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	guardStoredBranchForContext,
	requirePermissionOrpc,
} from "../../guards";
import { assertOutsideBookingLock } from "./lock";

export interface BulkStatusResult {
	id: string;
	ok: boolean;
	error?: string;
}

export const appointmentsBulkProcedures = {
	// Bulk mark-completed / cancel. Only the two terminal transitions a front
	// desk performs in bulk are exposed; each row still passes through the full
	// status machine + side-effects.
	// Named `updateStatusBulk` (not bulkUpdateStatus) so the SaaS read-only
	// write gate (isWriteProcedure matches the "update" verb prefix) blocks it
	// on a past-due/lapsed tenant, exactly like the single appointments.update.
	updateStatusBulk: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				// Virtual recurrence occurrences have non-uuid ids and are rejected
				// by z.string().uuid() — the UI must not send them.
				appointmentIds: z.array(z.string().uuid()).min(1).max(100),
				status: z.enum(["completed", "cancelled"]),
				cancellationReason: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"update",
			);

			const actor = {
				userId: context.session?.user?.id ?? "system",
				// null (not "system") — actor_member_id is a uuid column.
				memberId: context.member?.id ?? null,
				role: context.member?.role ?? "system",
			};

			const results: BulkStatusResult[] = [];
			// Sequential on purpose — updateAppointment locks the backing package
			// row FOR UPDATE; parallel calls on one tenant DB would contend.
			for (const id of input.appointmentIds) {
				try {
					const existing = await getAppointmentById(context.tenantDb, id);
					if (!existing) {
						results.push({ id, ok: false, error: "Appointment not found" });
						continue;
					}
					// Same RBAC as a single update: the caller must be able to reach
					// the appointment's branch.
					await guardStoredBranchForContext(context, existing.branchId);
					// 24h lock applies to cancels (admins override) — mirrors the
					// single-update path.
					if (input.status === "cancelled") {
						assertOutsideBookingLock(
							existing.startTime,
							context.member,
							"cancel",
						);
					}
					await updateAppointment(context.tenantDb, id, {
						status: input.status,
						cancellationReason:
							input.status === "cancelled"
								? (input.cancellationReason ?? "Bulk cancellation")
								: undefined,
						cancelledAt: input.status === "cancelled" ? new Date() : undefined,
						actor,
					});
					results.push({ id, ok: true });
				} catch (err) {
					results.push({
						id,
						ok: false,
						error: err instanceof Error ? err.message : "Update failed",
					});
				}
			}

			return {
				results,
				completed: results.filter((r) => r.ok).length,
				failed: results.filter((r) => !r.ok).length,
			};
		}),
};
