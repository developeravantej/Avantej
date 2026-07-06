/**
 * Multi-tenant incentive sweep — folded into the daily 02:00 UTC slot.
 *
 * For every active org, evaluates that tenant's commission-incentive rules for
 * the PREVIOUS calendar month and awards bonuses to qualifying staff. The
 * previous (closed) month is used so percentage bonuses are computed on the full
 * month's volume, not a mid-month partial.
 *
 * Idempotent: `evaluateIncentivesForPeriod` inserts awards ON CONFLICT DO
 * NOTHING against UNIQUE(incentive_id, staff_id, period_key), so running this
 * every day re-creates nothing after the first post-month-end run.
 *
 * Pattern matches `runInstallmentSweep`: loop orgs from the control panel, skip
 * dead ones, accumulate a per-run report; per-tenant failures are logged +
 * counted but never kill the batch.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { evaluateIncentivesForPeriod } from "@avantej-core/services";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface IncentiveSweepReport {
	periodKey: string;
	orgsScanned: number;
	rulesEvaluated: number;
	awardsCreated: number;
	errors: number;
}

export interface RunIncentiveSweepArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	/** Override "now" for tests. */
	now?: Date;
}

/** First/last instant of the calendar month BEFORE `now` (UTC). */
export function previousMonthWindow(now: Date): {
	periodStart: Date;
	periodEnd: Date;
	periodKey: string;
} {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth(); // 0-based, current month
	// First day of last month.
	const periodStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
	// Last instant of last month = day 0 of current month.
	const periodEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
	const pk = `${periodStart.getUTCFullYear()}-${String(
		periodStart.getUTCMonth() + 1,
	).padStart(2, "0")}`;
	return { periodStart, periodEnd, periodKey: pk };
}

export async function runIncentiveSweep(
	args: RunIncentiveSweepArgs,
): Promise<IncentiveSweepReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();
	const { periodStart, periodEnd, periodKey } = previousMonthWindow(now);

	const report: IncentiveSweepReport = {
		periodKey,
		orgsScanned: 0,
		rulesEvaluated: 0,
		awardsCreated: 0,
		errors: 0,
	};

	const orgs = await controlPanelDb
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;
			const r = await evaluateIncentivesForPeriod(tenantDb, {
				periodStart,
				periodEnd,
				periodKey,
			});
			report.rulesEvaluated += r.rulesEvaluated;
			report.awardsCreated += r.awardsCreated;
		} catch (orgErr) {
			report.errors++;
			console.error(`[incentive-sweep] org=${org.id} failed:`, orgErr);
		}
	}

	return report;
}
