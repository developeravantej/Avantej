/**
 * Partner Stripe Connect OAuth callback (S-partner-stripe-onboarding).
 *
 * Stripe redirects the operator (acting on behalf of a partner / coach) back
 * here after they authorize on connect.stripe.com/oauth/authorize using the
 * URL produced by `partnerStripe.createOnboardingUrl`. We:
 *
 *   1. Verify the signed state (orgId.partnerId.country.ts.sig).
 *   2. Exchange the code for stripe_user_id.
 *   3. UPSERT partner_stripe_accounts in the tenant DB.
 *   4. Label the Connect account via accounts.update({ metadata }) so the
 *      account.updated webhook can route subsequent capability changes back
 *      to the right tenant + partnerId.
 *   5. Redirect the operator back to the web app's partner payouts page.
 *
 * URL contract: GET /api/stripe/connect/partner/callback?code=&state=&error=
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getTenantDb } from "@/lib/db";
import { partnerStripeAccounts } from "@avantej-core/db/schema/tenant/partner-stripe-accounts";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	exchangePartnerOAuthCode,
	verifyPartnerOAuthState,
} from "@/services/partner-stripe.service";
import { getStripeClient } from "@/lib/stripe";

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

export const partnerStripeOAuthRoutes = new Hono();

partnerStripeOAuthRoutes.get("/callback", async (c) => {
	const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
	const errorRedirect = (reason: string) =>
		c.redirect(
			`${webAppUrl}/dashboard/commissions/view?tab=payouts&partner_oauth_error=${encodeURIComponent(reason)}`,
		);

	const code = c.req.query("code");
	const state = c.req.query("state");
	const stripeError = c.req.query("error");
	const stripeErrorDescription = c.req.query("error_description");

	if (stripeError) {
		console.warn(
			`[partner-oauth] operator canceled / denied: ${stripeError} — ${stripeErrorDescription}`,
		);
		return errorRedirect(stripeErrorDescription ?? stripeError);
	}
	if (!code || !state) {
		return errorRedirect("missing_code_or_state");
	}

	const secret = getEnvVar("BETTER_AUTH_SECRET");
	if (!secret) {
		console.error("[partner-oauth] BETTER_AUTH_SECRET missing");
		return errorRedirect("server_misconfigured");
	}
	const verified = await verifyPartnerOAuthState(state, secret);
	if (!verified) {
		console.warn("[partner-oauth] state verification failed");
		return errorRedirect("invalid_state");
	}
	const { orgId, partnerId, countryCode } = verified;

	const platformSecretKey = getEnvVar("STRIPE_SECRET_KEY");
	if (!platformSecretKey) {
		console.error("[partner-oauth] STRIPE_SECRET_KEY missing");
		return errorRedirect("server_misconfigured");
	}

	// Exchange the code for the Stripe Connect account id.
	const exchange = await exchangePartnerOAuthCode({ code, platformSecretKey });
	if (!exchange.ok) {
		console.error(
			`[partner-oauth] token exchange failed: ${exchange.error} — ${exchange.description ?? ""}`,
		);
		return errorRedirect(exchange.error);
	}
	const stripeUserId = exchange.stripeUserId;

	// Resolve the tenant DB + verify partner is still an active member.
	const tenantDb = await getTenantDb(orgId, c);
	const [member] = await tenantDb
		.select({ userId: members.userId, status: members.status })
		.from(members)
		.where(eq(members.userId, partnerId))
		.limit(1);
	if (!member || member.status !== "active") {
		console.warn(
			`[partner-oauth] partner ${partnerId} not active in tenant ${orgId} (member=${!!member}, status=${member?.status})`,
		);
		return errorRedirect("partner_not_active");
	}

	const now = new Date();
	// UPSERT — operator may re-run onboarding after the partner's account is
	// restricted to refresh capabilities, so this needs to handle the existing-row
	// case. partnerId has a unique index; we use that as the conflict target.
	await tenantDb
		.insert(partnerStripeAccounts)
		.values({
			partnerId,
			stripeConnectAccountId: stripeUserId,
			stripeConnectStatus: "pending",
			stripeConnectAccountType: "partner",
			accountType: "standard",
			countryCode: countryCode ?? null,
			payoutsEnabled: false,
			detailsSubmitted: false,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: partnerStripeAccounts.partnerId,
			set: {
				stripeConnectAccountId: stripeUserId,
				countryCode: countryCode ?? null,
				updatedAt: now,
			},
		});

	// Label the Stripe Connect account with our routing metadata so subsequent
	// account.updated webhooks can identify the tenant + partner without us
	// needing a separate control-panel index table.
	try {
		const stripe = getStripeClient();
		await stripe.accounts.update(stripeUserId, {
			metadata: {
				organizationId: orgId,
				partnerId,
			},
		});
	} catch (e) {
		// Non-fatal: the row is persisted; webhook routing will fall back to the
		// org branch if metadata is unset. Log + continue.
		console.warn(
			`[partner-oauth] accounts.update metadata label failed for acct=${stripeUserId}:`,
			e,
		);
	}

	console.log(
		`[partner-oauth] linked org=${orgId} partner=${partnerId} acct=${stripeUserId} country=${countryCode ?? "(none)"}`,
	);
	return c.redirect(
		`${webAppUrl}/dashboard/commissions/view?tab=payouts&partner_oauth=success&partner_id=${encodeURIComponent(partnerId)}`,
	);
});
