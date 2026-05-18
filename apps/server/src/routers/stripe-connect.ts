/**
 * Stripe Connect oRPC Router (Plan B — tenant onboarding).
 *
 * Implements Standard-account OAuth flow per Stripe MY platform restrictions
 * (Express/Custom in private beta for MY platforms — ADR-0001 v2).
 *
 * Procedures:
 *   - createOnboardingUrl: build OAuth authorize URL (state = orgId signed via
 *       BETTER_AUTH_SECRET HMAC). Tenant clicks button -> redirect there ->
 *       Stripe-hosted signup/login -> redirects back to
 *       /api/stripe/connect/oauth/callback with ?code=&state=.
 *   - getAccountStatus: return charges_enabled / payouts_enabled /
 *       details_submitted flags. Refreshes from Stripe on read.
 *
 * The OAuth callback (handled outside oRPC in webhooks.routes.ts) exchanges
 * the code for stripe_user_id and persists it as stripeConnectAccountId.
 *
 * All procedures require an authenticated session + organizationId in input.
 *
 * Per ADR-0001 v2 (Standard + OAuth for MY platform), ADR-0008 (account.updated
 * webhook is source of truth for chargesEnabled/payoutsEnabled/detailsSubmitted).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";

type StripeClientLike = {
	accounts: {
		retrieve: (id: string) => Promise<{
			id: string;
			charges_enabled?: boolean;
			payouts_enabled?: boolean;
			details_submitted?: boolean;
		}>;
	};
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

// Web Crypto helpers — Workers-compat (no node:crypto).
const textEncoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
	}
	return out;
}

function toBase64Url(s: string): string {
	const b64 =
		typeof btoa === "function"
			? btoa(s)
			: Buffer.from(s, "binary").toString("base64");
	return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
	const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
	return typeof atob === "function"
		? atob(padded)
		: Buffer.from(padded, "base64").toString("binary");
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
	return toHex(sig);
}

/**
 * Sign OAuth state — prevents CSRF + cross-tenant replay.
 *
 * Phase 4.3: optionally encodes a target countryCode so the OAuth callback
 * can pre-seed the org_country_stripe_accounts row before the
 * account.updated webhook lands. State format:
 *
 *   `${orgId}.${countryCode || ''}.${timestamp}.${hmac}`
 *
 * Legacy 3-part state (`orgId.ts.sig`) is still accepted on verify for
 * backwards-compat with onboarding links generated before this rev.
 */
export async function signOAuthState(
	orgId: string,
	secret: string,
	countryCode?: string,
): Promise<string> {
	const ts = Date.now().toString();
	const country = (countryCode ?? "").toUpperCase();
	const payload = `${orgId}.${country}.${ts}`;
	const sig = await hmacSha256Hex(payload, secret);
	return toBase64Url(`${payload}.${sig}`);
}

/**
 * Verify + extract orgId (+ optional countryCode) from signed state.
 * Returns null if invalid/expired. Accepts both 4-part (Phase 4.3+) and
 * legacy 3-part states.
 */
export async function verifyOAuthState(
	state: string,
	secret: string,
	maxAgeMs = 60 * 60 * 1000,
): Promise<{ orgId: string; countryCode: string | null } | null> {
	try {
		const decoded = fromBase64Url(state);
		const parts = decoded.split(".");
		let orgId: string | undefined;
		let countryCode: string | null = null;
		let tsStr: string | undefined;
		let sig: string | undefined;
		let payloadForHmac: string;

		if (parts.length === 4) {
			[orgId, , tsStr, sig] = parts;
			countryCode = parts[1] ? parts[1].toUpperCase() : null;
			if (!orgId || !tsStr || !sig) {
				console.warn("[oauth-state] empty field after split (4-part)");
				return null;
			}
			payloadForHmac = `${orgId}.${countryCode ?? ""}.${tsStr}`;
		} else if (parts.length === 3) {
			[orgId, tsStr, sig] = parts;
			if (!orgId || !tsStr || !sig) {
				console.warn("[oauth-state] empty field after split (3-part legacy)");
				return null;
			}
			payloadForHmac = `${orgId}.${tsStr}`;
		} else {
			console.warn(`[oauth-state] malformed state: parts=${parts.length}`);
			return null;
		}

		const expected = await hmacSha256Hex(payloadForHmac, secret);
		if (expected !== sig) {
			console.warn(
				`[oauth-state] HMAC mismatch (likely BETTER_AUTH_SECRET changed). orgId=${orgId} tsStr=${tsStr}`,
			);
			return null;
		}
		const ts = Number.parseInt(tsStr, 10);
		if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) {
			console.warn(
				`[oauth-state] expired. age=${Date.now() - ts}ms maxAge=${maxAgeMs}ms`,
			);
			return null;
		}
		return { orgId, countryCode: countryCode || null };
	} catch (e) {
		console.warn("[oauth-state] verify threw:", e);
		return null;
	}
}

export function createStripeConnectRouter(_stripeClientOverride?: StripeClientLike) {
	// Phase 4.5: getAccountStatus / listCountryAccounts read straight from
	// the DB; createOnboardingUrl builds a URL without an SDK call. No
	// Stripe SDK use remains in this router. The override param is kept
	// for parity with createSubscriptionsRouter + createPaymentsRouter
	// in case future procs add SDK calls.
	void _stripeClientOverride;

	return {
		createOnboardingUrl: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					countryCode: z
						.string()
						.length(2)
						.regex(/^[A-Za-z]{2}$/)
						.optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const orgId =
					(context as { organizationId?: string }).organizationId ??
					input.organizationId;
				if (!orgId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "No organization context",
					});
				}

				const controlPanelDb = getControlPanelDb(context as unknown as Parameters<typeof getControlPanelDb>[0]);
				const [org] = await controlPanelDb
					.select()
					.from(organizations)
					.where(eq(organizations.id, orgId))
					.limit(1);
				if (!org) {
					throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
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

				const userEmail = (context as { session?: { user?: { email?: string } } })
					.session?.user?.email;
				const targetCountry = input.countryCode?.toUpperCase();
				const state = await signOAuthState(orgId, secret, targetCountry);

				const params = new URLSearchParams({
					response_type: "code",
					client_id: clientId,
					scope: "read_write",
					state,
				});
				if (userEmail) params.set("stripe_user[email]", userEmail);
				if (org.name) params.set("stripe_user[business_name]", org.name);
				// Pre-fill the country dropdown on the Stripe-hosted onboarding form
				// so the tenant doesn't have to re-pick it. Stripe still validates
				// the acct's actual country at submission time.
				if (targetCountry) params.set("stripe_user[country]", targetCountry);

				const onboardingUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
				return { onboardingUrl };
			}),

		// Phase 4.5: getAccountStatus now reads from org_country_stripe_accounts
		// and returns the first (charges-enabled preferred) country row. Legacy
		// org-level field is gone. For deterministic per-country status, callers
		// should use listCountryAccounts instead.
		getAccountStatus: protectedProcedure
			.input(z.object({ organizationId: z.string().uuid() }))
			.handler(async ({ context, input }) => {
				const orgId =
					(context as { organizationId?: string }).organizationId ??
					input.organizationId;
				if (!orgId) {
					throw new ORPCError("BAD_REQUEST", { message: "No organization context" });
				}

				const controlPanelDb = getControlPanelDb(context as unknown as Parameters<typeof getControlPanelDb>[0]);
				const rows = await controlPanelDb
					.select()
					.from(orgCountryStripeAccounts)
					.where(eq(orgCountryStripeAccounts.organizationId, orgId));

				if (rows.length === 0) {
					return {
						connected: false,
						accountId: null as string | null,
						chargesEnabled: false,
						payoutsEnabled: false,
						detailsSubmitted: false,
						status: "pending" as string,
					};
				}

				const row = rows.find((r) => r.stripeAccountId && r.chargesEnabled) ?? rows[0]!;
				return {
					connected: !!row.stripeAccountId,
					accountId: row.stripeAccountId,
					chargesEnabled: row.chargesEnabled,
					payoutsEnabled: row.payoutsEnabled,
					detailsSubmitted: row.detailsSubmitted,
					status: row.stripeConnectStatus,
				};
			}),

		// Phase 4.3 — list all Connect accounts for an org, one per country.
		// Includes the legacy org-level acct as a synthetic row if no country
		// row exists yet (currency defaults to MYR since the legacy field
		// pre-dates per-country support and only MY platforms were possible).
		listCountryAccounts: protectedProcedure
			.input(z.object({ organizationId: z.string().uuid() }))
			.handler(async ({ context, input }) => {
				const orgId =
					(context as { organizationId?: string }).organizationId ??
					input.organizationId;
				if (!orgId) {
					throw new ORPCError("BAD_REQUEST", { message: "No organization context" });
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				const rows = await controlPanelDb
					.select()
					.from(orgCountryStripeAccounts)
					.where(eq(orgCountryStripeAccounts.organizationId, orgId));

				const accounts = rows.map((r) => ({
					countryCode: r.countryCode,
					currency: r.currency,
					stripeAccountId: r.stripeAccountId,
					chargesEnabled: r.chargesEnabled,
					payoutsEnabled: r.payoutsEnabled,
					detailsSubmitted: r.detailsSubmitted,
					status: r.stripeConnectStatus,
					onboardingCompletedAt: r.stripeConnectOnboardingCompletedAt,
				}));

				return { accounts };
			}),
	};
}

export const stripeConnectRouter = createStripeConnectRouter();
