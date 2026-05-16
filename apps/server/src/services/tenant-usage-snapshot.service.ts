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

import { sql, eq, gte, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { payments } from "@avantej-core/db/schema/tenant/payments";

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
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (true) {
			const i = cursor++;
			if (i >= items.length) return;
			results[i] = await fn(items[i] as T);
		}
	});
	await Promise.all(workers);
	return results;
}

async function snapshotOne(
	deps: SnapshotDeps,
	org: {
		id: string;
		ghlProvisionedAt: Date | null;
	},
	snapshotDate: string,
	thirtyDaysAgo: Date,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const tenantDb = await deps.getTenantDb(org.id);

		const [{ c: memberCount }] = (await tenantDb
			.select({ c: sql<number>`count(*)::int` })
			.from(members)) as [{ c: number }];

		const [{ c: customerCount }] = (await tenantDb
			.select({ c: sql<number>`count(*)::int` })
			.from(customerProfiles)) as [{ c: number }];

		const [{ c: apptCount30d }] = (await tenantDb
			.select({ c: sql<number>`count(*)::int` })
			.from(appointments)
			.where(gte(appointments.createdAt, thirtyDaysAgo))) as [{ c: number }];

		const [salesRow] = (await tenantDb
			.select({
				total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`,
				currency: sql<string>`MIN(${payments.currency})`,
			})
			.from(payments)
			.where(
				and(eq(payments.status, "succeeded"), gte(payments.createdAt, thirtyDaysAgo)),
			)) as [{ total: number; currency: string | null }];

		await deps.controlPanelDb
			.insert(tenantUsageSnapshots)
			.values({
				organizationId: org.id,
				snapshotDate,
				memberCount,
				customerCount,
				apptCount30d,
				salesTotal30dMinor: salesRow.total,
				salesCurrency: (salesRow.currency ?? "MYR").toUpperCase(),
				storageBytes: 0,
				ghlActive: org.ghlProvisionedAt !== null,
			})
			.onConflictDoUpdate({
				target: [tenantUsageSnapshots.organizationId, tenantUsageSnapshots.snapshotDate],
				set: {
					memberCount,
					customerCount,
					apptCount30d,
					salesTotal30dMinor: salesRow.total,
					salesCurrency: (salesRow.currency ?? "MYR").toUpperCase(),
					ghlActive: org.ghlProvisionedAt !== null,
				},
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
		})
		.from(organizations);

	const results = await pMap(orgs, concurrency, (o) =>
		snapshotOne(deps, o, snapshotDate, thirtyDaysAgo),
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
