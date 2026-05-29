/**
 * Payouts Router
 *
 * API endpoint for listing payouts with recipient enrichment from control panel.
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	cancelPayout,
	markPayoutFailed,
	markPayoutPaid,
	retryPayout,
} from "@avantej-core/services/payouts.service";

export const payoutsLifecycleProcedures = {
	/**
	 * `pending | processing → paid` for an individual payout row. Operator
	 * confirms an out-of-band settlement (wire / cheque / Stripe webhook).
	 */
	markPaid: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				paymentReference: z.string().min(1).max(200),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process");
			try {
				return await markPayoutPaid(context.tenantDb, input.id, {
					paymentReference: input.paymentReference,
					actor: {
						userId: context.member.userId,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
				if (e?.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to mark payout paid" });
			}
		}),

	/**
	 * `pending | processing → failed`. Operator records the failure reason
	 * (bank rejection, bounced cheque, etc.). Linked splits stay at 'approved'
	 * so a subsequent `retry` keeps the existing payout linkage.
	 */
	markFailed: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reason: z.string().min(1).max(1000),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process");
			try {
				return await markPayoutFailed(context.tenantDb, input.id, {
					reason: input.reason,
					actor: {
						userId: context.member.userId,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
				if (e?.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to mark payout failed" });
			}
		}),

	/**
	 * `failed → pending`. Reset for another attempt. No effect on linked splits.
	 */
	retry: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process");
			try {
				return await retryPayout(context.tenantDb, input.id, {
					actor: {
						userId: context.member.userId,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
				if (e?.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to retry payout" });
			}
		}),

	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reason: z.string().min(1).max(1000),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process");
			try {
				return await cancelPayout(context.tenantDb, input.id, {
					reason: input.reason,
					actor: {
						userId: context.member.userId,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				if (err instanceof ORPCError) throw err;
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
				if (e?.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to cancel payout" });
			}
		})
};
