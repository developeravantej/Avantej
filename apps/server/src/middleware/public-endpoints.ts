/**
 * Public tenant-endpoint matching — single source of truth.
 *
 * These oRPC endpoints need a tenant DB set up but do NOT require a
 * pre-existing member/session (invitation + registration flows). The
 * orpc-tenant.middleware consults this for BOTH the request path and the oRPC
 * method name.
 *
 * Kept in its own module (no DB / hono imports) so the matching logic is unit
 * testable in isolation — see public-endpoints.test.ts.
 */

// Suffixes matched by SUBSTRING after normalizing dot-delimited method names
// ("invitations.accept") to slash form, so one list covers both wire formats.
//
// ⚠️ Substring (not exact) matching is INTENTIONAL and load-bearing: it also
// whitelists "invitations.acceptWithSignup" (public by construction) via the
// "invitations/accept" suffix. Do NOT tighten to exact equality — that would
// silently break self-signup invite acceptance.
export const PUBLIC_TENANT_ENDPOINT_SUFFIXES = [
	"invitations/getByToken",
	"invitations/accept",
	"invitations/verifyEmailByToken",
	"registration/complete",
] as const;

/**
 * True when `value` (a request path or an oRPC method name) targets a public
 * tenant endpoint. Returns false for nullish input.
 */
export function matchesPublicTenantEndpoint(
	value: string | undefined | null,
): boolean {
	if (!value) return false;
	const normalized = value.replace(/\./g, "/");
	return PUBLIC_TENANT_ENDPOINT_SUFFIXES.some((s) => normalized.includes(s));
}
