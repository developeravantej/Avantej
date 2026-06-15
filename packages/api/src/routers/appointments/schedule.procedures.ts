/**
 * Appointment scheduling procedures (post-approval session scheduling).
 *
 * - proposeSchedule:        read-only — propose dated slots for an active package
 *                           instance from preferred times + trainer availability.
 * - bulkCreateFromSchedule: create one appointment per confirmed slot, each
 *                           debiting one package credit.
 *
 * See packages/services/src/schedule-proposal.service.ts for the wall-clock
 * timezone contract (proposeSchedule returns wall-clock parts; the client
 * assembles ISO instants in the browser TZ before calling bulkCreateFromSchedule).
 */

import { createAppointment, proposeSchedule } from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	requirePermissionOrpc,
	guardBranchAccessible,
} from "../../guards";
import { mapPgError } from "../../lib/orpc-error-mapper";

export const appointmentsScheduleProcedures = {
	/**
	 * Propose dated session slots for an active package instance, one per remaining
	 * credit, projected from the member's preferred times and validated against the
	 * assigned trainer's availability. Read-only.
	 */
	proposeSchedule: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				fromDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"create",
			);

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			// Branch-scope via the package's service branch (mirrors assignTrainer).
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			if (svc?.branchId) {
				guardBranchAccessible(svc.branchId, context.accessibleNodeIds ?? []);
			}

			return proposeSchedule(context.tenantDb, {
				packageInstanceId: input.packageInstanceId,
				fromDate: input.fromDate,
			});
		}),

	/**
	 * Create one appointment per confirmed slot against an active package instance.
	 * Each create debits exactly one credit (creditsUsed: 1) inside its own
	 * transaction with a FOR UPDATE credit re-check (see createAppointment), so
	 * concurrent schedulers can never over-debit. An upfront bound check gives a
	 * clean early error before any insert. Per-slot failures are reported in
	 * `failed[]` without aborting the batch (mirrors bulkApprove).
	 */
	bulkCreateFromSchedule: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				slots: z
					.array(
						z.object({
							// ISO instant assembled by the client in browser TZ.
							startTime: z.string().datetime(),
							// Session length in minutes.
							duration: z.number().int().min(1),
						}),
					)
					.min(1)
					.max(100),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"create",
			);

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}
			if (pkg.status !== "active") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Package is not active (current status: ${pkg.status}). Sessions can only be scheduled for active packages.`,
				});
			}
			if (!pkg.assignedTrainerId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Assign a trainer before scheduling sessions.",
				});
			}

			// Resolve the service (branch + duration unit) and a usable branch id.
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			const trainerMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.id, pkg.assignedTrainerId),
			});
			const branchId = svc?.branchId ?? trainerMember?.hierarchyScopeId ?? null;
			if (!branchId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"No branch could be resolved for this package's service or trainer.",
				});
			}
			guardBranchAccessible(branchId, context.accessibleNodeIds ?? []);

			// Upfront credit bound (createAppointment re-checks per call under FOR UPDATE).
			const creditsRemaining = Math.max(0, pkg.creditsTotal - pkg.creditsUsed);
			if (input.slots.length > creditsRemaining) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot schedule ${input.slots.length} sessions — only ${creditsRemaining} credit(s) remaining.`,
				});
			}

			const created: Array<{ id: string; startTime: string }> = [];
			const failed: Array<{ startTime: string; reason: string }> = [];

			for (const slot of input.slots) {
				try {
					const appt = await createAppointment(context.tenantDb, {
						type: "private",
						startTime: new Date(slot.startTime),
						duration: slot.duration,
						serviceId: pkg.serviceId,
						branchId,
						status: "pending",
						sessionTotal: 0,
						pricePerClient: 0,
						createdBy: context.member.userId,
						userId: pkg.clientId ?? null,
						trainerId: pkg.assignedTrainerId,
						packageInstanceId: pkg.id,
						creditsUsed: 1,
					});
					created.push({ id: appt.id, startTime: slot.startTime });
				} catch (err) {
					const mapped = mapPgError(err);
					failed.push({
						startTime: slot.startTime,
						reason:
							mapped?.message ??
							(err instanceof Error ? err.message : "Failed to create session"),
					});
				}
			}

			return {
				created,
				failed,
				createdCount: created.length,
				failedCount: failed.length,
			};
		}),
};
