import {
	bulkApproveRefunds,
	createPartialRefund,
} from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";

export const refundsBulkProcedures = {
	/**
	 * Create a partial refund against a package instance — refunds a specific
	 * number of session credits. Locks the package_instances row via SELECT FOR
	 * UPDATE; rolls back on any validation failure. Agent 2.8 — J5.
	 */
	createPartial: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				creditsRefunded: z.number().int().positive(),
				reason: z.string().min(1).max(1000),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"refund_management",
				"create",
			);

			try {
				return await createPartialRefund(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					creditsRefunded: input.creditsRefunded,
					reason: input.reason,
					branchId: input.branchId,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Operation failed",
				});
			}
		}),

	/**
	 * Bulk-approve up to 50 pending refunds in a single call.
	 *
	 * 1.6 — Each row is processed in its own independent transaction; a failure
	 * on one item does NOT roll back others. The response is a per-id success/error
	 * array that the caller must inspect.
	 *
	 * Accepts the same optional approveAmountCents and reviewNotes overrides as the
	 * single-row approve endpoint.
	 */
	bulkApprove: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				items: z
					.array(
						z.object({
							id: z.string().uuid(),
							approveAmountCents: z.number().int().positive().optional(),
							reviewNotes: z.string().max(2000).optional(),
						}),
					)
					.min(1)
					.max(50),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"refund_management",
				"approve",
			);

			try {
				return await bulkApproveRefunds(context.tenantDb, input.items, {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Operation failed",
				});
			}
		}),
};
