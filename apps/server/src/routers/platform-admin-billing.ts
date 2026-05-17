/**
 * Platform Admin — Global Billing aggregator (Plan F.3.5 — Agent G).
 *
 * Cross-tenant billing overview surface for /dashboard/platform-admin/billing.
 * Read-only. Live Stripe reads (per ADR-0033 — no local mirror table yet).
 *
 * Procedures:
 *   - getOverview()                 — single aggregator: KPIs + recent invoices
 *                                     across all tenants + recent refunds + top
 *                                     active coupons. Read-allowed for any
 *                                     platform-admin role.
 *   - listInvoicesCrossTenant(input)
 *                                   — explicit detailed cross-tenant invoice
 *                                     listing with limit + days window.
 *
 * Sources:
 *   - KPIs:
 *       activeSubsCount + MRR  — `subscriptions` rows with status in
 *                                ('active','trialing'), priced via
 *                                `getTierPriceUsdCents` (mirrors revenue router).
 *       refundsLast30d         — audit rows where `actionType =
 *                                'tenant_invoice_refund'` (Agent I writes them).
 *       couponsCount           — Stripe `coupons.list` (live; tolerant of a
 *                                missing Stripe key in CI).
 *   - recentInvoices: distinct customers from `subscriptions`, fanned out via
 *     `Promise.allSettled(stripe.invoices.list({ customer, limit: 5 }))`,
 *     joined back to org names, sorted by createdAt DESC, top 20.
 *   - recentRefunds: `admin_session_actions` JOIN `organizations` JOIN `user`
 *     (Better-Auth) for actor email. Top 20, DESC by `created_at`.
 *   - activeCoupons: pass-through `stripe.coupons.list({ limit: 20 })`,
 *     tolerant.
 *
 * Latency caveat
 *   Cross-tenant invoice fetch is O(N) parallel Stripe API calls where N =
 *   distinct active customers. In dev with ~10 tenants, sub-second. At >50
 *   tenants, this becomes the slowest part of the page. ADR-0033 condition
 *   #2 triggers a future mirror table — leave a TODO when traffic warrants.
 *
 * Stripe key absent in CI: every Stripe call is wrapped — failures degrade
 * to empty arrays + a `stripeAvailable` flag on the response, never throw.
 */

import { z } from "zod";
import {
	and,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	type SQL,
} from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getStripeClient } from "@/lib/stripe";
import { getTierPriceUsdCents, type Tier } from "@avantej-core/types";

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

// ── Auth gate — mirrors revenue router (any platform-admin role). ─────────
function requirePlatformAdmin() {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await cpDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", {
					message: "Admin access required",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

function cpDbFrom(
	context: unknown,
): NeonDatabase<typeof controlPanelSchema> {
	const db = (
		context as { honoContext?: { get: (k: string) => unknown } }
	).honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function projectCoupon(c: StripeCoupon) {
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

function readMetaNumber(meta: unknown, key: string): number {
	if (meta && typeof meta === "object" && !Array.isArray(meta)) {
		const v = (meta as Record<string, unknown>)[key];
		if (typeof v === "number") return v;
		if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
	}
	return 0;
}

function readMetaString(meta: unknown, key: string): string | null {
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

// ── Router factory ────────────────────────────────────────────────────────
export function createPlatformAdminBillingRouter(
	stripeOverride?: StripeClientLike,
) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	async function fetchRecentRefunds(
		cpDb: NeonDatabase<typeof controlPanelSchema>,
		since: Date | null,
		limit: number,
	) {
		const conds: SQL[] = [
			eq(adminSessionActions.actionType, "tenant_invoice_refund"),
		];
		if (since)
			conds.push(gte(adminSessionActions.createdAt, since));
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

	async function fetchCrossTenantInvoices(
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

	async function fetchActiveCoupons(
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

	return {
		getOverview: adminProcedure
			.input(z.object({}).default({}))
			.handler(async ({ context }) => {
				const cpDb = cpDbFrom(context);
				const stripe = resolveStripe();
				const thirtyDaysAgo = new Date(
					Date.now() - 30 * 24 * 60 * 60 * 1000,
				);

				const [
					activeTrialingRows,
					refundRowsAll30d,
					recentRefunds,
					invoicesResult,
					couponsResult,
				] = await Promise.all([
					cpDb
						.select({
							tier: subscriptions.tier,
							status: subscriptions.status,
						})
						.from(subscriptions)
						.where(inArray(subscriptions.status, ["active", "trialing"])),
					// For KPI math we need ALL refunds in last 30d (count + total).
					cpDb
						.select({
							id: adminSessionActions.id,
							metadata: adminSessionActions.metadata,
						})
						.from(adminSessionActions)
						.where(
							and(
								eq(adminSessionActions.actionType, "tenant_invoice_refund"),
								gte(adminSessionActions.createdAt, thirtyDaysAgo),
							),
						),
					// For UI list — top 20, joined to org + actor.
					fetchRecentRefunds(cpDb, null, 20),
					fetchCrossTenantInvoices(cpDb, stripe, 20, 5, null),
					fetchActiveCoupons(stripe, 20),
				]);

				let activeSubsCount = 0;
				let mrrCents = 0;
				for (const r of activeTrialingRows) {
					if (r.status === "active") activeSubsCount += 1;
					mrrCents += getTierPriceUsdCents(r.tier as Tier);
				}

				const refundsLast30dCount = refundRowsAll30d.length;
				let refundsLast30dAmountCents = 0;
				for (const row of refundRowsAll30d) {
					const refundAmount = readMetaNumber(row.metadata, "refundAmount");
					refundsLast30dAmountCents +=
						refundAmount > 0
							? refundAmount
							: readMetaNumber(row.metadata, "amountCents");
				}

				return {
					kpis: {
						activeSubsCount,
						mrr: { cents: mrrCents, estimateAvailable: true },
						refundsLast30dCount,
						refundsLast30dAmountCents,
						couponsCount: couponsResult.coupons.length,
					},
					recentInvoices: invoicesResult.invoices,
					recentRefunds,
					activeCoupons: couponsResult.coupons,
					stripeAvailable:
						invoicesResult.stripeAvailable && couponsResult.stripeAvailable,
				};
			}),

		listInvoicesCrossTenant: adminProcedure
			.input(
				z.object({
					limit: z.number().int().min(1).max(100).default(50),
					days: z.number().int().min(7).max(180).default(30),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = cpDbFrom(context);
				const stripe = resolveStripe();
				const result = await fetchCrossTenantInvoices(
					cpDb,
					stripe,
					input.limit,
					Math.max(5, Math.ceil(input.limit / 4)),
					input.days,
				);
				return {
					invoices: result.invoices,
					stripeAvailable: result.stripeAvailable,
				};
			}),
	};
}

export const platformAdminBillingRouter = createPlatformAdminBillingRouter();
