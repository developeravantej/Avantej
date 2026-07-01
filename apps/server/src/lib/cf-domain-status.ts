/**
 * Cloudflare Email — sending-domain status mapping (Phase 3).
 *
 * The app's EmailDomainStatus vocabulary is `pending | verifying | verified |
 * failed` (shared with the Resend path). Cloudflare exposes a sending subdomain
 * as `{ enabled: boolean, ... }` plus per-record DNS validation; there is no
 * single "verified" flag, so we derive it:
 *   - `verified`  — the subdomain is enabled AND all required DNS records validate
 *   - `verifying` — enabled but records not yet all valid (DNS still propagating)
 *   - `pending`   — freshly created, not yet enabled / no record status
 *   - `failed`    — CF reports a hard validation failure
 *
 * Kept separate + pure so it's unit-testable and replaces the two duplicated
 * `mapResendStatus` copies once the router/refresh service are repointed.
 */

export type EmailDomainStatus = "pending" | "verifying" | "verified" | "failed";

export interface CfSubdomainLike {
	enabled?: boolean;
	/** Some CF responses expose an aggregate status string. */
	status?: string;
	/** Per-record validation, when the DNS view is included. */
	dns_records?: Array<{ status?: string; type?: string; name?: string }>;
}

export function mapCfDomainStatus(
	sub: CfSubdomainLike | null | undefined,
): EmailDomainStatus {
	if (!sub) return "pending";

	const s = (sub.status ?? "").toLowerCase();
	if (s === "active" || s === "verified") return "verified";
	if (s === "failed" || s === "error" || s === "moved") return "failed";

	const records = sub.dns_records;
	if (Array.isArray(records) && records.length > 0) {
		const statuses = records.map((r) => (r.status ?? "").toLowerCase());
		if (statuses.some((x) => x === "failed" || x === "error")) return "failed";
		const allValid = statuses.every((x) => x === "valid" || x === "active");
		if (allValid) return "verified";
		return "verifying";
	}

	// No record-level detail: fall back to the enabled flag.
	if (sub.enabled) return "verifying";
	return "pending";
}
