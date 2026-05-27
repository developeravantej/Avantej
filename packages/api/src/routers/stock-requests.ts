import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardInputBranchForContext, resolveAccessibleNodeIds } from "../guards";
import {
	listStockRequests,
	getStockRequestById,
	createStockRequest,
	approveStockRequest,
	fulfillStockRequest,
	rejectStockRequest,
} from "@avantej-core/services";
import type { Context } from "../context";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { members } from "@avantej-core/db/schema/tenant/members";

type Member = typeof members.$inferSelect;
type TenantDb = NeonDatabase<typeof tenantSchema>;

/**
 * IW-09: Guard that the caller has access to at least one of the stock request's
 * branch nodes (fromBranchId or toBranchId). Callers who cannot access either
 * branch receive FORBIDDEN.
 */
async function guardStockRequestBranchAccess(
	context: Context & { tenantDb: TenantDb; member: Member },
	request: { fromBranchId?: string | null; toBranchId: string },
): Promise<void> {
	const accessibleNodeIds = await resolveAccessibleNodeIds(context);

	const hasToBranch = accessibleNodeIds.includes(request.toBranchId);
	const hasFromBranch =
		!request.fromBranchId || accessibleNodeIds.includes(request.fromBranchId);

	if (!hasToBranch && !hasFromBranch) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to any branch on this stock request",
		});
	}
}

export const stockRequestsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z.string().optional(),
				fromBranchId: z.string().uuid().optional(),
				toBranchId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "read");

			return listStockRequests(context.tenantDb, {
				status: input.status,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "read");

			const request = await getStockRequestById(context.tenantDb, input.id);
			if (!request) {
				throw new ORPCError("NOT_FOUND", {
					message: `Stock request not found: ${input.id}`,
				});
			}
			return request;
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				dateIssued: z.string().datetime(),
				issuedByMemberId: z.string().uuid(),
				fromBranchId: z.string().uuid().optional(),
				toBranchId: z.string().uuid(),
				destinationLabel: z.string().optional(),
				notes: z.string().optional(),
				items: z.array(
					z.object({
						productId: z.string().uuid(),
						quantityRequested: z.number().int().min(1),
						notes: z.string().optional(),
					})
				),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "create");

			// IW-09: Verify caller has RBAC access to both branch nodes
			await guardInputBranchForContext(context, input.toBranchId);
			if (input.fromBranchId) {
				await guardInputBranchForContext(context, input.fromBranchId);
			}

			return createStockRequest(context.tenantDb, {
				dateIssued: new Date(input.dateIssued),
				issuedByMemberId: input.issuedByMemberId,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				destinationLabel: input.destinationLabel,
				notes: input.notes,
				items: input.items,
			});
		}),

	approve: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "approve");

			// IW-09: Load request and verify caller can access at least one of its branch nodes
			const request = await getStockRequestById(context.tenantDb, input.id);
			if (!request) {
				throw new ORPCError("NOT_FOUND", { message: `Stock request not found: ${input.id}` });
			}
			await guardStockRequestBranchAccess(context, request);

			return approveStockRequest(context.tenantDb, input.id);
		}),

	reject: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "reject");

			// IW-09: Load request and verify caller can access at least one of its branch nodes
			const request = await getStockRequestById(context.tenantDb, input.id);
			if (!request) {
				throw new ORPCError("NOT_FOUND", { message: `Stock request not found: ${input.id}` });
			}
			await guardStockRequestBranchAccess(context, request);

			return rejectStockRequest(context.tenantDb, input.id);
		}),

	fulfill: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				items: z.array(
					z.object({
						itemId: z.string().uuid(),
						quantityFulfilled: z.number().int().min(0),
					})
				),
			})
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "update");

			// IW-09: Load request and verify caller can access at least one of its branch nodes
			const request = await getStockRequestById(context.tenantDb, input.id);
			if (!request) {
				throw new ORPCError("NOT_FOUND", { message: `Stock request not found: ${input.id}` });
			}
			await guardStockRequestBranchAccess(context, request);

			return fulfillStockRequest(context.tenantDb, input.id, input.items);
		}),
};
