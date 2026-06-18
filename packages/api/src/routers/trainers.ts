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
	getTrainerCustomers,
} from "@avantej-core/services/trainer.service";
import { hasPermission } from "@avantej-core/services";
import { inArray } from "drizzle-orm";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../lib/context-helpers";

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
						message:
							"You can only view your own stats unless you have approve permission",
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

	/**
	 * Distinct customers (clients) handled by a trainer.
	 *
	 * Requires appointment_management:read.
	 */
	customers: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string(), // members.userId
				limit: z.number().int().min(1).max(50).optional(),
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

			const customers = await getTrainerCustomers(
				context.tenantDb,
				input.memberId,
				input.limit,
			);

			if (customers.length === 0) return [];

			// Enrich with names from control panel DB
			const userIds = customers.map((c) => c.userId);
			let nameMap = new Map<string, string>();
			try {
				const cpDb = getControlPanelDb(context);
				const userRows = await cpDb
					.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
					.from(cpUsers)
					.where(inArray(cpUsers.id, userIds));
				for (const u of userRows) {
					nameMap.set(u.id, u.name ?? u.email ?? "Unknown");
				}
			} catch {
				// CP DB unavailable — return without names
			}

			return customers.map((c) => ({
				...c,
				name: nameMap.get(c.userId) ?? "Unknown Customer",
			}));
		}),
};
