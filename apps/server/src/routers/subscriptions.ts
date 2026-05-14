/**
 * SaaS Subscription oRPC Router.
 *
 * Procedures:
 *   - createCheckoutSession: returns a Stripe Checkout URL for the chosen tier.
 *   - getStatus: returns the tenant's current sub state ('active' / 'past_due' /
 *       'trialing' / 'none' / ...).
 *   - billingPortal: returns a Stripe Customer Portal URL for self-serve mgmt.
 *
 * All procedures require an authenticated session + organizationId in context.
 *
 * Per ADR-0002 (tier app-fee), ADR-0003 (trial-first activation),
 * ADR-0009 (past-due state surfaced to UI), ADR-0010 (TIER_LIMITS source).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getStripeClient } from "@/lib/stripe";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { evaluateAccess } from "@/middleware/require-active-saas-sub.middleware";

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

const TIER_TO_PRICE_ENV: Record<"basic" | "professional" | "enterprise", string> = {
	basic: "STRIPE_PRICE_BASIC",
	professional: "STRIPE_PRICE_PROFESSIONAL",
	enterprise: "STRIPE_PRICE_ENTERPRISE",
};

export const subscriptionsRouter = {
	createCheckoutSession: protectedProcedure
		.input(z.object({ tier: z.enum(["basic", "professional", "enterprise"]) }))
		.handler(async ({ context, input }) => {
			const orgId = (context as { organizationId?: string }).organizationId;
			if (!orgId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No organization context (must select an organization first)",
				});
			}

			const priceEnv = TIER_TO_PRICE_ENV[input.tier];
			const priceId = getEnvVar(priceEnv);
			if (!priceId) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `${priceEnv} is not configured`,
				});
			}

			const [org] = await controlPanelDb
				.select()
				.from(organizations)
				.where(eq(organizations.id, orgId))
				.limit(1);
			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
			}

			const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
			const userEmail = (context as { session?: { user?: { email?: string } } }).session?.user?.email;

			const stripe = getStripeClient();
			// We let Stripe Checkout create the Stripe Customer (customer_email + customer_creation default).
			// The Customer ID is delivered to us via the customer.subscription.created webhook,
			// which upsertSubscriptionFromStripe persists. Org→sub link via metadata.organizationId
			// is wired in Task 15.
			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				customer_email: userEmail,
				customer_creation: "always",
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: `${webAppUrl}/subscribe?session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: `${webAppUrl}/subscribe?canceled=1`,
				client_reference_id: orgId,
				subscription_data: { metadata: { organizationId: orgId } },
				metadata: { organizationId: orgId },
			});

			return { checkoutUrl: session.url ?? "", sessionId: session.id };
		}),

	getStatus: protectedProcedure
		.input(z.object({}))
		.handler(async ({ context }) => {
			const orgId = (context as { organizationId?: string }).organizationId;
			if (!orgId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No organization context",
				});
			}

			const [org] = await controlPanelDb
				.select()
				.from(organizations)
				.where(eq(organizations.id, orgId))
				.limit(1);
			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
			}

			let sub: {
				status: string;
				tier: string | null;
				currentPeriodEnd: Date | null;
				pastDueAt: Date | null;
				gracePeriodEndsAt: Date | null;
				trialEndsAt: Date | null;
			} | null = null;
			if (org.subscriptionId) {
				const [row] = await controlPanelDb
					.select()
					.from(subscriptions)
					.where(eq(subscriptions.id, org.subscriptionId))
					.limit(1);
				if (row) {
					sub = {
						status: row.status,
						tier: row.tier,
						currentPeriodEnd: row.currentPeriodEnd,
						pastDueAt: row.pastDueAt,
						gracePeriodEndsAt: row.gracePeriodEndsAt,
						trialEndsAt: row.trialEndsAt,
					};
				}
			}

			const decision = evaluateAccess(
				sub
					? {
							status: sub.status,
							pastDueAt: sub.pastDueAt,
							gracePeriodEndsAt: sub.gracePeriodEndsAt,
							trialEndsAt: sub.trialEndsAt,
					  }
					: null,
				new Date(),
				org.trialEndsAt,
			);

			const banner =
				decision.decision === "allow" ? decision.banner ?? null : null;
			const blockedReason =
				decision.decision === "block" || decision.decision === "read_only"
					? decision.reason
					: null;

			if (sub) {
				return {
					status: sub.status,
					tier: sub.tier,
					currentPeriodEnd: sub.currentPeriodEnd,
					pastDueAt: sub.pastDueAt,
					gracePeriodEndsAt: sub.gracePeriodEndsAt,
					trialEndsAt: sub.trialEndsAt,
					decision: decision.decision,
					banner,
					blockedReason,
				};
			}

			// No subscription — derive from org trial state.
			if (org.trialEndsAt && org.trialEndsAt.getTime() > Date.now()) {
				return {
					status: "trialing" as const,
					tier: null,
					currentPeriodEnd: null,
					pastDueAt: null,
					gracePeriodEndsAt: null,
					trialEndsAt: org.trialEndsAt,
					decision: decision.decision,
					banner,
					blockedReason,
				};
			}

			return {
				status: "none" as const,
				tier: null,
				currentPeriodEnd: null,
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
				decision: decision.decision,
				banner,
				blockedReason,
			};
		}),

	billingPortal: protectedProcedure
		.input(z.object({}))
		.handler(async ({ context }) => {
			const orgId = (context as { organizationId?: string }).organizationId;
			if (!orgId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No organization context",
				});
			}

			const [org] = await controlPanelDb
				.select()
				.from(organizations)
				.where(eq(organizations.id, orgId))
				.limit(1);
			if (!org?.subscriptionId) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: "No active subscription",
				});
			}

			const [sub] = await controlPanelDb
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.id, org.subscriptionId))
				.limit(1);
			if (!sub) {
				throw new ORPCError("NOT_FOUND", {
					message: "Subscription record missing",
				});
			}

			const stripe = getStripeClient();
			const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
			const portal = await stripe.billingPortal.sessions.create({
				customer: sub.stripeCustomerId,
				return_url: `${webAppUrl}/dashboard/billing`,
			});
			return { portalUrl: portal.url };
		}),
};
