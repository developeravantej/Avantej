import {
	claimIntakeSlot,
	computeOpenIntakeSlots,
	listCoachIntakeByBranch,
	listCoachIntakeSlots,
	listIntakeExceptions,

	unclaimIntakeSlot,
	upsertCoachIntakeSlots,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
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

export const coachIntakeRouter = {
	// List all active recurring intake slots for a trainer — no permission gate
	listSlots: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			return listCoachIntakeSlots(context.tenantDb, input.trainerId);
		}),

	// Replace all recurring intake slots — admin or self
	upsertSlots: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				slots: z.array(
					z.object({
						dayOfWeek: dayOfWeekSchema,
						startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
						endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
					}),
				),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}

			// Allow admin (appointment_management.update) OR self-update
			try {
				await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			} catch {
				// Not an admin — only allow if caller is the trainer themselves
				if (context.member.id !== input.trainerId) {
					throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
				}
			}

			try {
				return await upsertCoachIntakeSlots(
					context.tenantDb,
					input.trainerId,
					input.slots,
				);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message: error instanceof Error ? error.message : "Failed to update intake slots",
				});
			}
		}),

	// Get open (unclaimed) intake slots for a date range — no permission gate
	getOpenSlots: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			return computeOpenIntakeSlots(
				context.tenantDb,
				input.trainerId,
				input.startDate,
				input.endDate,
			);
		}),

	// Claim (block) a specific intake slot — admin or self
	claimSlot: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
				endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
				reason: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}

			// Allow admin (appointment_management.update) OR self
			try {
				await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
			} catch {
				if (context.member.id !== input.trainerId) {
					throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
				}
			}

			try {
				return await claimIntakeSlot(
					context.tenantDb,
					input.trainerId,
					input.date,
					input.startTime,
					input.endTime,
					input.reason,
				);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message: error instanceof Error ? error.message : "Failed to claim slot",
				});
			}
		}),

	// Delete an exception (unclaim a slot) — requires login + tenantDb
	unclaimSlot: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				exceptionId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			await unclaimIntakeSlot(context.tenantDb, input.exceptionId);
			return { success: true };
		}),

	// List exceptions for a trainer in a date range — no gate, trainers read their own
	listExceptions: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			return listIntakeExceptions(
				context.tenantDb,
				input.trainerId,
				input.startDate,
				input.endDate,
			);
		}),

	// List all coaches with their intake slots, optionally filtered by branch — no gate
	listByBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			const controlPanelDb = getControlPanelDb(context);
			return listCoachIntakeByBranch(controlPanelDb, context.tenantDb, {
				branchId: input.branchId,
			});
		}),
};
