/**
 * Partner Stripe Connect onboarding service (S-partner-stripe-onboarding).
 *
 * Mirrors the org-level Stripe Connect OAuth pattern in
 * `apps/server/src/routers/stripe-connect.ts` but scoped to PARTNERS (coaches /
 * trainers within a tenant) instead of the org-level franchiser account.
 *
 * Architecture choice: Standard accounts via OAuth.
 *   - Stripe best-practices skill recommends Accounts v2 + controller properties
 *     for new platforms, BUT MY platforms are restricted to Standard accounts
 *     per ADR-0001 v2 (Express/Custom in private beta for MY). We keep the same
 *     Standard + OAuth pattern as the existing org-level flow for consistency
 *     + regional compliance.
 *
 * State format (5-part): `orgId.partnerId.country.ts.sig`
 *   - orgId    — which tenant
 *   - partnerId — which member.userId (cross-DB text id)
 *   - country   — optional ISO-2; "" when omitted
 *   - ts        — unix ms when the state was minted (replay window)
 *   - sig       — HMAC-SHA256(BETTER_AUTH_SECRET, "orgId.partnerId.country.ts")
 *
 * All HMAC math uses Web Crypto so it works inside Cloudflare Workers without
 * pulling in node:crypto.
 */

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
		typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
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
 * Sign a partner-scoped OAuth state. Mirrors `signOAuthState` from the org-level
 * flow but adds the `partnerId` slot so the callback can resolve which member
 * record to populate.
 */
export async function signPartnerOAuthState(params: {
	orgId: string;
	partnerId: string;
	secret: string;
	countryCode?: string | null;
}): Promise<string> {
	const ts = Date.now().toString();
	const country = (params.countryCode ?? "").toUpperCase();
	const payload = `${params.orgId}.${params.partnerId}.${country}.${ts}`;
	const sig = await hmacSha256Hex(payload, params.secret);
	return toBase64Url(`${payload}.${sig}`);
}

/**
 * Verify a partner-scoped OAuth state. Returns null when malformed, expired, or
 * the HMAC doesn't match.
 *
 * Default replay window: 1 hour (matches the org-level flow).
 */
export async function verifyPartnerOAuthState(
	state: string,
	secret: string,
	maxAgeMs = 60 * 60 * 1000,
): Promise<{ orgId: string; partnerId: string; countryCode: string | null } | null> {
	try {
		const decoded = fromBase64Url(state);
		const parts = decoded.split(".");
		if (parts.length !== 5) {
			console.warn(`[partner-oauth-state] expected 5 parts, got ${parts.length}`);
			return null;
		}
		const [orgId, partnerId, countryRaw, tsStr, sig] = parts;
		if (!orgId || !partnerId || !tsStr || !sig) {
			console.warn("[partner-oauth-state] empty required field after split");
			return null;
		}
		const countryCode = countryRaw ? countryRaw.toUpperCase() : null;
		const payloadForHmac = `${orgId}.${partnerId}.${countryRaw ?? ""}.${tsStr}`;
		const expected = await hmacSha256Hex(payloadForHmac, secret);
		if (expected !== sig) {
			console.warn(
				`[partner-oauth-state] HMAC mismatch (BETTER_AUTH_SECRET changed?) orgId=${orgId} partnerId=${partnerId}`,
			);
			return null;
		}
		const ts = Number.parseInt(tsStr, 10);
		if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) {
			console.warn(
				`[partner-oauth-state] expired. age=${Date.now() - ts}ms maxAge=${maxAgeMs}ms`,
			);
			return null;
		}
		return { orgId, partnerId, countryCode };
	} catch (e) {
		console.warn("[partner-oauth-state] verify threw:", e);
		return null;
	}
}

/**
 * Build the Stripe Connect OAuth authorize URL for a partner. The tenant clicks
 * the resulting URL, completes Stripe-hosted onboarding under their own Stripe
 * login, and Stripe redirects back to /api/stripe/connect/partner/callback
 * with ?code=&state=.
 *
 * Caller is responsible for verifying the partner is a real member of the org
 * before minting the state (the URL is signed so it cannot be retargeted to a
 * different partnerId after generation).
 */
export function buildPartnerOnboardingUrl(params: {
	clientId: string;
	state: string;
	email?: string | null;
	businessName?: string | null;
	countryCode?: string | null;
}): string {
	const qs = new URLSearchParams({
		response_type: "code",
		client_id: params.clientId,
		scope: "read_write",
		state: params.state,
	});
	if (params.email) qs.set("stripe_user[email]", params.email);
	if (params.businessName) qs.set("stripe_user[business_name]", params.businessName);
	if (params.countryCode) qs.set("stripe_user[country]", params.countryCode);
	return `https://connect.stripe.com/oauth/authorize?${qs.toString()}`;
}

/**
 * Exchange an authorization code for a Stripe Connect account id. Direct fetch
 * (Workers-compat) — matches the org-level token exchange pattern.
 */
export async function exchangePartnerOAuthCode(params: {
	code: string;
	platformSecretKey: string;
}): Promise<
	| { ok: true; stripeUserId: string; livemode: boolean | null }
	| { ok: false; error: string; description?: string }
> {
	let tokenJson: {
		stripe_user_id?: string;
		livemode?: boolean;
		error?: string;
		error_description?: string;
	};
	try {
		const res = await fetch("https://connect.stripe.com/oauth/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: `Bearer ${params.platformSecretKey}`,
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: params.code,
			}).toString(),
		});
		tokenJson = (await res.json()) as typeof tokenJson;
		if (!res.ok || tokenJson.error) {
			return {
				ok: false,
				error: tokenJson.error ?? `http_${res.status}`,
				description: tokenJson.error_description,
			};
		}
	} catch (e) {
		return { ok: false, error: "token_exchange_threw", description: String(e) };
	}
	if (!tokenJson.stripe_user_id) {
		return { ok: false, error: "missing_stripe_user_id" };
	}
	return {
		ok: true,
		stripeUserId: tokenJson.stripe_user_id,
		livemode: tokenJson.livemode ?? null,
	};
}

/**
 * Map Stripe's account.charges_enabled / payouts_enabled / details_submitted
 * tuple to the simpler four-state status string we store on
 * partner_stripe_accounts.stripe_connect_status.
 *
 * For PARTNER accounts we only care about payouts_enabled — partners don't
 * charge customers, they receive payouts from the franchiser.
 */
export function deriveStripeConnectStatus(input: {
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirementsDisabledReason: string | null;
}): "pending" | "active" | "restricted" | "rejected" {
	if (input.requirementsDisabledReason) {
		// "rejected.fraud", "rejected.terms_of_service", etc. → rejected
		if (input.requirementsDisabledReason.startsWith("rejected.")) return "rejected";
		// Other disabled reasons (e.g. "requirements.past_due") → restricted
		return "restricted";
	}
	if (input.payoutsEnabled) return "active";
	return "pending";
}
