/**
 * Stripe Connect OAuth callback (Standard accounts, ADR-0001 v2).
 *
 * Stripe redirects the tenant back here after they authorize on
 * connect.stripe.com/oauth/authorize. We exchange the code for
 * stripe_user_id and persist it on the org row, then redirect the
 * tenant back to /billing/connect on the web app.
 *
 * URL contract: GET /api/stripe/connect/oauth/callback?code=&state=&error=
 *   - state: signed orgId (HMAC via BETTER_AUTH_SECRET) — see signOAuthState.
 *   - code:  one-time auth code from Stripe.
 *
 * Errors are reported back to the UI via /billing/connect?oauth_error=...
 * (UI surfaces via toast).
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { verifyOAuthState } from "@/routers/stripe-connect";

// ISO-2 -> ISO-4217 mapping (mirrors the backfill script + webhook handler).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
	MY: "MYR", SG: "SGD", TH: "THB", ID: "IDR", PH: "PHP",
	VN: "VND", HK: "HKD", AU: "AUD", NZ: "NZD", US: "USD",
	GB: "GBP", JP: "JPY", CN: "CNY",
};

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

export const stripeConnectOAuthRoutes = new Hono();

stripeConnectOAuthRoutes.get("/callback", async (c) => {
	const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
	const errorRedirect = (reason: string) =>
		c.redirect(`${webAppUrl}/billing/connect?oauth_error=${encodeURIComponent(reason)}`);

	const code = c.req.query("code");
	const state = c.req.query("state");
	const stripeError = c.req.query("error");
	const stripeErrorDescription = c.req.query("error_description");

	if (stripeError) {
		console.warn(`[stripe-oauth] tenant canceled or denied: ${stripeError} — ${stripeErrorDescription}`);
		return errorRedirect(stripeErrorDescription ?? stripeError);
	}

	if (!code || !state) {
		return errorRedirect("missing_code_or_state");
	}

	const secret = getEnvVar("BETTER_AUTH_SECRET");
	if (!secret) {
		console.error("[stripe-oauth] BETTER_AUTH_SECRET missing");
		return errorRedirect("server_misconfigured");
	}
	const verified = await verifyOAuthState(state, secret);
	if (!verified) {
		console.warn("[stripe-oauth] state verification failed");
		return errorRedirect("invalid_state");
	}
	const { orgId, countryCode: stateCountryCode } = verified;

	const platformSecretKey = getEnvVar("STRIPE_SECRET_KEY");
	if (!platformSecretKey) {
		console.error("[stripe-oauth] STRIPE_SECRET_KEY missing");
		return errorRedirect("server_misconfigured");
	}

	// Exchange code for stripe_user_id. Direct fetch (Workers-compat) instead
	// of stripe.oauth.token to keep this independent of SDK shape.
	let tokenJson: {
		stripe_user_id?: string;
		access_token?: string;
		scope?: string;
		livemode?: boolean;
		error?: string;
		error_description?: string;
	};
	try {
		const res = await fetch("https://connect.stripe.com/oauth/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: `Bearer ${platformSecretKey}`,
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
			}).toString(),
		});
		tokenJson = (await res.json()) as typeof tokenJson;
		if (!res.ok || tokenJson.error) {
			console.error(
				`[stripe-oauth] token exchange failed: ${res.status} ${tokenJson.error} — ${tokenJson.error_description}`,
			);
			return errorRedirect(tokenJson.error ?? "token_exchange_failed");
		}
	} catch (e) {
		console.error("[stripe-oauth] token exchange threw:", e);
		return errorRedirect("token_exchange_threw");
	}

	const stripeUserId = tokenJson.stripe_user_id;
	if (!stripeUserId) {
		console.error("[stripe-oauth] token response missing stripe_user_id");
		return errorRedirect("missing_stripe_user_id");
	}

	const controlPanelDb = getControlPanelDb(c);
	const [org] = await controlPanelDb
		.select()
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) {
		console.warn(`[stripe-oauth] org ${orgId} not found`);
		return errorRedirect("org_not_found");
	}

	await controlPanelDb
		.update(organizations)
		.set({
			stripeConnectAccountId: stripeUserId,
			stripeConnectAccountType: "standard",
			stripeConnectStatus: "pending",
			connectAccountUpdatedAt: new Date(),
		})
		.where(eq(organizations.id, orgId));

	// Phase 4.3: also pre-seed org_country_stripe_accounts when the OAuth
	// state carried a target country. Webhook account.updated will also
	// reconcile this (using acct.country), but pre-seeding closes the UX
	// gap between OAuth callback and the first webhook delivery.
	if (stateCountryCode) {
		const currency = COUNTRY_TO_CURRENCY[stateCountryCode] ?? stateCountryCode;
		await controlPanelDb
			.insert(orgCountryStripeAccounts)
			.values({
				organizationId: orgId,
				countryCode: stateCountryCode,
				stripeAccountId: stripeUserId,
				stripeConnectStatus: "pending",
				stripeConnectAccountType: "standard",
				chargesEnabled: false,
				payoutsEnabled: false,
				detailsSubmitted: false,
				currency,
				connectAccountUpdatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					orgCountryStripeAccounts.organizationId,
					orgCountryStripeAccounts.countryCode,
				],
				set: {
					stripeAccountId: stripeUserId,
					connectAccountUpdatedAt: new Date(),
					updatedAt: new Date(),
				},
			});
	}

	console.log(
		`[stripe-oauth] linked org=${orgId} acct=${stripeUserId} country=${stateCountryCode ?? "(none)"}`,
	);
	return c.redirect(
		`${webAppUrl}/billing/connect?return=1${stateCountryCode ? `&country=${stateCountryCode}` : ""}`,
	);
});
