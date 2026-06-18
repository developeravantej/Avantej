/**
 * Shared types, helpers, and Stripe surface types for platform-admin-billing
 * procedures. Used by both overview.procedures.ts and invoices.procedures.ts.
 */

import { and, desc, eq, gte, inArray, isNotNull, type SQL } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { user as userTable } from "@avantej-core/db/schema/auth";

// ── Stripe surface (minimal, for testability). ────────────────────────────
type StripeInvoice = {
	id: string;
	number: string | null;
	status: string | null;
	amount_paid: number;
	currency: string;
	created: number;
};

type StripeCoupon = {
	id: string;
	name?: string | null;
	percent_off?: number | null;
	amount_off?: number | null;
	currency?: string | null;
	duration: "once" | "repeating" | "forever";
	times_redeemed?: number;
	valid?: boolean;
	created?: number;
};

export type StripeClientLike = {
	invoices: {
		list: (params: {
			customer: string;
			limit?: number;
			created?: { gte?: number };
		}) => Promise<{ data: StripeInvoice[]; has_more: boolean }>;
	};
	coupons: {
		list: (params: {
			limit?: number;
		}) => Promise<{ data: StripeCoupon[]; has_more: boolean }>;
	};
};

export function projectCoupon(c: StripeCoupon) {
	return {
		id: c.id,
		name: c.name ?? null,
		percentOff: typeof c.percent_off === "number" ? c.percent_off : null,
		amountOff: typeof c.amount_off === "number" ? c.amount_off : null,
		currency: c.currency ? c.currency.toLowerCase() : null,
		duration: c.duration,
		timesRedeemed: Number(c.times_redeemed ?? 0),
		valid: c.valid !== false,
		createdAt: new Date((c.created ?? 0) * 1000),
	};
}

// ── Audit-row → recentRefunds projection helpers ──────────────────────────
type RefundAuditRow = {
	id: string;
	adminUserId: string | null;
	targetOrganizationId: string | null;
	metadata: unknown;
	createdAt: Date;
	orgName: string | null;
	actorEmail: string | null;
};

export function readMetaNumber(meta: unknown, key: string): number {
	if (meta && typeof meta === "object" && !Array.isArray(meta)) {
		const v = (meta as Record<string, unknown>)[key];
		if (typeof v === "number") return v;
		if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
	}
	return 0;
}

export function readMetaString(meta: unknown, key: string): string | null {
	if (meta && typeof meta === "object" && !Array.isArray(meta)) {
		const v = (meta as Record<string, unknown>)[key];
		if (typeof v === "string") return v;
	}
	return null;
}

function projectRefund(r: RefundAuditRow) {
	const meta = r.metadata;
	// Audit metadata may store `amountCents` (when partial), or `refundAmount`
	// (full Stripe-reported amount). Prefer refundAmount; fall back to amountCents.
	const refundAmount = readMetaNumber(meta, "refundAmount");
	const amountCents =
		refundAmount > 0 ? refundAmount : readMetaNumber(meta, "amountCents");
	return {
		refundId: readMetaString(meta, "refundId") ?? r.id,
		orgId: r.targetOrganizationId ?? "",
		orgName: r.orgName ?? "Unknown org",
		amountCents,
		reason: readMetaString(meta, "reason") ?? "requested_by_customer",
		refundedAt: r.createdAt,
		actorEmail: r.actorEmail ?? null,
	};
}

export async function fetchRecentRefunds(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	since: Date | null,
	limit: number,
) {
	const conds: SQL[] = [
		eq(adminSessionActions.actionType, "tenant_invoice_refund"),
	];
	if (since) conds.push(gte(adminSessionActions.createdAt, since));
	const rows = await cpDb
		.select({
			id: adminSessionActions.id,
			adminUserId: adminSessionActions.adminUserId,
			targetOrganizationId: adminSessionActions.targetOrganizationId,
			metadata: adminSessionActions.metadata,
			createdAt: adminSessionActions.createdAt,
			orgName: organizations.name,
			actorEmail: userTable.email,
		})
		.from(adminSessionActions)
		.leftJoin(
			organizations,
			eq(organizations.id, adminSessionActions.targetOrganizationId),
		)
		.leftJoin(userTable, eq(userTable.id, adminSessionActions.adminUserId))
		.where(conds.length === 1 ? conds[0] : and(...conds))
		.orderBy(desc(adminSessionActions.createdAt))
		.limit(limit);
	return rows.map((r) => projectRefund(r as RefundAuditRow));
}

export async function fetchCrossTenantInvoices(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	stripe: StripeClientLike,
	topN: number,
	perCustomerLimit: number,
	daysWindow: number | null,
): Promise<{
	invoices: Array<{
		orgId: string;
		orgName: string;
		invoiceId: string;
		invoiceNumber: string | null;
		amountPaid: number;
		status: string | null;
		currency: string;
		createdAt: Date;
	}>;
	stripeAvailable: boolean;
}> {
	// Join active subs to orgs to get a customerId → {orgId, orgName} map.
	const subOrgRows = await cpDb
		.select({
			orgId: organizations.id,
			orgName: organizations.name,
			stripeCustomerId: subscriptions.stripeCustomerId,
		})
		.from(subscriptions)
		.innerJoin(
			organizations,
			eq(organizations.subscriptionId, subscriptions.id),
		)
		.where(
			and(
				inArray(subscriptions.status, ["active", "trialing"]),
				isNotNull(subscriptions.stripeCustomerId),
			),
		);

	const customerMap = new Map<string, { orgId: string; orgName: string }>();
	for (const r of subOrgRows) {
		if (r.stripeCustomerId) {
			customerMap.set(r.stripeCustomerId, {
				orgId: r.orgId,
				orgName: r.orgName,
			});
		}
	}
	const customerIds = Array.from(customerMap.keys());
	if (customerIds.length === 0) {
		return { invoices: [], stripeAvailable: true };
	}

	const createdFilter =
		daysWindow !== null
			? {
					gte: Math.floor(
						(Date.now() - daysWindow * 24 * 60 * 60 * 1000) / 1000,
					),
				}
			: undefined;

	const results = await Promise.allSettled(
		customerIds.map((cid) =>
			stripe.invoices.list({
				customer: cid,
				limit: perCustomerLimit,
				...(createdFilter ? { created: createdFilter } : {}),
			}),
		),
	);

	let anyFulfilled = false;
	let allRejected = true;
	const flat: Array<{
		orgId: string;
		orgName: string;
		invoiceId: string;
		invoiceNumber: string | null;
		amountPaid: number;
		status: string | null;
		currency: string;
		createdAt: Date;
	}> = [];
	for (let i = 0; i < customerIds.length; i++) {
		const cid = customerIds[i]!;
		const meta = customerMap.get(cid);
		if (!meta) continue;
		const res = results[i];
		if (!res) continue;
		if (res.status === "fulfilled") {
			anyFulfilled = true;
			allRejected = false;
			for (const inv of res.value.data) {
				flat.push({
					orgId: meta.orgId,
					orgName: meta.orgName,
					invoiceId: inv.id,
					invoiceNumber: inv.number,
					amountPaid: Number(inv.amount_paid ?? 0),
					status: inv.status,
					currency: (inv.currency ?? "usd").toLowerCase(),
					createdAt: new Date((inv.created ?? 0) * 1000),
				});
			}
		}
	}

	flat.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return {
		invoices: flat.slice(0, topN),
		// If every customer call rejected, treat Stripe as unavailable.
		stripeAvailable: anyFulfilled || !allRejected,
	};
}

export async function fetchActiveCoupons(
	stripe: StripeClientLike,
	limit: number,
): Promise<{
	coupons: ReturnType<typeof projectCoupon>[];
	stripeAvailable: boolean;
}> {
	try {
		const resp = await stripe.coupons.list({ limit });
		return {
			coupons: resp.data.map(projectCoupon),
			stripeAvailable: true,
		};
	} catch {
		return { coupons: [], stripeAvailable: false };
	}
}
