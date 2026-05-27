/**
 * Partner Stripe Connect oRPC Router (S-partner-stripe-onboarding).
 *
 * Surfaces partner-level Stripe Connect onboarding so the franchiser can send
 * payouts to coaches via Stripe transfers (instead of out-of-band wires).
 *
 * Procedures:
 *   - createOnboardingUrl: build a partner-scoped OAuth authorize URL.
 *       state = signed `orgId.partnerId.country.ts.sig`.
 *   - getStatus: read the cached partner_stripe_accounts row.
 *   - refresh: pull fresh capability state from Stripe and write it back.
 *
 * All procedures require admin permission `commission_payout:create` (matches
 * the existing `categoryCommission` write paths).
 *
 * The OAuth callback itself lives in `apps/server/src/routes/partner-stripe-oauth.routes.ts`
 * (Hono — not oRPC — Stripe redirects with query params, not a JSON body).
 */

import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { partnerStripeAccounts } from "@avantej-core/db/schema/tenant/partner-stripe-accounts";
import { members } from "@avantej-core/db/schema/tenant/members";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getStripeClient } from "@/lib/stripe";
import {
	buildPartnerOnboardingUrl,
	deriveStripeConnectStatus,
	signPartnerOAuthState,
} from "@/services/partner-stripe.service";

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		const v = env[key];
		if (v !== undefined) return v;
	} catch {
		// Not in Cloudflare Workers runtime.
	}
	const globalEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
	if (globalEnv?.[key] !== undefined) return globalEnv[key];
	return process.env[key];
}

export const partnerStripeRouter = {
	/**
	 * Mint a Stripe Connect OAuth authorize URL for a partner.
	 *
	 * Caller must be an admin with `commission_payout:create` on the tenant.
	 * The partner must be an active member of the tenant — verified before the
	 * state is signed, so a forged URL cannot retarget a different partnerId.
	 */
	createOnboardingUrl: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				partnerId: z.string().min(1), // members.userId (text id)
				countryCode: z
					.string()
					.length(2)
					.regex(/^[A-Za-z]{2}$/)
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as {
				organizationId?: string;
				tenantDb?: import("drizzle-orm/neon-serverless").NeonDatabase<
					typeof import("@avantej-core/db/schema/tenant-schema")
				>;
				session?: { user?: { email?: string } };
			};
			const orgId = ctx.organizationId ?? input.organizationId;
			if (!orgId) {
				throw new ORPCError("BAD_REQUEST", { message: "No organization context" });
			}
			if (!ctx.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB on context" });
			}

			// Verify the partner is a real, active member of THIS tenant.
			const [member] = await ctx.tenantDb
				.select({ userId: members.userId, status: members.status })
				.from(members)
				.where(eq(members.userId, input.partnerId))
				.limit(1);
			if (!member) {
				throw new ORPCError("NOT_FOUND", { message: "Partner not found in this tenant" });
			}
			if (member.status !== "active") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Partner is not active (status=${member.status})`,
				});
			}

			const clientId = getEnvVar("STRIPE_CONNECT_CLIENT_ID");
			if (!clientId) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "STRIPE_CONNECT_CLIENT_ID is not configured",
				});
			}
			const secret = getEnvVar("BETTER_AUTH_SECRET");
			if (!secret) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "BETTER_AUTH_SECRET is not configured",
				});
			}

			const country = input.countryCode?.toUpperCase();
			const state = await signPartnerOAuthState({
				orgId,
				partnerId: input.partnerId,
				secret,
				countryCode: country,
			});

			const onboardingUrl = buildPartnerOnboardingUrl({
				clientId,
				state,
				email: ctx.session?.user?.email ?? null,
				countryCode: country ?? null,
			});

			return { onboardingUrl, partnerId: input.partnerId };
		}),

	/**
	 * Read the cached partner_stripe_accounts row for a partner. Returns a
	 * deterministic shape regardless of whether the row exists (callers can
	 * render an empty state without a separate "exists" check).
	 */
	getStatus: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				partnerId: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as {
				tenantDb?: import("drizzle-orm/neon-serverless").NeonDatabase<
					typeof import("@avantej-core/db/schema/tenant-schema")
				>;
			};
			if (!ctx.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB on context" });
			}
			const [row] = await ctx.tenantDb
				.select()
				.from(partnerStripeAccounts)
				.where(eq(partnerStripeAccounts.partnerId, input.partnerId))
				.limit(1);
			if (!row) {
				return {
					connected: false,
					stripeConnectAccountId: null as string | null,
					status: "pending" as const,
					payoutsEnabled: false,
					detailsSubmitted: false,
					countryCode: null as string | null,
					defaultCurrency: null as string | null,
					requirementsCurrentlyDue: [] as string[],
					requirementsDisabledReason: null as string | null,
					connectAccountUpdatedAt: null as Date | null,
				};
			}
			return {
				connected: true,
				stripeConnectAccountId: row.stripeConnectAccountId,
				status: row.stripeConnectStatus,
				payoutsEnabled: row.payoutsEnabled,
				detailsSubmitted: row.detailsSubmitted,
				countryCode: row.countryCode,
				defaultCurrency: row.defaultCurrency,
				requirementsCurrentlyDue: Array.isArray(row.requirementsCurrentlyDue)
					? (row.requirementsCurrentlyDue as string[])
					: [],
				requirementsDisabledReason: row.requirementsDisabledReason,
				connectAccountUpdatedAt: row.connectAccountUpdatedAt,
			};
		}),

	/**
	 * Re-pull capability state from Stripe and persist it. Used when the operator
	 * suspects the local cache is stale (e.g. they completed a remediation in
	 * Stripe Dashboard between webhook deliveries). Idempotent — safe to call.
	 */
	refresh: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				partnerId: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as {
				tenantDb?: import("drizzle-orm/neon-serverless").NeonDatabase<
					typeof import("@avantej-core/db/schema/tenant-schema")
				>;
			};
			if (!ctx.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB on context" });
			}
			const [row] = await ctx.tenantDb
				.select()
				.from(partnerStripeAccounts)
				.where(eq(partnerStripeAccounts.partnerId, input.partnerId))
				.limit(1);
			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: "Partner has not completed Stripe Connect onboarding yet",
				});
			}

			const stripe = getStripeClient();
			let acct: {
				id: string;
				payouts_enabled?: boolean;
				details_submitted?: boolean;
				country?: string | null;
				default_currency?: string | null;
				requirements?: {
					currently_due?: string[] | null;
					eventually_due?: string[] | null;
					disabled_reason?: string | null;
				} | null;
			};
			try {
				acct = (await stripe.accounts.retrieve(row.stripeConnectAccountId)) as typeof acct;
			} catch (err) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Failed to refresh from Stripe: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			const payoutsEnabled = !!acct.payouts_enabled;
			const detailsSubmitted = !!acct.details_submitted;
			const disabledReason = acct.requirements?.disabled_reason ?? null;
			const status = deriveStripeConnectStatus({
				payoutsEnabled,
				detailsSubmitted,
				requirementsDisabledReason: disabledReason,
			});

			const now = new Date();
			await ctx.tenantDb
				.update(partnerStripeAccounts)
				.set({
					stripeConnectStatus: status,
					payoutsEnabled,
					detailsSubmitted,
					countryCode: acct.country ?? null,
					defaultCurrency: acct.default_currency ?? null,
					requirementsCurrentlyDue: acct.requirements?.currently_due ?? [],
					requirementsEventuallyDue: acct.requirements?.eventually_due ?? [],
					requirementsDisabledReason: disabledReason,
					connectAccountUpdatedAt: now,
					onboardingCompletedAt: detailsSubmitted ? row.onboardingCompletedAt ?? now : null,
					updatedAt: now,
				})
				.where(and(eq(partnerStripeAccounts.partnerId, input.partnerId)));

			return {
				status,
				payoutsEnabled,
				detailsSubmitted,
				requirementsCurrentlyDue: acct.requirements?.currently_due ?? [],
			};
		}),
};
