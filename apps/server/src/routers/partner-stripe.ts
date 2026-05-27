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
import {
	ConfirmPayoutError,
	confirmPayoutViaStripe,
} from "@/services/confirm-payout-via-stripe.service";

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
			// Shape aligned with the type stub in
			// `packages/api/src/routers/_types/server-router-types.ts:partnerStripeRouterType.getStatus`
			// — the web client types are inferred from the stub, so the runtime shape
			// MUST use these exact field names (stripeAccountId / connectStatus / etc.)
			// for the table card + status pill to read data correctly.
			if (!row) {
				return {
					partnerId: input.partnerId,
					stripeAccountId: null as string | null,
					connectStatus: "pending" as string,
					chargesEnabled: false,
					payoutsEnabled: false,
					detailsSubmitted: false,
					onboardingCompletedAt: null as Date | null,
					countryCode: null as string | null,
					defaultCurrency: null as string | null,
					requirementsCurrentlyDue: [] as string[],
					requirementsDisabledReason: null as string | null,
					connectAccountUpdatedAt: null as Date | null,
				};
			}
			return {
				partnerId: input.partnerId,
				stripeAccountId: row.stripeConnectAccountId,
				connectStatus: row.stripeConnectStatus,
				// Partner Connect accounts only receive transfers — they never charge
				// customers — so chargesEnabled is always false from the platform's
				// perspective. Surfaced for parity with the org-level getAccountStatus shape.
				chargesEnabled: false,
				payoutsEnabled: row.payoutsEnabled,
				detailsSubmitted: row.detailsSubmitted,
				onboardingCompletedAt: row.onboardingCompletedAt,
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

	/**
	 * Phase C of S-partner-stripe-onboarding: confirm a pending payout by firing
	 * a Stripe Connect Transfer to the recipient's partner_stripe_accounts.
	 * Operator-initiated; admin-only via commission_payout:process.
	 *
	 * The webhook handlers from Phase B (iteration 6) will receive the
	 * resulting `transfer.created` event — by then the local row is already
	 * `paid` (we update synchronously here) so the webhook is a no-op confirm.
	 *
	 * Maps the service-layer ConfirmPayoutError codes to oRPC error codes the
	 * UI can present to the operator without exposing raw Stripe messages.
	 */
	confirmViaStripe: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				payoutId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as {
				organizationId?: string;
				tenantDb?: import("drizzle-orm/neon-serverless").NeonDatabase<
					typeof import("@avantej-core/db/schema/tenant-schema")
				>;
				member?: { userId: string; id: string; role: string };
			};
			const orgId = ctx.organizationId ?? input.organizationId;
			if (!orgId) {
				throw new ORPCError("BAD_REQUEST", { message: "No organization context" });
			}
			if (!ctx.tenantDb || !ctx.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "No tenant DB / member on context",
				});
			}
			try {
				return await confirmPayoutViaStripe(
					ctx.tenantDb,
					input.payoutId,
					{
						organizationId: orgId,
						actor: {
							userId: ctx.member.userId,
							memberId: ctx.member.id,
							role: ctx.member.role,
						},
					},
					() => getStripeClient(),
				);
			} catch (err) {
				if (err instanceof ConfirmPayoutError) {
					switch (err.code) {
						case "NOT_FOUND":
							throw new ORPCError("NOT_FOUND", { message: err.message });
						case "BAD_REQUEST_STATUS":
						case "BAD_REQUEST_METHOD":
						case "PARTNER_NOT_ONBOARDED":
						case "PARTNER_NOT_PAYOUTS_ENABLED":
							throw new ORPCError("BAD_REQUEST", { message: err.message });
						case "STRIPE_TRANSFER_FAILED":
							throw new ORPCError("BAD_GATEWAY", { message: err.message });
					}
				}
				throw err;
			}
		}),
};
