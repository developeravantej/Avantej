/**
 * Service Service
 *
 * Handles service CRUD for tenant organizations.
 * Services belong to categories and branches; list respects accessible node IDs.
 *
 * Usage:
 * ```typescript
 * import { listServices, createService } from "@avantej-core/services";
 * const services = await listServices(tenantDb, { categoryId, branchId, isActive: true });
 * ```
 */

import { eq, and, asc } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListServicesParams = {
  categoryId?: string | null;
  branchId?: string | null;
  isActive?: boolean;
  type?: "private" | "semi_private" | "both";
  schedulingType?: "appointment" | "class_slot";
  accessibleNodeIds?: string[];
};

export type CreateServiceParams = {
  name: string;
  categoryId?: string | null;
  duration: number;
  durationUnitType?: "seconds" | "minutes" | "hours";
  maxAttendees: number;
  attendanceThreshold?: number | null;
  branchId?: string | null;
  isActive?: boolean;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  type?: "private" | "semi_private" | "both";
  price?: number | null;
  priceUnit?: "session" | "class" | "package";
  taxable?: boolean;
  taxPercentage?: number;
  isRecommended?: boolean;
  location?: string | null;
  features?: string[] | null;
  schedulingType?: "appointment" | "class_slot";
  sessionCount?: number | null;
  expirable?: boolean;
  expiryDays?: number | null;
  expiryDate?: Date | null;
};

export type UpdateServiceParams = Partial<CreateServiceParams>;

/**
 * List services, optionally filtered by category, branch, type, etc.
 * When accessibleNodeIds is provided, only services whose branchId is in that set (or null) are returned.
 */
export async function listServices(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListServicesParams = {}
): Promise<(typeof services.$inferSelect)[]> {
  const {
    categoryId,
    branchId,
    isActive,
    type,
    schedulingType,
    accessibleNodeIds,
  } = params;

  const conditions = [];
  if (categoryId !== undefined && categoryId !== null) {
    conditions.push(eq(services.categoryId, categoryId));
  }
  if (branchId !== undefined && branchId !== null) {
    conditions.push(eq(services.branchId, branchId));
  }
  if (isActive !== undefined) {
    conditions.push(eq(services.isActive, isActive));
  }
  if (type !== undefined) {
    conditions.push(eq(services.type, type));
  }
  if (schedulingType !== undefined) {
    conditions.push(eq(services.schedulingType, schedulingType));
  }

  const rows = await tenantDb.query.services.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [asc(services.name)],
  });

  if (accessibleNodeIds && accessibleNodeIds.length > 0) {
    return rows.filter(
      (row) => row.branchId === null || accessibleNodeIds.includes(row.branchId)
    );
  }

  return rows;
}

/**
 * Get a service by ID.
 */
export async function getServiceById(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<(typeof services.$inferSelect) | null> {
  const row = await tenantDb.query.services.findFirst({
    where: eq(services.id, id),
  });
  return row ?? null;
}

/**
 * Create a service.
 */
export async function createService(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: CreateServiceParams
): Promise<typeof services.$inferSelect> {
  const [row] = await tenantDb
    .insert(services)
    .values({
      name: params.name,
      categoryId: params.categoryId ?? null,
      duration: params.duration,
      durationUnitType: params.durationUnitType ?? "minutes",
      maxAttendees: params.maxAttendees,
      attendanceThreshold: params.attendanceThreshold ?? null,
      branchId: params.branchId ?? null,
      isActive: params.isActive ?? true,
      title: params.title ?? null,
      description: params.description ?? null,
      imageUrl: params.imageUrl ?? null,
      type: params.type ?? "private",
      price: params.price ?? null,
      priceUnit: params.priceUnit ?? "session",
      taxable: params.taxable ?? false,
      taxPercentage: params.taxPercentage ?? 0,
      isRecommended: params.isRecommended ?? false,
      location: params.location ?? null,
      features: params.features ?? null,
      schedulingType: params.schedulingType ?? "appointment",
      sessionCount: params.sessionCount ?? null,
      expirable: params.expirable ?? false,
      expiryDays: params.expiryDays ?? null,
      expiryDate: params.expiryDate ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create service");
  }
  return row;
}

/**
 * Update a service by ID.
 */
export async function updateService(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: UpdateServiceParams
): Promise<typeof services.$inferSelect> {
  const [row] = await tenantDb
    .update(services)
    .set({
      ...(params.name !== undefined && { name: params.name }),
      ...(params.categoryId !== undefined && { categoryId: params.categoryId }),
      ...(params.duration !== undefined && { duration: params.duration }),
      ...(params.durationUnitType !== undefined && {
        durationUnitType: params.durationUnitType,
      }),
      ...(params.maxAttendees !== undefined && { maxAttendees: params.maxAttendees }),
      ...(params.attendanceThreshold !== undefined && {
        attendanceThreshold: params.attendanceThreshold,
      }),
      ...(params.branchId !== undefined && { branchId: params.branchId }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...(params.title !== undefined && { title: params.title }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
      ...(params.type !== undefined && { type: params.type }),
      ...(params.price !== undefined && { price: params.price }),
      ...(params.priceUnit !== undefined && { priceUnit: params.priceUnit }),
      ...(params.taxable !== undefined && { taxable: params.taxable }),
      ...(params.taxPercentage !== undefined && {
        taxPercentage: params.taxPercentage,
      }),
      ...(params.isRecommended !== undefined && {
        isRecommended: params.isRecommended,
      }),
      ...(params.location !== undefined && { location: params.location }),
      ...(params.features !== undefined && { features: params.features }),
      ...(params.schedulingType !== undefined && {
        schedulingType: params.schedulingType,
      }),
      ...(params.sessionCount !== undefined && { sessionCount: params.sessionCount }),
      ...(params.expirable !== undefined && { expirable: params.expirable }),
      ...(params.expiryDays !== undefined && { expiryDays: params.expiryDays }),
      ...(params.expiryDate !== undefined && { expiryDate: params.expiryDate }),
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  if (!row) {
    throw new Error("Service not found");
  }
  return row;
}
