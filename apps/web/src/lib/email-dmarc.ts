/**
 * DMARC progression helpers for the email-settings page.
 *
 * Pure logic (no React) so it's unit-testable without rendering the route
 * module. The settings page imports these to render the none → quarantine →
 * reject hardening stepper from a domain's DNS records.
 */

export type DmarcPolicy = "none" | "quarantine" | "reject";

/** Minimal shape of a DNS record we read here (subset of the row's dnsRecords). */
export interface DmarcDnsRecord {
	name?: string;
	type?: string;
	value?: string;
}

export const DMARC_STEPS: { policy: DmarcPolicy; label: string; blurb: string }[] = [
	{ policy: "none", label: "Monitor", blurb: "p=none — reports only, nothing blocked. Start here." },
	{ policy: "quarantine", label: "Quarantine", blurb: "p=quarantine — failing mail goes to spam." },
	{ policy: "reject", label: "Reject", blurb: "p=reject — failing mail is blocked. Strongest." },
];

/** Pull the DMARC policy (p=) out of the _dmarc TXT record, if present. */
export function parseDmarcPolicy(records: DmarcDnsRecord[]): DmarcPolicy | null {
	const rec = records.find(
		(r) => r.type?.toUpperCase() === "TXT" && r.name?.toLowerCase().includes("_dmarc"),
	);
	if (!rec?.value) return null;
	const m = rec.value.match(/p\s*=\s*(none|quarantine|reject)/i);
	return m ? (m[1]!.toLowerCase() as DmarcPolicy) : null;
}
