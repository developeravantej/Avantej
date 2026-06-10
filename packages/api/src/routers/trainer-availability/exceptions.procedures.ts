import {
	addTrainerAvailabilityException,
	deleteTrainerAvailabilityException,
	getTrainerConflicts,
	listTrainerAvailabilityExceptions,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../guards";

export const exceptionsProcedures = {
	getConflicts: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				weekStart: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			return getTrainerConflicts(context.tenantDb, {
				branchId: input.branchId,
				weekStart: input.weekStart,
			});
		}),

	addException: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				kind: z.enum(["blocked", "timeoff"]).default("timeoff"),
				reason: z.string().trim().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"update",
			);
			try {
				return await addTrainerAvailabilityException(context.tenantDb, {
					trainerId: input.trainerId,
					date: input.date,
					kind: input.kind,
					reason: input.reason,
					createdBy: context.session?.user.id,
				});
			} catch (error) {
				// Unique-index violation: trainer already has an exception for this date
				const msg =
					error instanceof Error ? error.message : "Failed to add exception";
				if (msg.includes("trainer_availability_exc_trainer_date_uniq")) {
					throw new ORPCError("CONFLICT", {
						message:
							"An exception already exists for this trainer on this date.",
					});
				}
				throw new ORPCError("BAD_REQUEST", { message: msg });
			}
		}),

	listExceptions: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional(),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			return listTrainerAvailabilityExceptions(
				context.tenantDb,
				input.trainerId,
				{ from: input.from, to: input.to },
			);
		}),

	deleteException: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"update",
			);
			await deleteTrainerAvailabilityException(context.tenantDb, input.id);
			return { success: true };
		}),
};
