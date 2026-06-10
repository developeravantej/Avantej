/**
 * Shared types, helpers, and auth gates for the
 * platform-admin-tenants-billing folder module.
 */

import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

// ── Stripe surface used by this router. Kept minimal for testability. ──────
export type StripeInvoice = {
	id: string;
	number: string | null;
	status: string | null;
	amount_paid: number;
	amount_due: number;
	amount_remaining?: number;
	currency: string;
	created: number;
	hosted_invoice_url: string | null;
	invoice_pdf: string | null;
	payment_intent: string | { id: string } | null;
	charge:
		| string
		| {
				id: string;
				refunded: boolean;
				amount_refunded: number;
		  }
		| null;
	lines?: {
		data: Array<{
			id: string;
			description: string | null;
			amount: number;
			currency: string;
			quantity: number | null;
		}>;
	};
};

export type StripePaymentMethod = {
	id: string;
	card?: { brand: string; last4: string } | null;
};

export type StripeCustomer =
	| {
			id: string;
			balance?: number;
			currency?: string | null;
			invoice_settings?: {
				default_payment_method?: string | StripePaymentMethod | null;
			} | null;
			default_source?: string | null;
	  }
	| {
			deleted: true;
			id: string;
	  };

export type StripeRefund = {
	id: string;
	status: string | null;
	amount: number;
};

// Stripe Subscription Item — minimal shape needed for tier swap.
export type StripeSubscriptionItem = {
	id: string;
	price?: { id: string } | null;
};

export type StripeSubscription = {
	id: string;
	items: { data: StripeSubscriptionItem[] };
};

export type StripeUpcomingInvoice = {
	id?: string | null;
	amount_due?: number;
	total?: number;
	currency?: string;
};

export type StripeClientLike = {
	invoices: {
		list: (params: {
			customer: string;
			limit?: number;
			starting_after?: string;
			expand?: string[];
		}) => Promise<{ data: StripeInvoice[]; has_more: boolean }>;
		retrieve: (
			id: string,
			params?: { expand?: string[] },
		) => Promise<StripeInvoice>;
		// Stripe SDK 19+: `createPreview` replaces `retrieveUpcoming`. Best-effort
		// — wrapped in try/catch so a missing/failed preview never blocks a swap.
		createPreview?: (params: {
			subscription?: string;
			customer?: string;
		}) => Promise<StripeUpcomingInvoice>;
	};
	refunds: {
		create: (params: {
			payment_intent: string;
			amount?: number;
			reason?: string;
		}) => Promise<StripeRefund>;
	};
	customers: {
		retrieve: (
			id: string,
			params?: { expand?: string[] },
		) => Promise<StripeCustomer>;
	};
	subscriptions: {
		retrieve: (id: string) => Promise<StripeSubscription>;
		update: (
			id: string,
			params: {
				items: Array<{ id: string; price: string }>;
				proration_behavior?: "create_prorations" | "none" | "always_invoice";
			},
		) => Promise<StripeSubscription>;
	};
};

// ── Auth gates ──────────────────────────────────────────────────────────────
export const superAdminProcedure = adminProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

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

export function normalizeChargeRefund(charge: StripeInvoice["charge"]): {
	refunded: boolean;
	refundedAmount: number;
} {
	if (!charge || typeof charge === "string") {
		return { refunded: false, refundedAmount: 0 };
	}
	return {
		refunded: Boolean(charge.refunded),
		refundedAmount: Number(charge.amount_refunded ?? 0),
	};
}

export function normalizePaymentIntentId(
	pi: StripeInvoice["payment_intent"],
): string | null {
	if (!pi) return null;
	if (typeof pi === "string") return pi;
	return pi.id ?? null;
}

export function projectInvoice(inv: StripeInvoice) {
	const { refunded, refundedAmount } = normalizeChargeRefund(inv.charge);
	return {
		id: inv.id,
		number: inv.number,
		status: inv.status,
		amountPaid: Number(inv.amount_paid ?? 0),
		amountDue: Number(inv.amount_due ?? 0),
		currency: (inv.currency ?? "usd").toLowerCase(),
		createdAt: new Date((inv.created ?? 0) * 1000),
		hostedInvoiceUrl: inv.hosted_invoice_url,
		invoicePdf: inv.invoice_pdf,
		paymentIntent: normalizePaymentIntentId(inv.payment_intent),
		refunded,
		refundedAmount,
	};
}
