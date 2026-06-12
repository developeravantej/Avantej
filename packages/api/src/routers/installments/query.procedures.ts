/**
 * Installments Router — query procedures
 *
 * Read paths: per-package schedule, admin overview, upcoming list, event
 * audit trail, and suggested-refund calculation.
 */

import {
	getInstallmentsByPackageInstance,
	getAdminInstallmentOverview,
	listUpcomingInstallments,
	evaluateAndLockIfOverdue,
	getSuggestedRefund,
} from "@avantej-core/services";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { ORPCError } from "@orpc/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

const listByPackageInstance = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		const clientId = context.session?.user?.id;

		// LC-M8: isOwner must compare the session user against the package's actual clientId,
		// not merely check that a session user ID exists (which is always true for authenticated users).
		const pkg = await context.tenantDb.query.packageInstances.findFirst({
			where: eq(packageInstances.id, input.packageInstanceId),
		});
		const isOwner = pkg?.clientId !== undefined && pkg.clientId === clientId;
		const isStaff = !!context.member;

		if (!isOwner && !isStaff) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "User session required",
			});
		}

		if (isStaff) {
			try {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			} catch {
				// If staff permission check fails but user is the owner (clientId matches),
				// we still allow access — fall through to the service call below.
				if (!isOwner) {
					throw new ORPCError("FORBIDDEN", {
						message: "Permission denied",
					});
				}
			}
		}

		if (context.installmentLockOnOpen !== false) {
			await evaluateAndLockIfOverdue(context.tenantDb, input.packageInstanceId);
		}

		return getInstallmentsByPackageInstance(
			context.tenantDb,
			input.packageInstanceId,
		);
	});

const adminOverview = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			status: z.enum(["active", "overdue", "locked", "due_soon"]).optional(),
			limit: z.number().int().min(1).max(200).optional(),
			offset: z.number().int().min(0).optional(),
			search: z.string().optional(),
			dueBefore: z.string().datetime().optional(),
			dueAfter: z.string().datetime().optional(),
			paymentPlanCode: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"read",
		);

		const controlPanelDb = getControlPanelDb(context);

		return getAdminInstallmentOverview(
			context.tenantDb,
			{
				status: input.status,
				limit: input.limit,
				offset: input.offset,
				search: input.search,
				dueBefore: input.dueBefore ? new Date(input.dueBefore) : undefined,
				dueAfter: input.dueAfter ? new Date(input.dueAfter) : undefined,
				paymentPlanCode: input.paymentPlanCode,
			},
			controlPanelDb,
		);
	});

const listUpcoming = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			window: z.enum(["due_soon", "overdue", "all"]).optional(),
			branchId: z.string().uuid().optional(),
			search: z.string().optional(),
			limit: z.number().int().min(1).max(200).optional(),
			offset: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"read",
		);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds);
		}

		const controlPanelDb = getControlPanelDb(context);

		return listUpcomingInstallments(
			context.tenantDb,
			{
				window: input.window,
				branchId: input.branchId,
				search: input.search,
				limit: input.limit,
				offset: input.offset,
			},
			controlPanelDb,
		);
	});

const getEvents = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"read",
		);

		return context.tenantDb.query.installmentEvents.findMany({
			where: eq(installmentEvents.packageInstanceId, input.packageInstanceId),
			orderBy: [desc(installmentEvents.createdAt)],
		});
	});

const suggestRefund = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

		return getSuggestedRefund(context.tenantDb, input.packageInstanceId);
	});

export const installmentQueryProcedures = {
	listByPackageInstance,
	adminOverview,
	listUpcoming,
	getEvents,
	suggestRefund,
};
