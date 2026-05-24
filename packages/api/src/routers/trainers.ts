/**
 * Trainers Router
 *
 * Exposes per-trainer stats and schedule endpoints.
 *
 * RBAC:
 *   weeklyStats    — member_management:read + self-or-approve gate
 *   weeklySchedule — appointment_management:read
 *   weeklyStatsBatch — member_management:approve (admin-level)
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch } from "../guards";
import {
	getTrainerWeeklyStats,
	getTrainerWeeklySchedule,
	getTrainerWeeklyStatsBatch,
} from "@avantej-core/services/trainer.service";
import { hasPermission } from "@avantej-core/services";

export const trainersRouter = {
	/**
	 * Weekly stats for a single trainer.
	 *
	 * Requires member_management:read AND (self OR member_management:approve).
	 */
	weeklyStats: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string(), // members.userId (cross-DB user ID)
				weekStart: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			

		assertOrgContextMatch(context, input);
			// RBAC: must have member_management:read
			const canRead = await hasPermission(
				context.tenantDb,
				context.member,
				"user_management",
				"read",
			);
			if (!canRead) {
				throw new ORPCError("FORBIDDEN", {
					message: "Requires member_management:read permission",
				});
			}

			// Self-or-approve gate
			const isSelf = context.member.userId === input.memberId;
			if (!isSelf) {
				const canApprove = await hasPermission(
					context.tenantDb,
					context.member,
					"user_management",
					"approve",
				);
				if (!canApprove) {
					throw new ORPCError("FORBIDDEN", {
						message: "You can only view your own stats unless you have approve permission",
					});
				}
			}

			return getTrainerWeeklyStats(
				context.tenantDb,
				input.memberId,
				input.weekStart ? new Date(input.weekStart) : undefined,
			);
		}),

	/**
	 * Next-7-days schedule for a trainer.
	 *
	 * Requires appointment_management:read.
	 */
	weeklySchedule: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string(),
				weekStart: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			

		assertOrgContextMatch(context, input);
			const canRead = await hasPermission(
				context.tenantDb,
				context.member,
				"appointment_management",
				"read",
			);
			if (!canRead) {
				throw new ORPCError("FORBIDDEN", {
					message: "Requires appointment_management:read permission",
				});
			}

			return getTrainerWeeklySchedule(
				context.tenantDb,
				input.memberId,
				input.weekStart ? new Date(input.weekStart) : undefined,
			);
		}),

	/**
	 * Batch weekly stats for up to 100 trainers.
	 *
	 * Requires member_management:approve (admin-level, card-grid use).
	 * Returns a plain object (record) keyed by userId — oRPC serialises Maps as objects.
	 */
	weeklyStatsBatch: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberIds: z.array(z.string()).min(1).max(100),
				weekStart: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			

		assertOrgContextMatch(context, input);
			const canApprove = await hasPermission(
				context.tenantDb,
				context.member,
				"user_management",
				"approve",
			);
			if (!canApprove) {
				throw new ORPCError("FORBIDDEN", {
					message: "Requires member_management:approve permission",
				});
			}

			const statsMap = await getTrainerWeeklyStatsBatch(
				context.tenantDb,
				input.memberIds,
				input.weekStart ? new Date(input.weekStart) : undefined,
			);

			// Convert Map to plain record for JSON serialisation
			return Object.fromEntries(statsMap);
		}),
};
