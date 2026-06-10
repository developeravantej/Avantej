/**
 * Catalog-scoped coupon procedures: listCoupons, createCoupon, deleteCoupon.
 * These are not tenant-scoped — they operate on the Stripe coupon catalog
 * directly.
 */

import { z } from "zod";
import { ORPCError } from "@orpc/server";
import {
	adminProcedure,
	superAdminProcedure,
	adminUserIdFrom,
	projectCoupon,
} from "./_shared";
import type { StripeCoupon, StripeClientLike } from "./_shared";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export function createCatalogProcedures(resolveStripe: () => StripeClientLike) {
	return {
		listCoupons: adminProcedure
			.input(
				z.object({
					limit: z.number().int().min(1).max(100).default(50),
					startingAfter: z.string().optional(),
				}),
			)
			.handler(async ({ input }) => {
				const stripe = resolveStripe();
				let resp: { data: StripeCoupon[]; has_more: boolean };
				try {
					resp = await stripe.coupons.list({
						limit: input.limit,
						starting_after: input.startingAfter,
					});
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe coupons list failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				const coupons = resp.data.map(projectCoupon);
				const last = coupons[coupons.length - 1];
				return {
					coupons,
					hasMore: Boolean(resp.has_more),
					nextCursor: resp.has_more && last ? last.id : undefined,
				};
			}),

		createCoupon: superAdminProcedure
			.input(
				z
					.object({
						name: z.string().min(1).max(100),
						discountKind: z.enum(["percent", "amount"]),
						percentOff: z.number().min(1).max(100).optional(),
						amountOffCents: z.number().int().min(1).optional(),
						currency: z.string().length(3).default("usd"),
						duration: z.enum(["once", "repeating", "forever"]),
						durationInMonths: z.number().int().min(1).max(60).optional(),
						maxRedemptions: z.number().int().min(1).optional(),
					})
					.refine(
						(d) =>
							d.discountKind === "percent"
								? d.percentOff !== undefined
								: d.amountOffCents !== undefined,
						{ message: "percentOff or amountOffCents required" },
					)
					.refine(
						(d) =>
							d.duration !== "repeating" || d.durationInMonths !== undefined,
						{ message: "durationInMonths required for duration=repeating" },
					),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);
				const stripe = resolveStripe();

				// Build Stripe params — only forward fields relevant to the
				// chosen discount kind / duration. Stripe rejects mismatches.
				const params: Parameters<StripeClientLike["coupons"]["create"]>[0] = {
					name: input.name,
					duration: input.duration,
				};
				if (input.discountKind === "percent") {
					params.percent_off = input.percentOff;
				} else {
					params.amount_off = input.amountOffCents;
					params.currency = input.currency;
				}
				if (input.duration === "repeating") {
					params.duration_in_months = input.durationInMonths;
				}
				if (input.maxRedemptions !== undefined) {
					params.max_redemptions = input.maxRedemptions;
				}

				let coupon: StripeCoupon;
				try {
					coupon = await stripe.coupons.create(params);
				} catch (err) {
					// NO audit row on Stripe failure.
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe coupon create failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "coupon_create",
					metadata: {
						couponId: coupon.id,
						name: input.name,
						discountKind: input.discountKind,
						percentOff: input.percentOff ?? null,
						amountOffCents: input.amountOffCents ?? null,
						currency: input.discountKind === "amount" ? input.currency : null,
						duration: input.duration,
						durationInMonths: input.durationInMonths ?? null,
						maxRedemptions: input.maxRedemptions ?? null,
					},
				});

				return {
					couponId: coupon.id,
					name: coupon.name ?? input.name,
					valid: coupon.valid !== false,
				};
			}),

		deleteCoupon: superAdminProcedure
			.input(z.object({ couponId: z.string().min(1) }))
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);
				const stripe = resolveStripe();

				try {
					await stripe.coupons.del(input.couponId);
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe coupon delete failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "coupon_delete",
					metadata: { couponId: input.couponId },
				});

				return { ok: true as const };
			}),
	};
}
