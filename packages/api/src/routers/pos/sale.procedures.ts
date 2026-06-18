/**
 * POS Router — sale procedures
 *
 * - recordSale: atomic single-tx sale creation (requires pos:create)
 */

import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	guardInputBranchForContext,
	requirePermissionOrpc,
} from "../../guards";
import { recordPosSale } from "@avantej-core/services/pos.service";
import { getControlPanelDb } from "../../lib/context-helpers";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { posLineItemSchema } from "./_shared";

export const posSaleProcedures = {
	/**
	 * Record an in-store POS sale atomically.
	 *
	 * Performs a branch-scope check at the router level (FORBIDDEN if branchId
	 * is not in caller's accessibleNodeIds), then delegates to recordPosSale.
	 */
	recordSale: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				// Customer
				customerType: z.enum(["member", "walk_in"]),
				customerId: z.string().min(1),
				customerName: z.string().min(1),
				branchId: z.string().uuid(),
				// Items
				items: z.array(posLineItemSchema).min(1),
				// Promo
				promotionCode: z.string().optional(),
				// Credit-point redemption (F-CRM-02). Non-negative integer; applied as a
				// discount at 1 point = 1 cent, capped at the post-promo subtotal. Members only.
				creditPointsToRedeem: z.number().int().min(0).optional(),
				// Tax
				taxRateId: z.string().uuid().optional(),
				// Payment
				paymentMethod: z
					.enum([
						"cash",
						"card",
						"manual_transfer",
						"bank_transfer",
						"fpx",
						"stripe",
						"online",
					])
					.transform(
						(v): "manual_transfer" | "cash" | "card" | "fpx" | "stripe" =>
							v === "bank_transfer"
								? "manual_transfer"
								: v === "online"
									? "stripe"
									: (v as
											| "manual_transfer"
											| "cash"
											| "card"
											| "fpx"
											| "stripe"),
					),
				paymentReference: z.string().optional(),
				amountTenderedCents: z.number().int().min(0).optional(),
				// Installment
				installmentPlanCode: z.string().optional(),
				// Notes
				notes: z.string().optional(),
				// Package: preferred trainer (optional, written to package_instances.preferred_trainer_id)
				preferredTrainerId: z.string().uuid().optional(),
				// Commission: per-item trainer assignments
				itemTrainerAssignments: z
					.record(
						z.string(),
						z.array(
							z.object({
								staffId: z.string().uuid(),
								slotIndex: z.number().int().min(0),
							}),
						),
					)
					.optional(),
				// Phase 3 — origination attribution (optional).
				// soldBy: cross-DB userId of the closer who converted the deal.
				// leadSourceUserId: cross-DB userId of the referrer / lead source.
				// These are Better-Auth user IDs (text, NOT uuid — see auth.user.id and
				// sales_orders.sold_by/lead_source_user_id text columns). The form
				// auto-defaults soldBy to the logged-in user, so a .uuid() constraint
				// here rejects every attributed sale with "Input validation failed".
				soldBy: z.string().min(1).optional(),
				leadSourceUserId: z.string().min(1).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			// Permission check: pos:create
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"pos",
				"create",
			);

			// Branch scope check (router-layer per plan §4.1 point 3)
			await guardInputBranchForContext(context, input.branchId);

			// SP-01: Reject stripe payment if the org has no active Stripe account configured
			if (input.paymentMethod === "stripe") {
				const controlPanelDb = getControlPanelDb(context);
				const [stripeAccount] = await controlPanelDb
					.select({ id: orgCountryStripeAccounts.id })
					.from(orgCountryStripeAccounts)
					.where(
						and(
							eq(orgCountryStripeAccounts.organizationId, input.organizationId),
							eq(orgCountryStripeAccounts.chargesEnabled, true),
						),
					)
					.limit(1);
				if (!stripeAccount) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Stripe is not configured for this organisation. Use a different payment method.",
					});
				}
			}

			try {
				return await recordPosSale(context.tenantDb, {
					customerType: input.customerType,
					customerId: input.customerId,
					customerName: input.customerName,
					branchId: input.branchId,
					items: input.items,
					promotionCode: input.promotionCode,
					creditPointsToRedeem: input.creditPointsToRedeem,
					taxRateId: input.taxRateId,
					paymentMethod: input.paymentMethod,
					paymentReference: input.paymentReference,
					amountTenderedCents: input.amountTenderedCents,
					installmentPlanCode: input.installmentPlanCode,
					notes: input.notes,
					preferredTrainerId: input.preferredTrainerId,
					itemTrainerAssignments: input.itemTrainerAssignments
						? Object.fromEntries(
								Object.entries(input.itemTrainerAssignments).map(([k, v]) => [
									parseInt(k, 10),
									v,
								]),
							)
						: undefined,
					// Phase 3 — origination attribution
					soldBy: input.soldBy,
					leadSourceUserId: input.leadSourceUserId,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				// SP-04: remap service-layer NO_TAX_RATE sentinel to a client-visible BAD_REQUEST
				if (err instanceof Error && err.message.startsWith("NO_TAX_RATE:")) {
					throw new ORPCError("BAD_REQUEST", {
						message: "No active tax rate is configured for this organisation.",
					});
				}
				throw err;
			}
		}),
};
