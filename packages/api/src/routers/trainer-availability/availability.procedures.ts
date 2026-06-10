import {
	createTrainerAvailability,
	deleteTrainerAvailabilitySlot,
	updateTrainerAvailability,
	upsertTrainerAvailability,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { dayOfWeekSchema, kindSchema } from "./_shared";

export const availabilityProcedures = {
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
						endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
						kind: kindSchema,
					}),
				),
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
				return await upsertTrainerAvailability(
					context.tenantDb,
					input.trainerId,
					input.slots,
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
			await deleteTrainerAvailabilitySlot(context.tenantDb, input.id);
			return { success: true };
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
				startTime: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
					.optional(),
				endTime: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
					.optional(),
				kind: z.enum(["available", "blocked", "timeoff"]).optional(),
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
};
