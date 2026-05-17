/**
 * Platform Admin — Coupons router (Plan F.3.5 — Agent C2).
 *
 * Stripe-backed coupon catalog + per-tenant attach/remove. No local mirror
 * table — coupons live in Stripe (per ADR-0033 "Stripe live reads").
 *
 * Why a NEW top-level router (NOT under `platformAdminTenants.billing`)?
 *   - `listCoupons` / `createCoupon` / `deleteCoupon` are catalog-scoped,
 *     not tenant-scoped. They don't take an `organizationId`.
 *   - `applyCoupon` / `removeCoupon` / `getCustomerCoupon` do take an org,
 *     but conceptually they are coupon operations that target a tenant,
 *     not billing operations that touch a coupon. Keeping the whole set
 *     under one namespace makes the UI shape easier to reason about.
 *
 * Procedures:
 *   - listCoupons({ limit, startingAfter? })            — platform-admin
 *   - createCoupon(input)                                — super_admin
 *   - deleteCoupon({ couponId })                         — super_admin
 *   - applyCoupon({ organizationId, couponId, notes? })  — super_admin
 *   - removeCoupon({ organizationId })                   — super_admin
 *   - getCustomerCoupon({ organizationId })              — platform-admin
 *
 * Audit actions (NEW strings, no schema change — `adminSessionActions.actionType`
 * is a free-form text column):
 *   - coupon_create
 *   - coupon_delete
 *   - coupon_apply
 *   - coupon_remove
 *
 * Stripe API choice
 *   Coupons are attached to customers via the legacy `coupon` field on
 *   `customers.update({ coupon })`. Stripe 2024+ recommends promotion_codes
 *   for self-serve flows, but the direct-coupon path is still fully
 *   supported and is the right surface for an ops tool where the admin
 *   already knows which coupon to apply. Promotion codes are deferred to
 *   a later plan.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getStripeClient } from "@/lib/stripe";

// ── Stripe surface used by this router (minimal, for testability). ─────────
type StripeCoupon = {
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

type StripeCustomerForCoupon =
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

// ── Auth gates (mirror platform-admin-tenants-billing.ts) ──────────────────
function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<"super_admin" | "support" | "billing">,
) {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
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
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			if (
				allowRoles &&
				!allowRoles.includes(
					adminRecord.role as "super_admin" | "support" | "billing",
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Your platform admin role does not permit this action",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());
const superAdminProcedure = protectedProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id) throw new ORPCError("UNAUTHORIZED", { message: "No admin user in session" });
	return id;
}

async function resolveStripeCustomerId(
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

function projectCoupon(c: StripeCoupon) {
	return {
		id: c.id,
		name: c.name ?? null,
		percentOff:
			typeof c.percent_off === "number" ? c.percent_off : null,
		amountOff:
			typeof c.amount_off === "number" ? c.amount_off : null,
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

// ── Router factory ─────────────────────────────────────────────────────────
export function createPlatformAdminCouponsRouter(
	stripeOverride?: StripeClientLike,
) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

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
				const cpDb = cpDbFrom(context);
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
						currency:
							input.discountKind === "amount" ? input.currency : null,
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
				const cpDb = cpDbFrom(context);
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

		applyCoupon: superAdminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					couponId: z.string().min(1),
					notes: z.string().max(1000).optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = cpDbFrom(context);
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
						message:
							"Tenant has no Stripe customer — cannot attach coupon",
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
				const cpDb = cpDbFrom(context);
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
						message:
							"Tenant has no Stripe customer — nothing to remove",
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
				const cpDb = cpDbFrom(context);
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

export const platformAdminCouponsRouter = createPlatformAdminCouponsRouter();
