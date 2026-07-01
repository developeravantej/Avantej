/**
 * Cloudflare Email — sending-domain status mapping (Phase 3).
 *
 * The app's EmailDomainStatus vocabulary is `pending | verifying | verified |
 * failed` (shared with the Resend path). Cloudflare Email Sending exposes a
 * sending subdomain as `{ enabled: boolean, ... }`. Unlike Resend there is no
 * publish-DNS-then-verify handshake: for a subdomain of a zone in OUR account
 * (the default `<tenant>.avantej.com` tier) CF auto-publishes SPF/DKIM/DMARC/MX
 * and flips `enabled: true` the moment it's ready to send. So:
 *   - `verified`  — aggregate status says active/verified, OR (no status field)
 *                   the subdomain is `enabled` (ready to send), OR all included
 *                   DNS records validate
 *   - `verifying` — DNS view included but records not yet all valid (propagating)
 *   - `pending`   — freshly created, not yet enabled / no signal
 *   - `failed`    — CF reports a hard validation failure
 *
 * Empirically the list/get responses carry NO `status` field and NO per-record
 * validation, just `enabled` — verified confirmed live against the avantej.com
 * zone (create → enabled:true, 6 auto-published records). Kept pure + unit-testable.
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

	// No record-level detail (the usual case for a zone in our account): CF marks
	// the subdomain `enabled` once it's ready to send, so treat that as verified.
	if (sub.enabled) return "verified";
	return "pending";
}
