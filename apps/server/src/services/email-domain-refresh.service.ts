/**
 * Email sending-domain refresh job
 *
 * Background sweep that re-polls the sending provider (Resend or Cloudflare,
 * per row) for every sending-domain row still mid-verification (status
 * pending/verifying) and advances the DB row when DNS propagation has changed
 * the live status. Without this, a tenant who publishes their DNS records only
 * ever sees `verified` if they manually click "Verify now" — this closes that
 * gap automatically.
 *
 * Dispatched from the `scheduled` handler in src/index.ts (ADR-0021 — CF Cron).
 * Bounded per run (default 50 rows, oldest-updated first) to cap the provider
 * API fan-out; the next tick drains the rest.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	listStaleEmailDomains,
	updateEmailDomainStatus,
} from "@avantej-core/services/email-domain.service";
import { getResendDomain, verifyResendDomain } from "@/lib/resend-domains";
import { getCloudflareDomain } from "@/lib/cloudflare-domains";
import type { EmailDomainStatus } from "@/lib/cf-domain-status";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface RunEmailDomainRefreshParams {
	controlPanelDb: ControlPanelDb;
	/** Max rows to poll this run. Default 50. */
	limit?: number;
}

export interface EmailDomainRefreshResult {
	checked: number;
	updated: number;
	failed: number;
}

/**
 * Map Resend's domain.status enum to our internal email_domains.status.
 * Kept in sync with the same mapping in routers/email-domains.ts.
 */
function mapResendStatus(
	resendStatus: string,
): "pending" | "verifying" | "verified" | "failed" {
	switch (resendStatus) {
		case "verified":
			return "verified";
		case "failed":
		case "temporary_failure":
			return "failed";
		case "pending":
		case "not_started":
			return "pending";
		default:
			return "verifying";
	}
}

export async function runEmailDomainRefresh(
	params: RunEmailDomainRefreshParams,
): Promise<EmailDomainRefreshResult> {
	const { controlPanelDb, limit = 50 } = params;

	const stale = await listStaleEmailDomains(controlPanelDb, {
		statuses: ["pending", "verifying"],
		limit,
	});

	let updated = 0;
	let failed = 0;

	for (const row of stale) {
		try {
			let mapped: EmailDomainStatus;
			let liveRecords: unknown;

			if (row.provider === "cloudflare") {
				// CF validates DNS continuously — no re-check verb; the poll is
				// authoritative. Skip rows missing CF identity (shouldn't happen).
				if (!row.cfZoneId || !row.cfSubdomainId) continue;
				const live = await getCloudflareDomain(row.cfZoneId, row.cfSubdomainId);
				mapped = live.status as EmailDomainStatus;
				liveRecords = live.records;
			} else {
				if (!row.resendDomainId) continue;
				// Nudge Resend to re-check DNS (idempotent), then read authoritative
				// status. A verify failure is non-fatal — we still read live status.
				await verifyResendDomain(row.resendDomainId).catch(() => {});
				const live = await getResendDomain(row.resendDomainId);
				mapped = mapResendStatus(live.status);
				liveRecords = live.records;
			}

			if (mapped !== row.status) {
				await updateEmailDomainStatus(controlPanelDb, {
					id: row.id,
					status: mapped,
					dnsRecords: liveRecords ?? undefined,
				});
				updated += 1;
			}
		} catch (e) {
			failed += 1;
			console.error(
				`[email-domain-refresh] failed for domain=${row.domain} id=${row.id}:`,
				e instanceof Error ? e.message : e,
			);
		}
	}

	return { checked: stale.length, updated, failed };
}
