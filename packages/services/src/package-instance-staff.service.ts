/**
 * Package Instance Staff Service
 *
 * Manages staff assignments to package instances.
 * staffId values are members.userId (control-panel UUIDs), not members.id.
 *
 * Business rules:
 * - Slot 0 is the primary trainer (mirrors package_instances.assignedTrainerId).
 * - UPSERT on (packageInstanceId, slotIndex) — slot 0 may already exist from the
 *   approval flow; overwriting is correct behavior.
 * - One staff member can only be assigned once per package instance.
 */

import { eq, and } from "drizzle-orm";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type PackageInstanceStaffRow = typeof packageInstanceStaff.$inferSelect;

export type AssignPackageInstanceStaffParams = {
	packageInstanceId: string;
	staffId: string; // members.userId
	slotIndex: number;
	role?: string;
	assignedBy?: string; // members.userId of the actor
};

export type ReplacePackageInstanceStaffParams = {
	packageInstanceId: string;
	assignments: { staffId: string; slotIndex: number; role?: string }[];
	assignedBy?: string;
};

/**
 * List all staff assignments for a package instance.
 */
export async function listPackageInstanceStaff(
	tenantDb: TenantDb,
	packageInstanceId: string,
): Promise<PackageInstanceStaffRow[]> {
	return tenantDb
		.select()
		.from(packageInstanceStaff)
		.where(eq(packageInstanceStaff.packageInstanceId, packageInstanceId))
		.orderBy(packageInstanceStaff.slotIndex);
}

/**
 * Assign (or update) a staff member to a slot on a package instance.
 * Uses ON CONFLICT DO UPDATE semantics for the (packageInstanceId, slotIndex) unique index.
 * If the same staffId is already in a different slot on this package, throws a unique violation.
 */
export async function assignPackageInstanceStaff(
	tenantDb: TenantDb,
	params: AssignPackageInstanceStaffParams,
): Promise<PackageInstanceStaffRow> {
	// Verify package instance exists
	const [pkg] = await tenantDb
		.select({ id: packageInstances.id })
		.from(packageInstances)
		.where(eq(packageInstances.id, params.packageInstanceId))
		.limit(1);

	if (!pkg) {
		throw new Error("Package instance not found");
	}

	// UPSERT: if (packageInstanceId, slotIndex) exists, update staffId/role/assignedBy/assignedAt.
	const [row] = await tenantDb
		.insert(packageInstanceStaff)
		.values({
			packageInstanceId: params.packageInstanceId,
			staffId: params.staffId,
			slotIndex: params.slotIndex,
			role: params.role ?? "trainer",
			assignedBy: params.assignedBy ?? null,
			assignedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [
				packageInstanceStaff.packageInstanceId,
				packageInstanceStaff.slotIndex,
			],
			set: {
				staffId: params.staffId,
				role: params.role ?? "trainer",
				assignedBy: params.assignedBy ?? null,
				assignedAt: new Date(),
			},
		})
		.returning();

	if (!row) {
		throw new Error("Failed to assign staff to package instance");
	}

	return row;
}

/**
 * Remove a specific staff assignment from a package instance.
 * Identifies by (packageInstanceId, staffId).
 */
export async function removePackageInstanceStaff(
	tenantDb: TenantDb,
	packageInstanceId: string,
	staffId: string,
): Promise<void> {
	await tenantDb
		.delete(packageInstanceStaff)
		.where(
			and(
				eq(packageInstanceStaff.packageInstanceId, packageInstanceId),
				eq(packageInstanceStaff.staffId, staffId),
			),
		);
}

/**
 * Replace ALL staff assignments for a package instance in a single atomic operation.
 * Deletes existing rows then inserts the new set.
 * Guards against empty assignments array to avoid Drizzle inArray([]) crash.
 */
export async function replacePackageInstanceStaff(
	tenantDb: TenantDb,
	params: ReplacePackageInstanceStaffParams,
): Promise<PackageInstanceStaffRow[]> {
	// Verify package instance exists
	const [pkg] = await tenantDb
		.select({ id: packageInstances.id })
		.from(packageInstances)
		.where(eq(packageInstances.id, params.packageInstanceId))
		.limit(1);

	if (!pkg) {
		throw new Error("Package instance not found");
	}

	return tenantDb.transaction(async (tx) => {
		// Delete all existing assignments
		await tx
			.delete(packageInstanceStaff)
			.where(
				eq(packageInstanceStaff.packageInstanceId, params.packageInstanceId),
			);

		if (params.assignments.length === 0) {
			return [];
		}

		const rows = await tx
			.insert(packageInstanceStaff)
			.values(
				params.assignments.map((a) => ({
					packageInstanceId: params.packageInstanceId,
					staffId: a.staffId,
					slotIndex: a.slotIndex,
					role: a.role ?? "trainer",
					assignedBy: params.assignedBy ?? null,
					assignedAt: new Date(),
				})),
			)
			.returning();

		return rows;
	});
}
