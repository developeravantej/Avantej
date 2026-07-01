/**
 * Cloudflare Email Sending — domains wrapper (Phase 3).
 *
 * Mirrors `resend-domains.ts` so the email_domains persistence (dns_records
 * snapshot + status) is unchanged. Onboards a tenant SENDING SUBDOMAIN on a
 * Cloudflare zone that lives in Avantej's account:
 *   POST   /zones/{zone}/email/sending/subdomains        (auto-creates cf-bounce
 *          SPF/DKIM/DMARC/MX)
 *   GET    /zones/{zone}/email/sending/subdomains/{id}    (+ /dns for records)
 *   DELETE /zones/{zone}/email/sending/subdomains/{id}
 *
 * CF has no separate "re-check" verb (it validates DNS continuously), so
 * `verifyCloudflareDomain` is a no-op and the background poll (getDomain) is the
 * authoritative verification path — see cf-domain-status.ts.
 *
 * Env: CLOUDFLARE_API_TOKEN (scope: Email Sending — Edit). The target zone id is
 * passed per call (the router picks it per onboarding tier).
 */

import { mapCfDomainStatus } from "./cf-domain-status";

const CF_API = "https://api.cloudflare.com/client/v4";

/** DNS record shape compatible with the existing (Resend) dns_records snapshot. */
export interface CfDomainRecord {
	record: string;
	name: string;
	type: string;
	value: string;
	ttl?: string;
	priority?: number;
	status?: string;
}

export interface CreateCfDomainResult {
	id: string;
	name: string;
	status: string;
	records: CfDomainRecord[];
}

export interface GetCfDomainResult {
	id: string;
	name: string;
	status: string;
	records?: CfDomainRecord[];
}

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		if (env[key] !== undefined) return env[key];
	} catch {
		/* not in Workers runtime */
	}
	return process.env[key];
}

async function cfRequest(
	path: string,
	init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
	const token = getEnvVar("CLOUDFLARE_API_TOKEN");
	if (!token) {
		throw new Error(
			"CLOUDFLARE_API_TOKEN is required for Cloudflare Email domain onboarding (scope: Email Sending — Edit)",
		);
	}
	const res = await fetch(`${CF_API}${path}`, {
		method: init?.method ?? "GET",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { ok: res.ok, status: res.status, json };
}

function throwOnCfError(label: string, json: Record<string, unknown>): never {
	const errors = json?.errors as Array<{ message?: string }> | undefined;
	const msg = errors?.[0]?.message ?? "unknown error";
	throw new Error(`Cloudflare ${label} failed: ${msg}`);
}

interface CfDnsRecord {
	name?: string;
	content?: string;
	type?: string;
	priority?: number;
	ttl?: number;
}

function mapRecords(raw: unknown): CfDomainRecord[] {
	const list = Array.isArray(raw) ? (raw as CfDnsRecord[]) : [];
	return list.map((r) => ({
		record: r.type ?? "",
		name: r.name ?? "",
		type: r.type ?? "",
		value: (r.content ?? "").replace(/^"|"$/g, ""),
		priority: r.priority,
		ttl: r.ttl != null ? String(r.ttl) : undefined,
	}));
}

async function fetchDns(
	zoneId: string,
	subdomainId: string,
): Promise<CfDomainRecord[]> {
	const dns = await cfRequest(
		`/zones/${zoneId}/email/sending/subdomains/${subdomainId}/dns`,
	);
	return dns.ok ? mapRecords(dns.json?.result) : [];
}

/**
 * Onboard a sending subdomain. The returned `records` are persisted verbatim —
 * for the default `<tenant>.avantej.com` tier CF auto-adds them (nothing for the
 * tenant to do); for delegated/bare tiers the tenant publishes them.
 */
export async function createCloudflareDomain(params: {
	name: string;
	zoneId: string;
}): Promise<CreateCfDomainResult> {
	const created = await cfRequest(
		`/zones/${params.zoneId}/email/sending/subdomains`,
		{ method: "POST", body: { name: params.name } },
	);
	const sub = created.json?.result as
		| { id?: string; name?: string; enabled?: boolean; status?: string }
		| undefined;
	if (!created.ok || !sub?.id)
		throwOnCfError("subdomains.create", created.json);
	const records = await fetchDns(params.zoneId, sub.id as string);
	return {
		id: sub.id as string,
		name: sub.name ?? params.name,
		status: mapCfDomainStatus(sub),
		records,
	};
}

/** Live status + records for a subdomain (poll path — authoritative for verification). */
export async function getCloudflareDomain(
	zoneId: string,
	subdomainId: string,
): Promise<GetCfDomainResult> {
	const r = await cfRequest(
		`/zones/${zoneId}/email/sending/subdomains/${subdomainId}`,
	);
	const sub = r.json?.result as
		| {
				id?: string;
				name?: string;
				enabled?: boolean;
				status?: string;
				dns_records?: Array<{ status?: string }>;
		  }
		| undefined;
	if (!r.ok || !sub?.id) throwOnCfError("subdomains.get", r.json);
	const records = await fetchDns(zoneId, subdomainId);
	return {
		id: sub.id as string,
		name: sub.name ?? "",
		status: mapCfDomainStatus(sub),
		records: records.length ? records : undefined,
	};
}

/** No-op: Cloudflare validates DNS continuously; the poll (getCloudflareDomain) is authoritative. */
export async function verifyCloudflareDomain(): Promise<void> {
	// intentionally empty — kept for interface parity with resend-domains.ts
}

/** Remove a sending subdomain. Not-found is treated as success (row already gone). */
export async function removeCloudflareDomain(
	zoneId: string,
	subdomainId: string,
): Promise<void> {
	const r = await cfRequest(
		`/zones/${zoneId}/email/sending/subdomains/${subdomainId}`,
		{ method: "DELETE" },
	);
	if (r.ok || r.status === 404) return;
	const errors = r.json?.errors as Array<{ message?: string }> | undefined;
	const msg = (errors?.[0]?.message ?? "").toLowerCase();
	if (msg.includes("not found") || msg.includes("does not exist")) return;
	throwOnCfError("subdomains.delete", r.json);
}
