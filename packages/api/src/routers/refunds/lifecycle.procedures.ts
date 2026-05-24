/**
 * Refunds Router
 *
 * API endpoints for the unified refund ledger with four-step lifecycle:
 *   request → approve | reject → process
 *
 * All write endpoints require the calling member to have the corresponding
 * refund_management permission. Admins (role.priority >= 100) always pass.
 */

import {
	approveRefund,
	bulkApproveRefunds,
	createPartialRefund,
	getRefundById,
	listRefunds,
	processRefund,
	rejectRefund,
	requestRefund,
} from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

export const refundsLifecycleProcedures = {
	request: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid().optional(),
				paymentId: z.string().uuid().optional(),
				packageInstanceId: z.string().uuid().optional(),
				amountCents: z.number().int().positive(),
				taxAmountCents: z.number().int().min(0).optional(),
				reason: z.string().min(1).max(1000),
				notes: z.string().max(2000).optional(),
				customerId: z.string().optional(),
				customerName: z.string().optional(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "create");

			try {
				return await requestRefund(context.tenantDb, {
					salesOrderId: input.salesOrderId,
					paymentId: input.paymentId,
					packageInstanceId: input.packageInstanceId,
					amountCents: input.amountCents,
					taxAmountCents: input.taxAmountCents,
					reason: input.reason,
					notes: input.notes,
					customerId: input.customerId,
					customerName: input.customerName,
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Operation failed" });
			}
		}),

	/**
	 * Approve a pending refund.
	 *
	 * 1.5 — approveAmountCents (optional): approve a smaller amount than requested.
	 * Must be a positive integer ≤ requested AND ≤ remaining-refundable on the target.
	 * Omit to approve the full requested amount.
	 */
	approve: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reviewNotes: z.string().max(2000).optional(),
				/** Partial-approve amount in cents. When omitted the full requested amount is approved. */
				approveAmountCents: z.number().int().positive().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "approve");

			try {
				return await approveRefund(context.tenantDb, input.id, {
					reviewNotes: input.reviewNotes,
					approveAmountCents: input.approveAmountCents,
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Operation failed" });
			}
		}),

	/**
	 * Reject a pending refund. reviewNotes is required.
	 * Uses the "approve" permission — both approve and reject are review actions.
	 */
	reject: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reviewNotes: z.string().min(1).max(2000),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
			// Reject is part of the review flow — same permission as approve
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "approve");

			try {
				return await rejectRefund(context.tenantDb, input.id, {
					reviewNotes: input.reviewNotes,
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Operation failed" });
			}
		}),

	/**
	 * Mark an approved refund as processed.
	 * Writes back to payments.refundAmount and/or sales_orders.cancelledAmount in one tx.
	 *
	 * IMPORTANT: this does NOT trigger Stripe or any payment gateway.
	 * The operator must manually issue the reversal and record the reference here.
	 */
	process: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				refundMethod: z.enum([
					"cash",
					"card_reversal",
					"bank_transfer",
					"store_credit",
				]),
				refundReference: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "process");

			try {
				return await processRefund(context.tenantDb, input.id, {
					refundMethod: input.refundMethod,
					refundReference: input.refundReference,
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Operation failed" });
			}
		})
};
