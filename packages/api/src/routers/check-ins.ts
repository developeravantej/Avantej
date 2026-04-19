/**
 * Check-Ins Router
 *
 * API endpoints for recording and managing attendance check-ins.
 * Requires attendance_management permission.
 *
 * RBAC: all write operations check that branchId is within the caller's
 * accessibleNodeIds (defense-in-depth beyond the permission check).
 */

import { requirePermission } from "@avantej-core/services";
import {
	deleteCheckIn,
	listCheckIns,
	listTodaysBookings,
	recordCheckIn,
} from "@avantej-core/services/check-ins.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

export const checkInsRouter = {
	/**
	 * Record a check-in for a member or walk-in against an appointment or as a drop-in.
	 *
	 * Throws ALREADY_CHECKED_IN (mapped to CONFLICT) for duplicate drop-ins within 30 min.
	 */
	recordCheckIn: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				clientType: z.enum(["member", "walk_in"]),
				clientId: z.string().min(1),
				branchId: z.string().uuid(),
				appointmentClientId: z.string().uuid().optional(),
				source: z.enum(["booking", "drop_in"]),
				outcome: z.enum(["attended", "no_show", "late_cancel"]).optional(),
				packageInstanceId: z.string().uuid().optional(),
				creditsConsumed: z.number().int().min(0).default(0),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"attendance_management",
				"create",
			);

			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(input.branchId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Branch is outside your accessible scope",
				});
			}

			try {
				return await recordCheckIn(context.tenantDb, {
					clientType: input.clientType,
					clientId: input.clientId,
					branchId: input.branchId,
					appointmentClientId: input.appointmentClientId,
					source: input.source,
					outcome: input.outcome,
					packageInstanceId: input.packageInstanceId,
					creditsConsumed: input.creditsConsumed,
					notes: input.notes,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as {
					code?: string;
					minutesAgo?: number;
					existingCheckInId?: string;
				};
				if (e?.code === "ALREADY_CHECKED_IN") {
					throw new ORPCError("CONFLICT", {
						message: `Already checked in ${e.minutesAgo ?? 0} minute${e.minutesAgo === 1 ? "" : "s"} ago`,
						data: { existingCheckInId: e.existingCheckInId },
					});
				}
				throw err;
			}
		}),

	/**
	 * List today's booked appointments for a branch, annotated with check-in status.
	 */
	listTodaysBookings: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"attendance_management",
				"read",
			);

			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(input.branchId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Branch is outside your accessible scope",
				});
			}

			const controlPanelDb = getControlPanelDb(context);

			return listTodaysBookings(context.tenantDb, controlPanelDb, {
				branchId: input.branchId,
				date: new Date(input.date),
				accessibleNodeIds,
			});
		}),

	/**
	 * List check-ins with optional filters and RBAC scoping.
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				// Accept both strict ISO (e.g. "2026-04-19T00:00:00.000Z") and naive local (e.g. "2026-04-19T00:00:00").
				// Service calls new Date() which parses both.
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "Expected ISO datetime")
					.optional(),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "Expected ISO datetime")
					.optional(),
				clientId: z.string().optional(),
				clientType: z.enum(["member", "walk_in"]).optional(),
				outcome: z.enum(["attended", "no_show", "late_cancel"]).optional(),
				limit: z.number().int().min(1).max(200).default(100),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"attendance_management",
				"read",
			);

			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			const controlPanelDb = getControlPanelDb(context);

			return listCheckIns(context.tenantDb, controlPanelDb, {
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				clientId: input.clientId,
				clientType: input.clientType,
				outcome: input.outcome,
				accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	/**
	 * Delete a check-in record (mistake correction).
	 * Reverts appointment_clients.attended and package credit consumption.
	 */
	deleteCheckIn: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"attendance_management",
				"delete",
			);

			try {
				await deleteCheckIn(context.tenantDb, input.id, {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				});
			} catch (err) {
				const e = err as { code?: string };
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", {
						message: `Check-in ${input.id} not found`,
					});
				}
				throw err;
			}

			return { success: true };
		}),
};
