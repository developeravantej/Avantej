/**
 * Sales Orders Router — query procedures
 *
 * Reads: list (with createdBy + first-item enrichment), getById,
 * statusHistory (cursor-paged), KPI summary, largest-today, latest-completed.
 */

import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
	guardStoredBranchForContext,
} from "../../guards";
import {
	listSalesOrders,
	getSalesOrderById,
	getSalesOrderStatusHistory,
	getSalesOrderKpiSummary,
	getLargestSaleToday,
	getLatestCompletedSalesOrder,
} from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { salesOrderItems } from "@avantej-core/db/schema/tenant-schema";
import { getControlPanelDb } from "../../lib/context-helpers";
import { encodeCursor, parseCursor } from "../../lib/cursor";
import { salesOrderStatusEnum, refundStatusEnum } from "./_shared";

export const salesOrderQueryProcedures = {
	list: tenantProcedure
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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			const result = await listSalesOrders(context.tenantDb, {
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
			const createdByIds = [
				...new Set(result.rows.map((r) => r.createdBy).filter(Boolean)),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				createdByIds.length > 0
					? await cpDb
							.select({
								id: cpUsers.id,
								name: cpUsers.name,
								email: cpUsers.email,
							})
							.from(cpUsers)
							.where(inArray(cpUsers.id, createdByIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]),
			);

			// Fetch first line-item description per order
			const orderIds = result.rows.map((r) => r.id);
			const itemRows = await context.tenantDb
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

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			const order = await getSalesOrderById(context.tenantDb, input.id);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Sales order not found: ${input.id}`,
				});
			}

			// Tenant isolation: a record pinned to a branch outside the caller's
			// accessible scope must not be readable cross-branch.
			await guardStoredBranchForContext(context, order.branchId);

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

	statusHistory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			// Tenant isolation: load the parent order and verify its branch is in
			// scope before exposing its status history.
			const order = await getSalesOrderById(
				context.tenantDb,
				input.salesOrderId,
			);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Sales order not found: ${input.salesOrderId}`,
				});
			}
			await guardStoredBranchForContext(context, order.branchId);

			const limit = input.limit;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getSalesOrderStatusHistory(
				context.tenantDb,
				input.salesOrderId,
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

	// frontend wires this to /dashboard/sales/view KPI strip
	kpiSummary: tenantProcedure
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
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			// Resolve period: if new `period` param provided, use it.
			// Otherwise fall back to legacy periodStart/periodEnd or default to "month".
			let resolvedPeriod: import("@avantej-core/services").KpiPeriod;
			if (input.period) {
				resolvedPeriod = input.period;
			} else if (input.periodStart || input.periodEnd) {
				const now = new Date();
				resolvedPeriod = {
					from:
						input.periodStart ??
						new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
					to:
						input.periodEnd ??
						new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
				};
			} else {
				resolvedPeriod = "month";
			}

			return getSalesOrderKpiSummary(context.tenantDb, {
				period: resolvedPeriod,
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),

	largestToday: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			return getLargestSaleToday(context.tenantDb, {
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
	getLatest: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			return getLatestCompletedSalesOrder(context.tenantDb, {
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),
};
