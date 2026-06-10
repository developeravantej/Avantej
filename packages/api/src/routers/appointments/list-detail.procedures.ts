import {
	getAppointmentById,
	getAppointmentStatusHistory,
	listAppointmentsWithRecurrence,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardStoredBranchForContext,
	resolveAccessibleNodeIds,
} from "../../guards";
import { inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { statusSchema } from "./schemas";

export const appointmentsDetailProcedures = {
	/**
	 * List appointments for the current user (client view). Uses session user id.
	 */
	listForUser: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: statusSchema.optional(),
				statuses: z.array(statusSchema).optional(),
				startFrom: z.string().datetime().optional(),
				startTo: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(200).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			// Use recurrence-aware list so virtual occurrences are included.
			// listAppointmentsWithRecurrence does not accept a userId filter — apply it
			// post-expansion along with status/statuses/limit.
			const startFrom = input.startFrom
				? new Date(input.startFrom)
				: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			const startTo = input.startTo
				? new Date(input.startTo)
				: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

			let items = await listAppointmentsWithRecurrence(context.tenantDb, {
				organizationId: input.organizationId,
				startFrom,
				startTo,
				accessibleNodeIds,
			});

			// Filter to appointments belonging to the requesting user
			items = items.filter((r) => r.userId === userId);

			// Apply status filters post-expansion
			if (input.statuses && input.statuses.length > 0) {
				const statuses = input.statuses;
				items = items.filter((r) =>
					statuses.includes(r.status as (typeof statuses)[number]),
				);
			} else if (input.status) {
				items = items.filter((r) => r.status === input.status);
			}

			if (input.limit) {
				items = items.slice(0, input.limit);
			}

			return items;
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const appointment = await getAppointmentById(context.tenantDb, input.id);
			if (!appointment) {
				throw new ORPCError("NOT_FOUND", {
					message: "Appointment not found",
				});
			}

			const userId = context.session?.user?.id;
			const isClient = userId && appointment.userId === userId;
			const isStaff = context.member;

			if (isClient) {
				return appointment;
			}

			if (isStaff) {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"appointment_management",
					"read",
				);
				await guardStoredBranchForContext(context, appointment.branchId);
				return appointment;
			}

			throw new ORPCError("FORBIDDEN", {
				message: "Access denied",
			});
		}),

	statusHistory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"read",
			);

			const limit = input.limit;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getAppointmentStatusHistory(
				context.tenantDb,
				input.appointmentId,
				{
					parsedCursor,
					limit,
				},
			);

			const hasMore = rawRows.length > limit;
			const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

			const userIds = [
				...new Set(
					pageRows.map((r) => r.changedBy).filter((id) => id !== "system"),
				),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				userIds.length > 0
					? await cpDb
							.select({
								id: cpUsers.id,
								name: cpUsers.name,
								email: cpUsers.email,
							})
							.from(cpUsers)
							.where(inArray(cpUsers.id, userIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
			);

			const rows = pageRows.map(({ changedBy, ...rest }) => ({
				...rest,
				changedByName:
					changedBy === "system"
						? "System"
						: (nameMap.get(changedBy) ?? "Unknown User"),
			}));

			return { rows, nextCursor };
		}),
};
