/**
 * Customer Name Snapshot Service
 *
 * Keeps the denormalized `customer_name` columns on appointments + package_instances
 * in sync with the canonical control-panel `user.name`, for read-scaling (lists avoid
 * a cross-DB name lookup).
 *
 * Two operations:
 *   1. propagateCustomerNameForward — called whenever a customer is renamed. Updates
 *      the snapshot on FORWARD-FACING records only (upcoming/recurring appointments,
 *      active-ish packages). Historical + financial records stay frozen.
 *   2. refreshCustomerNameSnapshots / runCustomerNameRefresh — a periodic catch-all
 *      (cron) that re-resolves forward-facing snapshots from the live user table and
 *      overwrites any that have drifted. Heals divergence from rename paths that
 *      bypass propagate (e.g. GHL sync, bulk imports) or from a failed propagate.
 *
 * Status sets (single source of truth):
 *   - appointments: forward-facing = status IN ('pending','confirmed') AND
 *     (start_time >= now OR is_recurring) — recurring parents carry a past start
 *     date but generate future occurrences, so they must be included.
 *   - packages: current = status IN ('active','pending','paused','frozen').
 *     'paused'/'frozen' are memberships on hold — still current, must update.
 */

import { and, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { user } from "@avantej-core/db/schema/auth";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

const FORWARD_APPOINTMENT_STATUSES = ["pending", "confirmed"] as const;
const CURRENT_PACKAGE_STATUSES = [
	"active",
	"pending",
	"paused",
	"frozen",
] as const;

/** WHERE: forward-facing appointments for a client (upcoming OR recurring, still-open status). */
function forwardAppointmentsWhere(userId: string, now: Date) {
	return and(
		eq(appointments.userId, userId),
		inArray(appointments.status, [...FORWARD_APPOINTMENT_STATUSES]),
		// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
		or(gte(appointments.startTime, now), eq(appointments.isRecurring, true))!,
	);
}

/** WHERE: current (non-historical) packages for a client. */
function currentPackagesWhere(userId: string) {
	return and(
		eq(packageInstances.clientId, userId),
		inArray(packageInstances.status, [...CURRENT_PACKAGE_STATUSES]),
	);
}

/**
 * Push a renamed customer's new name onto their forward-facing records.
 * Best-effort by contract: callers should not let a failure here fail the rename;
 * the refresh cron will heal any miss.
 */
export async function propagateCustomerNameForward(
	tenantDb: TenantDb,
	userId: string,
	newName: string,
): Promise<{ appointments: number; packages: number }> {
	const now = new Date();
	const [apptRes, pkgRes] = await Promise.all([
		tenantDb
			.update(appointments)
			.set({ customerName: newName })
			.where(forwardAppointmentsWhere(userId, now))
			.returning({ id: appointments.id }),
		tenantDb
			.update(packageInstances)
			.set({ customerName: newName })
			.where(currentPackagesWhere(userId))
			.returning({ id: packageInstances.id }),
	]);
	return { appointments: apptRes.length, packages: pkgRes.length };
}

/**
 * Re-resolve forward-facing snapshots for ONE tenant from the live user table and
 * overwrite any that have drifted. Only writes rows whose snapshot differs from the
 * current name, so a no-op run does no writes.
 */
export async function refreshTenantCustomerNameSnapshots(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
): Promise<{ appointments: number; packages: number }> {
	const now = new Date();

	// Forward-facing rows that already carry a snapshot (drift candidates).
	const [apptRows, pkgRows] = await Promise.all([
		tenantDb
			.select({
				id: appointments.id,
				userId: appointments.userId,
				snapshot: appointments.customerName,
			})
			.from(appointments)
			.where(
				and(
					isNotNull(appointments.customerName),
					isNotNull(appointments.userId),
					inArray(appointments.status, [...FORWARD_APPOINTMENT_STATUSES]),
					// biome-ignore lint/style/noNonNullAssertion: or() is never undefined here
					or(
						gte(appointments.startTime, now),
						eq(appointments.isRecurring, true),
					)!,
				),
			),
		tenantDb
			.select({
				id: packageInstances.id,
				clientId: packageInstances.clientId,
				snapshot: packageInstances.customerName,
			})
			.from(packageInstances)
			.where(
				and(
					isNotNull(packageInstances.customerName),
					isNotNull(packageInstances.clientId),
					inArray(packageInstances.status, [...CURRENT_PACKAGE_STATUSES]),
				),
			),
	]);

	const userIds = [
		...new Set([
			...apptRows.map((r) => r.userId).filter((v): v is string => !!v),
			...pkgRows.map((r) => r.clientId).filter((v): v is string => !!v),
		]),
	];
	if (userIds.length === 0) return { appointments: 0, packages: 0 };

	// Batch-resolve current names.
	const nameMap = new Map<string, string>();
	const CHUNK = 500;
	for (let i = 0; i < userIds.length; i += CHUNK) {
		const slice = userIds.slice(i, i + CHUNK);
		const rows = await controlPanelDb
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(inArray(user.id, slice));
		for (const r of rows) nameMap.set(r.id, r.name);
	}

	// Group drifted appointment IDs by the correct name → one UPDATE per name.
	let apptUpdated = 0;
	const apptByName = new Map<string, string[]>();
	for (const r of apptRows) {
		const current = r.userId ? nameMap.get(r.userId) : undefined;
		if (current && current !== r.snapshot) {
			(
				apptByName.get(current) ?? apptByName.set(current, []).get(current)!
			).push(r.id);
		}
	}
	for (const [name, ids] of apptByName) {
		for (let i = 0; i < ids.length; i += CHUNK) {
			const slice = ids.slice(i, i + CHUNK);
			await tenantDb
				.update(appointments)
				.set({ customerName: name })
				.where(inArray(appointments.id, slice));
			apptUpdated += slice.length;
		}
	}

	let pkgUpdated = 0;
	const pkgByName = new Map<string, string[]>();
	for (const r of pkgRows) {
		const current = r.clientId ? nameMap.get(r.clientId) : undefined;
		if (current && current !== r.snapshot) {
			(pkgByName.get(current) ?? pkgByName.set(current, []).get(current)!).push(
				r.id,
			);
		}
	}
	for (const [name, ids] of pkgByName) {
		for (let i = 0; i < ids.length; i += CHUNK) {
			const slice = ids.slice(i, i + CHUNK);
			await tenantDb
				.update(packageInstances)
				.set({ customerName: name })
				.where(inArray(packageInstances.id, slice));
			pkgUpdated += slice.length;
		}
	}

	return { appointments: apptUpdated, packages: pkgUpdated };
}

/**
 * Cron entry point: refresh drifted snapshots across all tenants. Mirrors the
 * shape of the other multi-tenant sweep services so it can be dispatched from the
 * scheduled handler.
 */
export async function runCustomerNameRefresh(deps: {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
}): Promise<{ tenants: number; appointments: number; packages: number }> {
	const orgs = await deps.controlPanelDb.query.organizations.findMany({
		columns: { id: true },
	});

	let appointmentsTotal = 0;
	let packagesTotal = 0;
	let tenantsProcessed = 0;

	for (const org of orgs) {
		try {
			const tenantDb = (await deps.getTenantDb(org.id)) as TenantDb;
			const res = await refreshTenantCustomerNameSnapshots(
				tenantDb,
				deps.controlPanelDb,
			);
			appointmentsTotal += res.appointments;
			packagesTotal += res.packages;
			tenantsProcessed += 1;
		} catch {
			// Per-tenant failure must not abort the sweep.
		}
	}

	return {
		tenants: tenantsProcessed,
		appointments: appointmentsTotal,
		packages: packagesTotal,
	};
}
