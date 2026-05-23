/**
 * Multi-tenant installment sweep — fires daily at 02:00 UTC.
 *
 * Replaces the Phase 4 stub at apps/server/src/index.ts. Iterates every
 * active org, scans its tenant DB for `package_instances` rows that are
 * candidates for lock-evaluation (status='active', on an installment plan,
 * not yet locked, with a nextDueDate), and calls the existing
 * `evaluateAndLockIfOverdue` service on each. That service is idempotent
 * and handles both grace-period transition and lock decisions internally.
 *
 * Pattern matches `runScheduledReports` in scheduled-reports.service.ts:
 * loop orgs from the control panel, skip dead ones, accumulate a per-run
 * report. Per-row failures are logged + counted but never kill the batch.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { evaluateAndLockIfOverdue } from "@avantej-core/services";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { and, eq, isNotNull, lte } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface InstallmentSweepReport {
	orgsScanned: number;
	candidatesFound: number;
	locked: number;
	skipped: number;
	errors: number;
}

export interface RunInstallmentSweepArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	now?: Date;
}

export async function runInstallmentSweep(
	args: RunInstallmentSweepArgs,
): Promise<InstallmentSweepReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();

	const report: InstallmentSweepReport = {
		orgsScanned: 0,
		candidatesFound: 0,
		locked: 0,
		skipped: 0,
		errors: 0,
	};

	const orgs = await controlPanelDb
		.select({
			id: organizations.id,
			name: organizations.name,
		})
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;

			// Find candidates: active packages on an installment plan with a
			// nextDueDate that is on-or-before "now". The service-level lock
			// evaluator handles grace-period nuance — we just feed it
			// anything that could plausibly trip.
			const candidates = await tenantDb
				.select({ id: packageInstances.id })
				.from(packageInstances)
				.where(
					and(
						eq(packageInstances.status, "active"),
						eq(packageInstances.isLocked, false),
						isNotNull(packageInstances.paymentPlanType),
						isNotNull(packageInstances.nextDueDate),
						lte(packageInstances.nextDueDate, now),
					),
				);

			report.candidatesFound += candidates.length;

			for (const c of candidates) {
				try {
					const pkg = await evaluateAndLockIfOverdue(tenantDb, c.id);
					if (pkg.isLocked) {
						report.locked++;
					} else {
						report.skipped++;
					}
				} catch (rowErr) {
					report.errors++;
					console.error(
						`[installment-sweep] org=${org.id} pkg=${c.id} evaluate failed:`,
						rowErr instanceof Error ? rowErr.message : String(rowErr),
					);
				}
			}
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[installment-sweep] org=${org.id} top-level error:`,
				orgErr,
			);
		}
	}

	return report;
}
