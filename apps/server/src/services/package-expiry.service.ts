/**
 * Multi-tenant package-expiry sweep — fires daily at 02:00 UTC alongside the
 * installment sweep (F-SALE-08).
 *
 * Iterates every active org and, per tenant, calls the idempotent
 * `expireOverduePackageInstances` service which transitions
 * `package_instances` rows from status='active' to 'expired' once their
 * `expiresAt` has passed. Frozen and already-terminal rows are left alone by
 * the service's WHERE clause.
 *
 * Pattern matches `runInstallmentSweep` in installment-sweep.service.ts: loop
 * orgs from the control panel, skip dead ones, accumulate a per-run report.
 * A per-org failure is logged + counted but never kills the batch.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { expireOverduePackageInstances } from "@avantej-core/services";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface PackageExpiryReport {
	orgsScanned: number;
	expired: number;
	errors: number;
}

export interface RunPackageExpirySweepArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	now?: Date;
}

export async function runPackageExpirySweep(
	args: RunPackageExpirySweepArgs,
): Promise<PackageExpiryReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();

	const report: PackageExpiryReport = {
		orgsScanned: 0,
		expired: 0,
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
			const expired = await expireOverduePackageInstances(tenantDb, now);
			report.expired += expired;
		} catch (orgErr) {
			report.errors++;
			console.error(`[package-expiry] org=${org.id} top-level error:`, orgErr);
		}
	}

	return report;
}
