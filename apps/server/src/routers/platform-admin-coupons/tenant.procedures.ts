/**
 * Tenant-scoped coupon procedures: applyCoupon, removeCoupon, getCustomerCoupon.
 * These target a specific organization (tenant) and attach/remove Stripe
 * coupons from their Stripe customer record.
 */

import { z } from "zod";
import { ORPCError } from "@orpc/server";
import {
	adminProcedure,
	superAdminProcedure,
	adminUserIdFrom,
	resolveStripeCustomerId,
	projectCoupon,
} from "./_shared";
import type { StripeClientLike, StripeCustomerForCoupon } from "./_shared";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export function createTenantProcedures(resolveStripe: () => StripeClientLike) {
	return {
		applyCoupon: superAdminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					couponId: z.string().min(1),
					notes: z.string().max(1000).optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);

				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Tenant has no Stripe customer — cannot attach coupon",
					});
				}

				const stripe = resolveStripe();
				try {
					await stripe.customers.update(customerId, {
						coupon: input.couponId,
					});
				} catch (err) {
					// NO audit row on Stripe failure.
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe coupon apply failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "coupon_apply",
					targetOrganizationId: input.organizationId,
					metadata: {
						couponId: input.couponId,
						stripeCustomerId: customerId,
						notes: input.notes ?? null,
					},
				});

				return {
					ok: true as const,
					couponId: input.couponId,
					customerId,
				};
			}),

		removeCoupon: superAdminProcedure
			.input(z.object({ organizationId: z.string().uuid() }))
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);

				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Tenant has no Stripe customer — nothing to remove",
					});
				}

				const stripe = resolveStripe();
				try {
					await stripe.customers.deleteDiscount(customerId);
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe coupon remove failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "coupon_remove",
					targetOrganizationId: input.organizationId,
					metadata: { stripeCustomerId: customerId },
				});

				return { ok: true as const };
			}),

		getCustomerCoupon: adminProcedure
			.input(z.object({ organizationId: z.string().uuid() }))
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					return {
						coupon: null as ReturnType<typeof projectCoupon> | null,
					};
				}
				const stripe = resolveStripe();
				let cust: StripeCustomerForCoupon;
				try {
					cust = await stripe.customers.retrieve(customerId, {
						expand: ["discount.coupon"],
					});
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe customer retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				if ((cust as { deleted?: true }).deleted) {
					return { coupon: null };
				}
				const c = cust as Exclude<StripeCustomerForCoupon, { deleted: true }>;
				const couponObj = c.discount?.coupon ?? null;
				return {
					coupon: couponObj ? projectCoupon(couponObj) : null,
				};
			}),
	};
}
