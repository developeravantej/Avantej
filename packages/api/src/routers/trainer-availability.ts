import {
	addTrainerAvailabilityException,
	computeAvailableSlots,
	createTrainerAvailability,
	deleteTrainerAvailabilityException,
	deleteTrainerAvailabilitySlot,
	getTrainerConflicts,
	getTrainerUtilisation,
	listTrainerAvailability,
	listTrainerAvailabilityByBranch,
	listTrainerAvailabilityExceptions,

	updateTrainerAvailability,
	upsertTrainerAvailability,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
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

const kindSchema = z.enum(["available", "blocked", "timeoff"]).default("available");

export const trainerAvailabilityRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			
			return listTrainerAvailability(context.tenantDb, input.trainerId);
		}),

	listByBranch: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			
			const controlPanelDb = getControlPanelDb(context);
			return listTrainerAvailabilityByBranch(
				controlPanelDb,
				context.tenantDb,
				{ branchId: input.branchId },
			);
		}),

	getComputedSlots: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			})
		)
		.handler(async ({ input, context }) => {
			
			const startDate = new Date(`${input.startDate}T00:00:00`);
			const endDate = new Date(`${input.endDate}T23:59:59`);
			return computeAvailableSlots(
				context.tenantDb,
				input.trainerId,
				startDate,
				endDate,
			);
		}),

	upsert: tenantProcedure
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
						kind: kindSchema,
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
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
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

	delete: tenantProcedure
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
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			await deleteTrainerAvailabilitySlot(context.tenantDb, input.id);
			return { success: true };
		}),

	getUtilisation: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			})
		)
		.handler(async ({ input, context }) => {
			
			return getTrainerUtilisation(context.tenantDb, {
				branchId: input.branchId,
				weekStart: input.weekStart,
			});
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				dayOfWeek: dayOfWeekSchema,
				startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
				endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
				kind: kindSchema,
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			try {
				return await createTrainerAvailability(context.tenantDb, {
					trainerId: input.trainerId,
					dayOfWeek: input.dayOfWeek,
					startTime: input.startTime,
					endTime: input.endTime,
					kind: input.kind,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to create availability slot",
				});
			}
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				dayOfWeek: dayOfWeekSchema.optional(),
				startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").optional(),
				endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").optional(),
				kind: z.enum(["available", "blocked", "timeoff"]).optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			try {
				return await updateTrainerAvailability(context.tenantDb, input.id, {
					dayOfWeek: input.dayOfWeek,
					startTime: input.startTime,
					endTime: input.endTime,
					kind: input.kind,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to update availability slot",
				});
			}
		}),

	getConflicts: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			})
		)
		.handler(async ({ input, context }) => {
			
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
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
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
				from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
				to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
			})
		)
		.handler(async ({ input, context }) => {
			
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
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			await deleteTrainerAvailabilityException(context.tenantDb, input.id);
			return { success: true };
		}),
};
