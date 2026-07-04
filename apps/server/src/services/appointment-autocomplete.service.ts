/**
 * WS4 (MOVE parity) — multi-tenant appointment auto-complete sweep.
 *
 * Folded into the existing hourly cron (appointments end continuously through
 * the day). Iterates every active org and, per tenant, calls the idempotent
 * `autoCompleteOverdueAppointments` service which transitions `confirmed`
 * appointments whose window has closed to `completed` THROUGH
 * `updateAppointment` (so commission + audit still fire).
 *
 * Pattern matches `runPackageExpirySweep`: loop orgs from the control panel,
 * skip dead ones, accumulate a per-run report. A per-org failure is logged +
 * counted but never kills the batch.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { autoCompleteOverdueAppointments } from "@avantej-core/services";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface AppointmentAutoCompleteReport {
	orgsScanned: number;
	completed: number;
	skipped: number;
	errors: number;
}

export interface RunAppointmentAutoCompleteArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	now?: Date;
}

export async function runAppointmentAutoComplete(
	args: RunAppointmentAutoCompleteArgs,
): Promise<AppointmentAutoCompleteReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();

	const report: AppointmentAutoCompleteReport = {
		orgsScanned: 0,
		completed: 0,
		skipped: 0,
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
			const res = await autoCompleteOverdueAppointments(tenantDb, now);
			report.completed += res.completed;
			report.skipped += res.skipped;
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[appointment-autocomplete] org=${org.id} top-level error:`,
				orgErr,
			);
		}
	}

	return report;
}
