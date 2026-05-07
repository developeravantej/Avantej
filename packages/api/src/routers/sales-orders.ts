import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "../index";
import {
	requirePermission,
	listSalesOrders,
	getSalesOrderById,
	createSalesOrder,
	updateSalesOrder,
	cancelSalesOrder,
	getSalesOrderStatusHistory,
} from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../lib/context-helpers";
import { encodeCursor, parseCursor } from "../lib/cursor";

const salesOrderStatusEnum = z.enum(["draft", "confirmed", "completed", "cancelled"]);

export const salesOrdersRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				status: salesOrderStatusEnum.optional(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return listSalesOrders(context.tenantDb, {
				branchId: input.branchId,
				status: input.status,
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const order = await getSalesOrderById(context.tenantDb, input.id);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Sales order not found: ${input.id}`,
				});
			}

			let createdByName: string | null = null;
			if (order.createdBy) {
				const controlPanelDb = context.honoContext?.get("controlPanelDb") as
					| NeonDatabase<typeof controlPanelSchema>
					| undefined;
				if (controlPanelDb) {
					const { users } = await import(
						"@avantej-core/db/schema/control-panel/users"
					);
					const u = await controlPanelDb.query.users.findFirst({
						where: eq(users.id, order.createdBy),
					});
					createdByName = u?.name ?? u?.email ?? null;
				}
			}
			return { ...order, createdByName };
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				date: z.string().datetime(),
				customerId: z.string().optional(),
				customerName: z.string().min(1),
				createdBy: z.string().min(1),
				branchId: z.string().uuid(),
				status: salesOrderStatusEnum.optional(),
				totalAmount: z.number().int(),
				notes: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "create");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createSalesOrder(context.tenantDb, {
				date: new Date(input.date),
				customerId: input.customerId,
				customerName: input.customerName,
				createdBy: input.createdBy,
				branchId: input.branchId,
				status: input.status,
				totalAmount: input.totalAmount,
				notes: input.notes,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				date: z.string().datetime().optional(),
				customerId: z.string().optional(),
				customerName: z.string().optional(),
				status: salesOrderStatusEnum.optional(),
				totalAmount: z.number().int().optional(),
				notes: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return updateSalesOrder(context.tenantDb, input.id, {
				date: input.date ? new Date(input.date) : undefined,
				customerId: input.customerId,
				customerName: input.customerName,
				status: input.status,
				totalAmount: input.totalAmount,
				notes: input.notes,
			});
		}),

	cancel: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				cancelledBy: z.string().min(1),
				reason: z.string().optional(),
				refundAmount: z.number().int(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "delete");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member.id,
				role: context.member.role,
			};

			return cancelSalesOrder(context.tenantDb, input.id, {
				cancelledBy: input.cancelledBy,
				reason: input.reason,
				refundAmount: input.refundAmount,
			}, actor);
		}),

	statusHistory: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const limit = input.limit;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getSalesOrderStatusHistory(context.tenantDb, input.salesOrderId, {
				parsedCursor,
				limit,
			});

			const hasMore = rawRows.length > limit;
			const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

			const userIds = [
				...new Set(pageRows.map((r) => r.changedBy).filter((id) => id !== "system")),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				userIds.length > 0
					? await cpDb
							.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
							.from(cpUsers)
							.where(inArray(cpUsers.id, userIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
			);

			const rows = pageRows.map(({ changedBy, ...rest }) => ({
				...rest,
				changedByName:
					changedBy === "system" ? "System" : (nameMap.get(changedBy) ?? "Unknown User"),
			}));

			return { rows, nextCursor };
		}),
};
