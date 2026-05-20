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
	getSalesOrderKpiSummary,
	getLargestSaleToday,
	getLatestCompletedSalesOrder,
	CANCELLATION_REASON_CATEGORIES,
	SALES_ORDER_REFUND_STATUSES,
} from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { salesOrderItems } from "@avantej-core/db/schema/tenant-schema";
import { getControlPanelDb } from "../lib/context-helpers";
import { encodeCursor, parseCursor } from "../lib/cursor";

const salesOrderStatusEnum = z.enum(["draft", "confirmed", "completed", "cancelled"]);
const refundStatusEnum = z.enum(SALES_ORDER_REFUND_STATUSES);
const cancellationReasonCategoryEnum = z.enum(CANCELLATION_REASON_CATEGORIES);

// Shared tenant + member guard — throws ORPCError if not available
function requireTenantMember(context: { tenantDb?: unknown; member?: unknown }) {
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
}

export const salesOrdersRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				status: salesOrderStatusEnum.optional(),
				refundStatus: refundStatusEnum.optional(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const result = await listSalesOrders(context.tenantDb!, {
				branchId: input.branchId,
				status: input.status,
				refundStatus: input.refundStatus,
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});

			if (result.rows.length === 0) return result;

			// Batch-resolve createdBy IDs → display names
			const createdByIds = [...new Set(result.rows.map((r) => r.createdBy).filter(Boolean))];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				createdByIds.length > 0
					? await cpDb
							.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
							.from(cpUsers)
							.where(inArray(cpUsers.id, createdByIds))
					: [];
			const nameMap = new Map(userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));

			// Fetch first line-item description per order
			const orderIds = result.rows.map((r) => r.id);
			const itemRows = await context.tenantDb!
				.select({
					salesOrderId: salesOrderItems.salesOrderId,
					description: salesOrderItems.description,
				})
				.from(salesOrderItems)
				.where(inArray(salesOrderItems.salesOrderId, orderIds));
			const firstItemMap = new Map<string, string>();
			for (const item of itemRows) {
				if (!firstItemMap.has(item.salesOrderId)) {
					firstItemMap.set(item.salesOrderId, item.description);
				}
			}

			return {
				...result,
				rows: result.rows.map((r) => ({
					...r,
					createdByName: nameMap.get(r.createdBy) ?? null,
					firstItemDescription: firstItemMap.get(r.id) ?? null,
				})),
			};
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const order = await getSalesOrderById(context.tenantDb!, input.id);
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
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "create");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createSalesOrder(context.tenantDb!, {
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
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return updateSalesOrder(context.tenantDb!, input.id, {
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
				cancellationReasonCategory: cancellationReasonCategoryEnum.optional(),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "delete");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member!.id,
				role: context.member!.role,
			};

			return cancelSalesOrder(
				context.tenantDb!,
				input.id,
				{
					cancelledBy: input.cancelledBy,
					reason: input.reason,
					refundAmount: input.refundAmount,
					cancellationReasonCategory: input.cancellationReasonCategory,
				},
				actor,
			);
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
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const limit = input.limit;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getSalesOrderStatusHistory(context.tenantDb!, input.salesOrderId, {
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

	// frontend wires this to /dashboard/sales/view KPI strip
	kpiSummary: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				// New period param — default "month" preserves legacy behaviour
				period: z
					.union([
						z.enum(["today", "week", "month"]),
						z.object({ from: z.coerce.date(), to: z.coerce.date() }),
					])
					.optional(),
				// Legacy flat params — kept for backwards compat; ignored when period is provided
				periodStart: z.coerce.date().optional(),
				periodEnd: z.coerce.date().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			// Resolve period: if new `period` param provided, use it.
			// Otherwise fall back to legacy periodStart/periodEnd or default to "month".
			let resolvedPeriod: import("@avantej-core/services").KpiPeriod;
			if (input.period) {
				resolvedPeriod = input.period;
			} else if (input.periodStart || input.periodEnd) {
				const now = new Date();
				resolvedPeriod = {
					from: input.periodStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
					to: input.periodEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
				};
			} else {
				resolvedPeriod = "month";
			}

			return getSalesOrderKpiSummary(context.tenantDb!, {
				period: resolvedPeriod,
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),

	largestToday: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return getLargestSaleToday(context.tenantDb!, {
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),

	/**
	 * Returns the most recently completed sales order (with line items and
	 * payment method) for the caller's accessible scope. Returns null when
	 * no completed orders exist yet — used by the POS "Last Receipt Preview"
	 * panel to seed initial state on session mount.
	 */
	getLatest: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			try {
				await requirePermission(context.tenantDb!, context.member!, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return getLatestCompletedSalesOrder(context.tenantDb!, {
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),
};
