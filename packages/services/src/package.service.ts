/**
 * Package Service
 *
 * Handles package listing and get-by-id for tenant organizations.
 * Packages are product definitions; instances are client assignments/purchases.
 *
 * Usage:
 * ```typescript
 * import { listPackages, getPackageById } from "@avantej-core/services";
 * const packages = await listPackages(tenantDb, { branchId, isArchived: false });
 * ```
 */

import { eq, and, asc } from "drizzle-orm";
import { packages } from "@avantej-core/db/schema/tenant/packages";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListPackagesParams = {
  branchId?: string | null;
  appointmentType?: "private" | "semi-private" | "both";
  isArchived?: boolean;
  accessibleNodeIds?: string[];
};

/**
 * List packages, optionally filtered by branch, appointment type, archived status.
 */
export async function listPackages(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListPackagesParams = {}
): Promise<(typeof packages.$inferSelect)[]> {
  const { branchId, appointmentType, isArchived, accessibleNodeIds } = params;

  const conditions = [];
  if (branchId !== undefined && branchId !== null) {
    conditions.push(eq(packages.branchId, branchId));
  }
  if (appointmentType) {
    conditions.push(eq(packages.appointmentType, appointmentType));
  }
  if (isArchived !== undefined) {
    conditions.push(eq(packages.isArchived, isArchived));
  }

  const rows = await tenantDb.query.packages.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [asc(packages.name)],
  });

  if (accessibleNodeIds && accessibleNodeIds.length > 0) {
    return rows.filter(
      (row) => row.branchId === null || accessibleNodeIds.includes(row.branchId)
    );
  }

  return rows;
}

/**
 * Get a package by ID.
 */
export async function getPackageById(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<(typeof packages.$inferSelect) | null> {
  const row = await tenantDb.query.packages.findFirst({
    where: eq(packages.id, id),
  });
  return row ?? null;
}
