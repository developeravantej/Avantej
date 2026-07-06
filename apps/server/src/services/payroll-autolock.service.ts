/**
 * Multi-tenant payroll-period auto-lock sweep — fires daily at 02:00 UTC
 * alongside the installment + package-expiry sweeps (WS5).
 *
 * Iterates every active org and, per tenant, calls the idempotent
 * `autoLockDuePeriods` service which scans each branch's most recent closed
 * payroll cycle and locks it once the grace window (default 2 days) has
 * elapsed. Already-locked periods are left alone by the service's own guard.
 *
 * Pattern matches `runPackageExpirySweep` in package-expiry.service.ts: loop
 * orgs from the control panel, skip dead ones, accumulate a per-run report.
 * A per-org failure is logged + counted but never kills the batch.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { autoLockDuePeriods } from "@avantej-core/services";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface PayrollAutoLockReport {
	orgsScanned: number;
	branchesScanned: number;
	locked: number;
	errors: number;
}

export interface RunPayrollAutoLockArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	now?: Date;
}

export async function runPayrollAutoLock(
	args: RunPayrollAutoLockArgs,
): Promise<PayrollAutoLockReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();

	const report: PayrollAutoLockReport = {
		orgsScanned: 0,
		branchesScanned: 0,
		locked: 0,
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
			const result = await autoLockDuePeriods(tenantDb, now);
			report.branchesScanned += result.branchesScanned;
			report.locked += result.locked;
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[payroll-autolock] org=${org.id} top-level error:`,
				orgErr,
			);
		}
	}

	return report;
}
