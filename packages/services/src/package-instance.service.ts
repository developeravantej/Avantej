/**
 * Package Instance Service
 *
 * Handles package instance CRUD for tenant organizations.
 * Instances represent client assignments or purchases of packages.
 *
 * Usage:
 * ```typescript
 * import { listPackageInstancesForClient, createPackageInstance } from "@avantej-core/services";
 * const instances = await listPackageInstancesForClient(tenantDb, { clientId, status: "active" });
 * ```
 */

import { eq, and, asc } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListPackageInstancesForClientParams = {
  clientId: string;
  status?: string;
  source?: "assigned" | "purchased";
  limit?: number;
};

export type CreatePackageInstanceParams = {
  serviceId: string;
  clientId: string;
  source: "assigned" | "purchased";
  assignedBy?: string | null;
  purchaseNumber?: string | null;
  paymentId?: string | null;
  totalPrice?: number | null;
  taxAmount?: number;
  paymentStatus?: string;
  paymentMethod?: string | null;
  eSignature?: string | null;
  termsAgreedAt?: Date | null;
  creditsTotal: number;
  creditsRemaining: number;
  creditsUsed?: number;
  startsAt: Date;
  expiresAt: Date;
  status?: string;
  remark?: string | null;
};

/**
 * List package instances for a client (user_id from Control Panel).
 */
export async function listPackageInstancesForClient(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListPackageInstancesForClientParams
): Promise<(typeof packageInstances.$inferSelect)[]> {
  const { clientId, status, source, limit = 50 } = params;

  const conditions = [eq(packageInstances.clientId, clientId)];
  if (status) {
    conditions.push(eq(packageInstances.status, status));
  }
  if (source) {
    conditions.push(eq(packageInstances.source, source));
  }

  return tenantDb.query.packageInstances.findMany({
    where: and(...conditions),
    orderBy: [asc(packageInstances.createdAt)],
    limit: Math.min(limit, 200),
  });
}

/**
 * Get a package instance by ID.
 */
export async function getPackageInstanceById(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<(typeof packageInstances.$inferSelect) | null> {
  const row = await tenantDb.query.packageInstances.findFirst({
    where: eq(packageInstances.id, id),
  });
  return row ?? null;
}

/**
 * Create a package instance.
 */
export async function createPackageInstance(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: CreatePackageInstanceParams
): Promise<typeof packageInstances.$inferSelect> {
  const [row] = await tenantDb
    .insert(packageInstances)
    .values({
      serviceId: params.serviceId,
      clientId: params.clientId,
      source: params.source,
      assignedBy: params.assignedBy ?? null,
      purchaseNumber: params.purchaseNumber ?? null,
      paymentId: params.paymentId ?? null,
      totalPrice: params.totalPrice ?? null,
      taxAmount: params.taxAmount ?? 0,
      paymentStatus: params.paymentStatus ?? "pending",
      paymentMethod: params.paymentMethod ?? null,
      eSignature: params.eSignature ?? null,
      termsAgreedAt: params.termsAgreedAt ?? null,
      creditsTotal: params.creditsTotal,
      creditsRemaining: params.creditsRemaining,
      creditsUsed: params.creditsUsed ?? 0,
      startsAt: params.startsAt,
      expiresAt: params.expiresAt,
      status: params.status ?? "active",
      remark: params.remark ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create package instance");
  }
  return row;
}
