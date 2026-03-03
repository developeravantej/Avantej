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

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreatePackageParams = {
  name: string;
  appointmentType: "private" | "semi-private" | "both";
  crossUsageEnabled?: boolean;
  sessionCount: number;
  pricePerSession: number; // cents
  maxClientsPerSession: number;
  expiryDays?: number;
  expiryDate?: Date;
  autoGenerateInvoice?: boolean;
  branchId?: string;
  allowedServiceIds?: string[] | null;
};

export type UpdatePackageParams = {
  name?: string;
  appointmentType?: "private" | "semi-private" | "both";
  crossUsageEnabled?: boolean;
  sessionCount?: number;
  pricePerSession?: number;
  maxClientsPerSession?: number;
  expiryDays?: number | null;
  expiryDate?: Date | null;
  autoGenerateInvoice?: boolean;
  branchId?: string | null;
  allowedServiceIds?: string[] | null;
};

// ── Service functions ──────────────────────────────────────────────────────────

export async function createPackage(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: CreatePackageParams
): Promise<typeof packages.$inferSelect> {
  if (!params.name.trim()) throw new Error("Package name is required.");
  if (params.sessionCount < 1) throw new Error("Session count must be at least 1.");
  if (params.pricePerSession < 0) throw new Error("Price per session must be 0 or greater.");
  if (params.maxClientsPerSession < 1) throw new Error("Max clients per session must be at least 1.");
  if (params.expiryDays !== undefined && params.expiryDate !== undefined) {
    throw new Error("Provide either expiryDays or expiryDate, not both.");
  }
  if (params.expiryDays !== undefined && params.expiryDays < 1) {
    throw new Error("Expiry days must be at least 1.");
  }

  const [created] = await tenantDb
    .insert(packages)
    .values({
      name: params.name.trim(),
      appointmentType: params.appointmentType,
      crossUsageEnabled: params.crossUsageEnabled ?? false,
      sessionCount: params.sessionCount,
      pricePerSession: params.pricePerSession,
      maxClientsPerSession: params.maxClientsPerSession,
      expiryDays: params.expiryDays ?? null,
      expiryDate: params.expiryDate ?? null,
      autoGenerateInvoice: params.autoGenerateInvoice ?? false,
      branchId: params.branchId ?? null,
      allowedServiceIds: params.allowedServiceIds ?? null,
      isArchived: false,
    })
    .returning();
  if (!created) throw new Error("Failed to create package.");
  return created;
}

export async function updatePackage(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: UpdatePackageParams
): Promise<typeof packages.$inferSelect | null> {
  if (params.name !== undefined && !params.name.trim()) {
    throw new Error("Package name cannot be empty.");
  }
  if (params.sessionCount !== undefined && params.sessionCount < 1) {
    throw new Error("Session count must be at least 1.");
  }
  if (params.pricePerSession !== undefined && params.pricePerSession < 0) {
    throw new Error("Price per session must be 0 or greater.");
  }
  if (params.maxClientsPerSession !== undefined && params.maxClientsPerSession < 1) {
    throw new Error("Max clients per session must be at least 1.");
  }
  if (params.expiryDays !== undefined && params.expiryDate !== undefined &&
      params.expiryDays !== null && params.expiryDate !== null) {
    throw new Error("Provide either expiryDays or expiryDate, not both.");
  }

  // Build update payload — only include explicitly provided keys
  const payload: Record<string, unknown> = { updatedAt: new Date() };
  if (params.name !== undefined) payload.name = params.name.trim();
  if (params.appointmentType !== undefined) payload.appointmentType = params.appointmentType;
  if (params.crossUsageEnabled !== undefined) payload.crossUsageEnabled = params.crossUsageEnabled;
  if (params.sessionCount !== undefined) payload.sessionCount = params.sessionCount;
  if (params.pricePerSession !== undefined) payload.pricePerSession = params.pricePerSession;
  if (params.maxClientsPerSession !== undefined) payload.maxClientsPerSession = params.maxClientsPerSession;
  if (params.expiryDays !== undefined) payload.expiryDays = params.expiryDays;
  if (params.expiryDate !== undefined) payload.expiryDate = params.expiryDate;
  if (params.autoGenerateInvoice !== undefined) payload.autoGenerateInvoice = params.autoGenerateInvoice;
  if (params.branchId !== undefined) payload.branchId = params.branchId;
  if (params.allowedServiceIds !== undefined) payload.allowedServiceIds = params.allowedServiceIds;

  const [updated] = await tenantDb
    .update(packages)
    .set(payload as Parameters<ReturnType<typeof tenantDb.update>["set"]>[0])
    .where(eq(packages.id, id))
    .returning();
  return updated ?? null;
}

export async function archivePackage(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<typeof packages.$inferSelect | null> {
  const [updated] = await tenantDb
    .update(packages)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(packages.id, id))
    .returning();
  return updated ?? null;
}
