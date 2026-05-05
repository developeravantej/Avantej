import {
	computeAvailableSlots,
	listTrainerAvailability,
	listTrainerAvailabilityByBranch,
	upsertTrainerAvailability,
	deleteTrainerAvailabilitySlot,
	requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

const dayOfWeekSchema = z.enum([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
]);

export const trainerAvailabilityRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			return listTrainerAvailability(context.tenantDb, input.trainerId);
		}),

	listByBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			const controlPanelDb = getControlPanelDb(context);
			return listTrainerAvailabilityByBranch(
				controlPanelDb,
				context.tenantDb,
				{ branchId: input.branchId },
			);
		}),

	getComputedSlots: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			const startDate = new Date(`${input.startDate}T00:00:00`);
			const endDate = new Date(`${input.endDate}T23:59:59`);
			return computeAvailableSlots(
				context.tenantDb,
				input.trainerId,
				startDate,
				endDate,
			);
		}),

	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				slots: z.array(
					z.object({
						dayOfWeek: dayOfWeekSchema,
						startTime: z
							.string()
							.regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
						endTime: z
							.string()
							.regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
					})
				),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"appointment_management",
					"update"
				);
			} catch {
				throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
			}
			try {
				return await upsertTrainerAvailability(
					context.tenantDb,
					input.trainerId,
					input.slots
				);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to update availability",
				});
			}
		}),

	delete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"appointment_management",
					"update"
				);
			} catch {
				throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
			}
			await deleteTrainerAvailabilitySlot(context.tenantDb, input.id);
			return { success: true };
		}),
};
