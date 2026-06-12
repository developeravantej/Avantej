/**
 * Plan E E.2 — Tenant Usage Snapshot Service.
 *
 * Daily 01:00 UTC cron computes a usage roll-up per tenant by fanning
 * out to each tenant DB. UPSERTs one row per (organization, date) into
 * the control-panel `tenant_usage_snapshots` table, so re-runs are
 * idempotent.
 *
 * Cross-DB fan-out is bounded at concurrency=5 (ADR-0023) to avoid
 * exhausting Neon connections at scale.
 *
 * Counters per tenant:
 *   - memberCount        — current row count in members
 *   - customerCount      — current row count in customer_profiles
 *   - apptCount30d       — appointments created in trailing 30d
 *   - salesTotal30dMinor — sum(amount) of payments status=succeeded, trailing 30d
 *   - storageBytes       — 0 in v1 (requires pg_database_size — defer)
 *   - ghlActive          — organizations.ghlProvisionedAt IS NOT NULL
 */

import { sql, eq, gte, and, desc, isNotNull, or } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel/platform-payment-ledger";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { computeHealthScore } from "@avantej-core/services/health-score";

const DEFAULT_CONCURRENCY = 5;

export interface SnapshotReport {
	snapshotDate: string;
	orgsScanned: number;
	written: number;
	errors: number;
	durationMs: number;
}

interface SnapshotDeps {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	getTenantDb: (
		organizationId: string,
	) => Promise<NeonDatabase<typeof tenantSchema>>;
	now?: Date;
	concurrency?: number;
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

async function pMap<T, U>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<U>,
): Promise<U[]> {
	const results: U[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (true) {
				const i = cursor++;
				if (i >= items.length) return;
				results[i] = await fn(items[i] as T);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

async function snapshotOne(
	deps: SnapshotDeps,
	org: {
		id: string;
		ghlProvisionedAt: Date | null;
		paymentStatus: string | null;
	},
	snapshotDate: string,
	thirtyDaysAgo: Date,
	now: Date,
): Promise<{ ok: boolean; error?: string }> {
	try {
		// Tolerant tenant DB open — if the tenant DB is unreachable we still
		// write a snapshot row with degraded counts so the cron run as a
		// whole succeeds. Per ADR-0036 / Plan F.6 Sn.
		let tenantDb: Awaited<ReturnType<typeof deps.getTenantDb>> | null;
		try {
			tenantDb = await deps.getTenantDb(org.id);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(
				`[tenant-usage-snapshot] tenant DB unavailable org=${org.id}: ${msg}`,
			);
			tenantDb = null;
		}

		// Plan F.1.5 — most recent successful SaaS-revenue ledger event.
		// Used by computeHealthScore for payment-recency factor.
		const [lastPayRow] = await deps.controlPanelDb
			.select({ occurredAt: platformPaymentLedger.occurredAt })
			.from(platformPaymentLedger)
			.where(
				and(
					eq(platformPaymentLedger.organizationId, org.id),
					eq(platformPaymentLedger.eventKind, "saas_invoice_paid"),
				),
			)
			.orderBy(desc(platformPaymentLedger.occurredAt))
			.limit(1);
		const lastSuccessfulPaymentAt = lastPayRow?.occurredAt ?? null;

		// Plan F.6 — Factor 4: most recent admin login for this org.
		// Joins organization_members (role=admin) → user.last_login_at
		// and takes the max. NULL if no admin has ever logged in (or no
		// admin members exist). Tenant-side admin login tracking is a
		// Plan G+ concern once tenants self-serve.
		const [lastLoginRow] = (await deps.controlPanelDb
			.select({
				lastLoginAt: sql<Date | null>`MAX(${userTable.lastLoginAt})`,
			})
			.from(organizationMembers)
			.innerJoin(userTable, eq(userTable.id, organizationMembers.userId))
			.where(
				and(
					eq(organizationMembers.organizationId, org.id),
					eq(organizationMembers.role, "admin"),
				),
			)) as [{ lastLoginAt: Date | null }];
		const lastAdminLoginAt = lastLoginRow?.lastLoginAt ?? null;

		// Plan F.6 — Factor 5: failed Stripe webhooks in the last 7 days.
		// processed_webhook_events does NOT carry organization_id today,
		// so this is a GLOBAL count — every org receives the same value.
		// Acknowledged trade-off: a populated-but-coarse signal beats
		// emitting `no_data` from the formula. TODO: thread org_id through
		// the webhook pipeline (Plan G).
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const [webhookRow] = (await deps.controlPanelDb
			.select({ c: sql<number>`count(*)::int` })
			.from(processedWebhookEvents)
			.where(
				and(
					eq(processedWebhookEvents.source, "stripe"),
					gte(processedWebhookEvents.receivedAt, sevenDaysAgo),
					or(
						sql`${processedWebhookEvents.processedAt} IS NULL AND ${processedWebhookEvents.attempts} > 1`,
						and(
							isNotNull(processedWebhookEvents.error),
							sql`${processedWebhookEvents.attempts} > 1`,
						),
					),
				),
			)) as [{ c: number }];
		const failedWebhooks7d = webhookRow?.c ?? 0;

		// Plan F.6 — Factor 3: daily-active members trailing 30d average.
		// Tenant `members` table has no last_active_at column today; we
		// can't compute a real DAM30. Write null so the formula emits a
		// targeted `no_data` flag for the Activity factor only (other 4
		// factors still score). TODO: add member activity tracking.
		const dailyActiveMembers30dAvg: number | null = null;

		let memberCount = 0;
		let customerCount = 0;
		let apptCount30d = 0;
		let salesRow: { total: number; currency: string | null } = {
			total: 0,
			currency: null,
		};

		if (tenantDb) {
			const mRows = (await tenantDb
				.select({ c: sql<number>`count(*)::int` })
				.from(members)) as [{ c: number }];
			memberCount = mRows[0].c;

			const cRows = (await tenantDb
				.select({ c: sql<number>`count(*)::int` })
				.from(customerProfiles)) as [{ c: number }];
			customerCount = cRows[0].c;

			const aRows = (await tenantDb
				.select({ c: sql<number>`count(*)::int` })
				.from(appointments)
				.where(gte(appointments.createdAt, thirtyDaysAgo))) as [{ c: number }];
			apptCount30d = aRows[0].c;

			const sRows = (await tenantDb
				.select({
					total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`,
					currency: sql<string>`MIN(${payments.currency})`,
				})
				.from(payments)
				.where(
					and(
						eq(payments.status, "succeeded"),
						gte(payments.createdAt, thirtyDaysAgo),
					),
				)) as [{ total: number; currency: string | null }];
			salesRow = sRows[0];
		}

		// Plan F.6 (Agent Sn) — all 5 factors now wired. Activity factor
		// stays `no_data` until tenant member-activity tracking lands.
		const health = computeHealthScore({
			memberCount,
			customerCount,
			apptCount30d,
			salesTotal30dMinor: salesRow.total,
			ghlActive: org.ghlProvisionedAt !== null,
			paymentStatus: org.paymentStatus,
			lastSuccessfulPaymentAt,
			lastAdminLoginAt,
			failedWebhooks7d,
			dailyActiveMembers30dAvg,
			now,
		});

		// Build the non-key columns once so the insert .values and the conflict
		// .set cannot drift. Previously storageBytes was in .values but missing
		// from .set, so it was silently not updated on an UPSERT (B7).
		const factors = {
			memberCount,
			customerCount,
			apptCount30d,
			salesTotal30dMinor: salesRow.total,
			salesCurrency: (salesRow.currency ?? "MYR").toUpperCase(),
			storageBytes: 0,
			ghlActive: org.ghlProvisionedAt !== null,
			healthScore: health.score,
			riskFlags: health.flags,
			lastAdminLoginAt,
			failedWebhooks7d,
			dailyActiveMembers30dAvg,
		};

		await deps.controlPanelDb
			.insert(tenantUsageSnapshots)
			.values({ organizationId: org.id, snapshotDate, ...factors })
			.onConflictDoUpdate({
				target: [
					tenantUsageSnapshots.organizationId,
					tenantUsageSnapshots.snapshotDate,
				],
				set: factors,
			});

		return { ok: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[tenant-usage-snapshot] org=${org.id} failed:`, msg);
		return { ok: false, error: msg };
	}
}

export async function runTenantUsageSnapshots(
	deps: SnapshotDeps,
): Promise<SnapshotReport> {
	const t0 = Date.now();
	const now = deps.now ?? new Date();
	const snapshotDate = isoDate(now);
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;

	const orgs = await deps.controlPanelDb
		.select({
			id: organizations.id,
			ghlProvisionedAt: organizations.ghlProvisionedAt,
			paymentStatus: organizations.paymentStatus,
		})
		.from(organizations);

	const results = await pMap(orgs, concurrency, (o) =>
		snapshotOne(deps, o, snapshotDate, thirtyDaysAgo, now),
	);

	const errors = results.filter((r) => !r.ok).length;

	return {
		snapshotDate,
		orgsScanned: orgs.length,
		written: results.length - errors,
		errors,
		durationMs: Date.now() - t0,
	};
}
