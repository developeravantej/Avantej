import {
	getAppointmentById,
	updateAppointment,
	syncAppointmentToGoogleCalendar,
	writeAudit,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { assertOutsideBookingLock } from "./lock";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardStoredBranchForContext,
} from "../../guards";
import { eq, sql } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { mapPgError } from "../../lib/orpc-error-mapper";
import type { TenantTx } from "./types";

export const appointmentsCreditsProcedures = {
	/**
	 * Reinstate package credits for a no-show appointment.
	 * Does NOT change appointment status or reverse commission — trainer still showed up.
	 * Staff-only; requires appointment_management:update permission.
	 */
	reinstateCredits: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
				reason: z.string().min(1),
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

			const appt = await getAppointmentById(
				context.tenantDb,
				input.appointmentId,
			);
			if (!appt)
				throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });

			if (appt.status !== "no-show") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Credits can only be reinstated for no-show appointments.",
				});
			}

			const creditsToRestore = appt.creditsUsed ?? 0;
			if (!appt.packageInstanceId || creditsToRestore <= 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "This appointment has no package credits to reinstate.",
				});
			}

			await context.tenantDb.transaction(async (tx: TenantTx) => {
				const [pkg] = await tx
					.select()
					.from(packageInstances)
					.where(eq(packageInstances.id, appt.packageInstanceId!))
					.for("update");

				if (!pkg || (pkg.status !== "active" && pkg.status !== "exhausted")) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Package is not in a state where credits can be reinstated.",
					});
				}

				await tx
					.update(packageInstances)
					.set({
						creditsUsed: sql`GREATEST(credits_used - ${creditsToRestore}, 0)`,
						...(pkg.status === "exhausted" && { status: "active" }),
						updatedAt: new Date(),
					})
					.where(eq(packageInstances.id, appt.packageInstanceId!));

				await writeAudit(tx, {
					actorUserId: context.session?.user?.id ?? "",
					actorMemberId: context.member.id,
					actorRole: context.member.role,
					action: "appointment.credits_reinstated",
					entityType: "appointment",
					entityId: input.appointmentId,
					summary: `${creditsToRestore} credit(s) reinstated for no-show appointment: ${input.reason}`,
					changes: {
						creditsRestored: creditsToRestore,
						reason: input.reason,
						packageInstanceId: appt.packageInstanceId,
					},
				});
			});

			return {
				reinstated: creditsToRestore,
				packageInstanceId: appt.packageInstanceId,
			};
		}),

	/**
	 * Reschedule an existing, not-yet-happened appointment to a new time.
	 *
	 * Update-in-place: moves startTime/duration and sets status "rescheduled".
	 * Deliberately does NOT touch credits (no re-debit, no reinstate) and never
	 * passes a terminal status (completed/cancelled), so commission generation is
	 * not triggered. Appends an entry to the append-only reschedule_history trail.
	 * Booking clashes surface as a typed CONFLICT via mapPgError.
	 */
	reschedule: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
				newStartTime: z.string().datetime(),
				newDuration: z.number().int().min(1).optional(),
				reason: z.string().max(500).optional(),
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

			const existing = await getAppointmentById(
				context.tenantDb,
				input.appointmentId,
			);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
			}
			await guardStoredBranchForContext(context, existing.branchId);

			const reschedulable = ["pending", "confirmed", "rescheduled"];
			if (!reschedulable.includes(existing.status)) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot reschedule an appointment with status "${existing.status}". Only upcoming sessions can be moved.`,
				});
			}

			// UAT §5 — 24-hour lock (shared helper; admins override).
			assertOutsideBookingLock(
				existing.startTime,
				context.member,
				"reschedule",
			);

			const fromIso = existing.startTime.toISOString();
			const newStart = new Date(input.newStartTime);
			const actor = {
				userId: context.session?.user?.id ?? "system",
				memberId: context.member?.id ?? "system",
				role: context.member?.role ?? "system",
			};

			try {
				const updated = await updateAppointment(
					context.tenantDb,
					input.appointmentId,
					{
						startTime: newStart,
						duration: input.newDuration ?? existing.duration,
						status: "rescheduled",
						actor,
					},
				);

				// Append to the append-only reschedule history trail.
				const entry = {
					from: fromIso,
					to: newStart.toISOString(),
					at: new Date().toISOString(),
					by: actor.userId,
				};
				const newHistory = [...(existing.rescheduleHistory ?? []), entry];
				await context.tenantDb
					.update(appointments)
					.set({ rescheduleHistory: newHistory, updatedAt: new Date() })
					.where(eq(appointments.id, input.appointmentId));

				await writeAudit(context.tenantDb, {
					actorUserId: actor.userId,
					actorMemberId: context.member.id,
					actorRole: context.member.role,
					action: "appointment.rescheduled",
					entityType: "appointment",
					entityId: input.appointmentId,
					summary: `Appointment rescheduled from ${fromIso} to ${newStart.toISOString()}${
						input.reason ? `: ${input.reason}` : ""
					}`,
					changes: {
						from: fromIso,
						to: newStart.toISOString(),
						reason: input.reason ?? null,
					},
				});

				// Fire-and-forget Google Calendar sync — never blocks the response.
				const gcalConfig = {
					clientId: process.env.GOOGLE_CLIENT_ID ?? "",
					clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
				};
				syncAppointmentToGoogleCalendar(
					context.tenantDb,
					updated,
					"update",
					gcalConfig,
				).catch((err) => console.error("GCal reschedule sync error:", err));

				return { ...updated, rescheduleHistory: newHistory };
			} catch (error) {
				const mapped = mapPgError(error);
				if (mapped) throw mapped;
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to reschedule appointment",
				});
			}
		}),
};
