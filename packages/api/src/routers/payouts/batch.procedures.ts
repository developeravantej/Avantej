/**
 * Payouts Router
 *
 * API endpoint for listing payouts with recipient enrichment from control panel.
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import {
	previewBatch,
	processCommissionReversals,
	processForRecipient,
	runBatch,
} from "@avantej-core/services/payouts.service";
import { getControlPanelDb } from "../../lib/context-helpers";

export const payoutsBatchProcedures = {
	/**
	 * Preview a payout batch: returns the set of approved splits that would be
	 * paid for the given staff members in the given date range. No writes.
	 *
	 * Perm: commission_payout:read
	 */
	previewBatch: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				staffIds: z.array(z.string()).min(1).max(50),
				periodStart: z.coerce.date(),
				periodEnd: z.coerce.date(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "read");

			const controlPanelDb = getControlPanelDb(context);

			return previewBatch(context.tenantDb, controlPanelDb, {
				staffIds: input.staffIds,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
				branchId: input.branchId,
			});
		}),

	/**
	 * Execute a payout batch: one transaction that locks approved splits, inserts
	 * a payout row per staff member, and marks splits as paid.
	 *
	 * Perm: commission_payout:process
	 */
	runBatch: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				staffIds: z.array(z.string()).min(1).max(50),
				periodStart: z.coerce.date(),
				periodEnd: z.coerce.date(),
				paymentMethod: z.enum(["bank_transfer", "cash", "check", "other", "stripe_connect"]),
				reference: z.string().max(200).optional(),
				// Optional branch anchor for the payout batch row. When provided
				// the caller must have RBAC access to the branch. When omitted
				// the batch is created with branchId=NULL (cross-branch).
				branchId: z.string().uuid().optional(),
				// S-payouts-state-machine: when false, payouts enter at status='pending'
				// and linked splits stay at status='approved' until `markPaid` settles
				// the row. Defaults to true for backward compat with existing callers.
				confirmImmediately: z.boolean().optional(),
			}),
		)
		.handler(async ({ input, context }) => {



		assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process");

			await processCommissionReversals(context.tenantDb, {
				userId: context.member.userId,
				memberId: context.member.id,
			});

			try {
				return await runBatch(context.tenantDb, {
					staffIds: input.staffIds,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
					paymentMethod: input.paymentMethod,
					reference: input.reference,
					paidByUserId: context.member.userId,
					branchId: input.branchId ?? null,
					confirmImmediately: input.confirmImmediately,
				});
			} catch (err) {
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "EMPTY_BATCH") {
						throw new ORPCError("BAD_REQUEST", {
							message: "No approved splits in range",
						});
					}
					if (code === "CONFLICT") {
						throw new ORPCError("CONFLICT", {
							message: err.message,
						});
					}
				}
				throw err;
			}
		}),

	/**
	 * Process a payout batch for a single recipient.
	 *
	 * Thin wrapper over runBatch. periodStart defaults to 1st of current month,
	 * periodEnd defaults to now.
	 *
	 * Perm: commission_payout:process
	 */
	processForRecipient: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				recipientId: z.string(),
				paymentMethod: z.enum(["bank_transfer", "cash", "check", "other", "stripe_connect"]),
				reference: z.string().max(200).optional(),
				periodStart: z.coerce.date().optional(),
				periodEnd: z.coerce.date().optional(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {



		assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "process")

			try {
				return await processForRecipient(context.tenantDb, {
					recipientId: input.recipientId,
					paymentMethod: input.paymentMethod,
					reference: input.reference,
					paidByUserId: context.member.userId,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
					branchId: input.branchId ?? null,
				});
			} catch (err) {
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "EMPTY_BATCH") {
						throw new ORPCError("BAD_REQUEST", { message: "No approved splits in range" });
					}
					if (code === "CONFLICT") {
						throw new ORPCError("CONFLICT", { message: err.message });
					}
				}
				throw err;
			}
		}),

	// ----------------------------------------------------------------------
	// State machine — individual payout row transitions
	// (S-payouts-state-machine). Admin-only via commission_payout:process.
	// Service helpers carry FOR UPDATE locks for concurrency.
	// ----------------------------------------------------------------------
};
