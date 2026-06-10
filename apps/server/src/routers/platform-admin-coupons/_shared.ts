/**
 * Shared types, helpers, and procedure bases for the platform-admin-coupons
 * router. Used by both catalog.procedures.ts and tenant.procedures.ts.
 */

import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

// ── Stripe surface used by this router (minimal, for testability). ─────────
export type StripeCoupon = {
	id: string;
	name?: string | null;
	percent_off?: number | null;
	amount_off?: number | null;
	currency?: string | null;
	duration: "once" | "repeating" | "forever";
	duration_in_months?: number | null;
	max_redemptions?: number | null;
	times_redeemed?: number;
	valid?: boolean;
	created?: number;
};

export type StripeCustomerForCoupon =
	| {
			id: string;
			discount?: {
				coupon?: StripeCoupon | null;
			} | null;
	  }
	| { deleted: true; id: string };

export type StripeClientLike = {
	coupons: {
		list: (params: {
			limit?: number;
			starting_after?: string;
		}) => Promise<{ data: StripeCoupon[]; has_more: boolean }>;
		create: (params: {
			name?: string;
			percent_off?: number;
			amount_off?: number;
			currency?: string;
			duration: "once" | "repeating" | "forever";
			duration_in_months?: number;
			max_redemptions?: number;
		}) => Promise<StripeCoupon>;
		del: (id: string) => Promise<{ id: string; deleted: boolean }>;
		retrieve: (id: string) => Promise<StripeCoupon>;
	};
	customers: {
		retrieve: (
			id: string,
			params?: { expand?: string[] },
		) => Promise<StripeCustomerForCoupon>;
		update: (
			id: string,
			params: { coupon?: string | null },
		) => Promise<StripeCustomerForCoupon>;
		deleteDiscount: (id: string) => Promise<{ deleted: boolean }>;
	};
};

export const superAdminProcedure = protectedProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

export { adminProcedure };

export function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id)
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	return id;
}

export async function resolveStripeCustomerId(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
): Promise<{ customerId: string | null; orgFound: boolean }> {
	const [org] = await cpDb
		.select({
			id: organizations.id,
			subscriptionId: organizations.subscriptionId,
		})
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);
	if (!org) return { customerId: null, orgFound: false };
	if (!org.subscriptionId) return { customerId: null, orgFound: true };
	const [sub] = await cpDb
		.select({ stripeCustomerId: subscriptions.stripeCustomerId })
		.from(subscriptions)
		.where(eq(subscriptions.id, org.subscriptionId))
		.limit(1);
	return { customerId: sub?.stripeCustomerId ?? null, orgFound: true };
}

export function projectCoupon(c: StripeCoupon) {
	return {
		id: c.id,
		name: c.name ?? null,
		percentOff: typeof c.percent_off === "number" ? c.percent_off : null,
		amountOff: typeof c.amount_off === "number" ? c.amount_off : null,
		currency: c.currency ? c.currency.toLowerCase() : null,
		duration: c.duration,
		durationInMonths:
			typeof c.duration_in_months === "number" ? c.duration_in_months : null,
		maxRedemptions:
			typeof c.max_redemptions === "number" ? c.max_redemptions : null,
		timesRedeemed: Number(c.times_redeemed ?? 0),
		valid: c.valid !== false,
		createdAt: new Date((c.created ?? 0) * 1000),
	};
}
