import {
	createAppointment,
	getAppointmentById,
	updateAppointment,
	syncAppointmentToGoogleCalendar,
	writeAudit,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
} from "../../guards";
import { eq, sql } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { mapPgError } from "../../lib/orpc-error-mapper";
import { appointmentTypeSchema, statusSchema } from "./schemas";
import type { TenantTx } from "./types";

/**
 * Resolve a customer's display name from the shared control-panel `user` table.
 * Best-effort: returns null if the CP DB is unavailable or the user is absent,
 * so a missing name never blocks appointment creation. The snapshot column is
 * nullable and list views fall back to a live lookup when it is null.
 */
async function resolveCustomerName(
	context: Parameters<
		Parameters<typeof tenantProcedure.handler>[0]
	>[0]["context"],
	userId: string | null | undefined,
): Promise<string | null> {
	if (!userId) return null;
	try {
		const cpDb = getControlPanelDb(context);
		const row = await cpDb
			.select({ name: cpUsers.name })
			.from(cpUsers)
			.where(eq(cpUsers.id, userId))
			.limit(1);
		// `|| null` (not `??`): treat an empty name as absent so list views fall
		// back to the live lookup rather than rendering a blank.
		return row[0]?.name || null;
	} catch {
		return null;
	}
}

export const appointmentsCrudProcedures = {
	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				type: appointmentTypeSchema,
				startTime: z.string().datetime(),
				duration: z.number().int().min(1),
				branchId: z.string().uuid(),
				serviceId: z.string().uuid().nullable().optional(),
				status: statusSchema.optional(),
				sessionTotal: z.number().int().min(0),
				pricePerClient: z.number().int().min(0),
				userId: z.string().nullable().optional(),
				trainerId: z.string().uuid().nullable().optional(),
				packageInstanceId: z.string().uuid().nullable().optional(),
				creditsUsed: z.number().int().min(0).optional(),
				location: z.string().nullable().optional(),
				classSlotId: z.string().uuid().nullable().optional(),
				description: z.string().nullable().optional(),
				imageUrl: z.string().nullable().optional(),
				notes: z.string().nullable().optional(),
				bookingNumber: z.string().nullable().optional(),
				staffAssignments: z
					.array(
						z.object({
							staffId: z.string().uuid(),
							slotIndex: z.number().int().min(0),
						}),
					)
					.optional(),
				recurrence: z
					.object({
						frequencyValue: z.number().int().min(1),
						timeUnit: z.enum(["day", "week", "month"]),
						repeatOn: z.array(z.number().int().min(0).max(6)).optional(),
						monthlyType: z.enum(["day_of_month", "day_of_week"]).optional(),
						monthlyDayOfWeek: z.number().int().min(0).max(6).optional(),
						monthlyWeekOfMonth: z.number().int().min(-1).max(5).optional(),
						endsType: z.enum(["never", "on_date", "after_occurrences"]),
						endsAfterOccurrences: z.number().int().min(1).optional(),
						endsOn: z.string().datetime().optional(),
					})
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Clients can self-book without staff permission, but only:
			//  - for themselves (input.userId === their session user id)
			//  - at their own branch (input.branchId === their member.hierarchyScopeId)
			const sessionUserId = context.session?.user?.id;
			const isClientSelfBooking =
				context.member.role === "client" &&
				!!sessionUserId &&
				input.userId === sessionUserId &&
				input.branchId === context.member.hierarchyScopeId;

			if (!isClientSelfBooking) {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"appointment_management",
					"create",
				);

				await guardInputBranchForContext(context, input.branchId);
			}

			// Defensive guard: a booking against a `pending` package_instance is
			// never allowed (package is awaiting trainer assignment / approval).
			// The booking transaction in package-instance.service.ts also enforces
			// this — this router-level check just returns a friendlier error.
			if (input.packageInstanceId) {
				const pkg = await context.tenantDb.query.packageInstances.findFirst({
					where: eq(packageInstances.id, input.packageInstanceId),
				});
				if (pkg && pkg.status === "pending") {
					throw new ORPCError("FORBIDDEN", {
						message: "Package is awaiting trainer assignment.",
					});
				}
			}

			// Snapshot the customer's name once at create time (read-scaling).
			const customerNameSnapshot = await resolveCustomerName(
				context,
				input.userId,
			);

			try {
				const created = await createAppointment(context.tenantDb, {
					type: input.type,
					startTime: new Date(input.startTime),
					duration: input.duration,
					branchId: input.branchId,
					serviceId: input.serviceId ?? null,
					status: input.status,
					sessionTotal: input.sessionTotal,
					pricePerClient: input.pricePerClient,
					createdBy: context.member.userId,
					userId: input.userId ?? null,
					customerName: customerNameSnapshot,
					trainerId: input.trainerId ?? null,
					packageInstanceId: input.packageInstanceId ?? null,
					creditsUsed: input.creditsUsed,
					location: input.location ?? null,
					classSlotId: input.classSlotId ?? null,
					description: input.description ?? null,
					imageUrl: input.imageUrl ?? null,
					notes: input.notes ?? null,
					bookingNumber: input.bookingNumber ?? null,
					staffAssignments: input.staffAssignments,
					recurrence: input.recurrence
						? {
								...input.recurrence,
								endsOn: input.recurrence.endsOn
									? new Date(input.recurrence.endsOn)
									: undefined,
							}
						: undefined,
				});

				// Fire-and-forget Google Calendar sync — never blocks the response
				const gcalConfig = {
					clientId: process.env.GOOGLE_CLIENT_ID ?? "",
					clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
				};
				syncAppointmentToGoogleCalendar(
					context.tenantDb,
					created,
					"create",
					gcalConfig,
				).catch((err) => console.error("GCal create sync error:", err));

				return created;
			} catch (error) {
				// J3 — translate PG exclusion / FK violations into typed ORPCError so
				// the UI can show a "trainer/room already booked" toast instead of a
				// generic "Failed to create appointment" message.
				const mapped = mapPgError(error);
				if (mapped) throw mapped;
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to create appointment",
				});
			}
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				status: statusSchema.optional(),
				startTime: z.string().datetime().optional(),
				duration: z.number().int().min(1).optional(),
				trainerId: z.string().uuid().nullable().optional(),
				location: z.string().nullable().optional(),
				notes: z.string().nullable().optional(),
				cancelledAt: z.string().datetime().nullable().optional(),
				cancellationReason: z.string().nullable().optional(),
				description: z.string().nullable().optional(),
				imageUrl: z.string().nullable().optional(),
				staffAssignments: z
					.array(
						z.object({
							staffId: z.string().uuid(),
							slotIndex: z.number().int().min(0),
						}),
					)
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const existing = await getAppointmentById(context.tenantDb, input.id);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: "Appointment not found",
				});
			}

			const userId = context.session?.user?.id;
			const isClient = userId && existing.userId === userId;
			const isStaff = context.member;

			if (isStaff) {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"appointment_management",
					"update",
				);
				await guardInputBranchForContext(context, existing.branchId);
			} else if (isClient) {
				if (input.status && input.status !== "cancelled") {
					throw new ORPCError("FORBIDDEN", {
						message: "Clients can only cancel (set status to cancelled)",
					});
				}
				if (input.staffAssignments !== undefined) {
					throw new ORPCError("FORBIDDEN", {
						message: "Clients cannot modify staff assignments",
					});
				}
			} else {
				throw new ORPCError("FORBIDDEN", {
					message: "Access denied",
				});
			}

			// Actor is required by the service layer to fire commission generation
			// when status transitions to 'completed' or 'cancelled' (Phase 1 rule).
			// Without it, commission splits are never created.
			const actor = {
				userId: context.session?.user?.id ?? "system",
				memberId: context.member?.id ?? "system",
				role: context.member?.role ?? "system",
			};

			const updateParams = {
				status: input.status,
				startTime: input.startTime ? new Date(input.startTime) : undefined,
				duration: input.duration,
				trainerId: input.trainerId,
				location: input.location,
				notes: input.notes,
				cancelledAt: input.cancelledAt
					? new Date(input.cancelledAt)
					: undefined,
				cancellationReason:
					input.cancellationReason ??
					(input.status === "cancelled" ? "Cancelled by client" : undefined),
				description: input.description,
				imageUrl: input.imageUrl,
				staffAssignments: input.staffAssignments,
				actor,
			};

			try {
				const updated = await updateAppointment(
					context.tenantDb,
					input.id,
					updateParams,
				);

				// Fire-and-forget Google Calendar sync — never blocks the response
				const gcalConfig = {
					clientId: process.env.GOOGLE_CLIENT_ID ?? "",
					clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
				};
				const syncAction = input.status === "cancelled" ? "delete" : "update";
				syncAppointmentToGoogleCalendar(
					context.tenantDb,
					updated,
					syncAction,
					gcalConfig,
				).catch((err) => console.error("GCal update sync error:", err));

				return updated;
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to update appointment",
				});
			}
		}),

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

			return { reinstated: creditsToRestore };
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
			await guardInputBranchForContext(context, existing.branchId);

			const reschedulable = ["pending", "confirmed", "rescheduled"];
			if (!reschedulable.includes(existing.status)) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot reschedule an appointment with status "${existing.status}". Only upcoming sessions can be moved.`,
				});
			}

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
