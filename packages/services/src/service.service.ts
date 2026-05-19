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

import { eq, and, asc, inArray, gte, lte, sql, sum } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { members } from "@avantej-core/db/schema/tenant/members";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ServiceWithCategory = typeof services.$inferSelect & {
  service_category_name: string | null;
  avgPerMonth: number;
};

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
  defaultCommissionBps?: number;
  timePresetConfig?: {
    recurringDays: string[];
    timeSlotsPerDay: Record<string, string[]>;
  } | null;
  createdBy?: string | null;
};

export type UpdateServiceParams = Partial<CreateServiceParams> & {
  updatedBy?: string | null;
};

/**
 * List services, optionally filtered by category, branch, type, etc.
 * When accessibleNodeIds is provided, only services whose branchId is in that set (or null) are returned.
 */
export async function listServices(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListServicesParams = {}
): Promise<ServiceWithCategory[]> {
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

  const baseRows = await tenantDb.query.services.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [asc(services.name)],
  });

  const categoryIds = Array.from(
    new Set(baseRows.map((r) => r.categoryId).filter((id): id is string => !!id))
  );

  const categoryNameById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const cats = await tenantDb
      .select({ id: serviceCategories.id, name: serviceCategories.name })
      .from(serviceCategories)
      .where(inArray(serviceCategories.id, categoryIds));
    for (const c of cats) categoryNameById.set(c.id, c.name);
  }

  // Batch avg/mo: rolling 90-day window grouped by service and month
  const serviceIds = baseRows.map((r) => r.id);
  const avgByServiceId = new Map<string, number>();
  if (serviceIds.length > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const avgRows = await tenantDb
      .select({
        serviceId: salesOrderItems.serviceId,
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${salesOrders.date}), 'YYYY-MM')`,
        sessionCount: sum(salesOrderItems.quantity),
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
      .where(
        and(
          inArray(salesOrderItems.serviceId, serviceIds),
          sql`${salesOrders.status} IN ('confirmed', 'completed')`,
          gte(salesOrders.date, cutoff)
        )
      )
      .groupBy(salesOrderItems.serviceId, sql`DATE_TRUNC('month', ${salesOrders.date})`);

    // Aggregate per service: sum across months / number of distinct months
    const monthsByService = new Map<string, { total: number; months: Set<string> }>();
    for (const row of avgRows) {
      if (!row.serviceId) continue;
      let entry = monthsByService.get(row.serviceId);
      if (!entry) {
        entry = { total: 0, months: new Set() };
        monthsByService.set(row.serviceId, entry);
      }
      entry.total += Number(row.sessionCount) || 0;
      entry.months.add(row.month);
    }
    for (const [serviceId, { total, months }] of monthsByService) {
      const avg = months.size > 0 ? Math.round((total / months.size) * 100) / 100 : 0;
      avgByServiceId.set(serviceId, avg);
    }
  }

  const rows: ServiceWithCategory[] = baseRows.map((row) => ({
    ...row,
    service_category_name: row.categoryId
      ? categoryNameById.get(row.categoryId) ?? null
      : null,
    avgPerMonth: avgByServiceId.get(row.id) ?? 0,
  }));

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
      defaultCommissionBps: params.defaultCommissionBps ?? 0,
      timePresetConfig: params.timePresetConfig ?? null,
      createdBy: params.createdBy ?? null,
      updatedBy: params.createdBy ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create service");
  }
  return row;
}

// ---------------------------------------------------------------------------
// 1.24 — revenueShareByCategory
// ---------------------------------------------------------------------------

export type RevenueShareByCategoryRow = {
  categoryId: string | null;
  categoryName: string | null;
  revenueCents: number;
  sharePct: number;
};

/**
 * Revenue share breakdown by service category for a date range.
 * Only confirmed/completed orders are counted.
 * Maximum range: 365 days. Empty accessibleNodeIds returns [].
 */
export async function revenueShareByCategory(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: {
    from: Date;
    to: Date;
    accessibleNodeIds: string[];
  }
): Promise<RevenueShareByCategoryRow[]> {
  const { from, to, accessibleNodeIds } = params;

  // 365-day max range guard
  const diffMs = to.getTime() - from.getTime();
  if (diffMs > 365 * 24 * 60 * 60 * 1000) {
    throw Object.assign(new Error("Date range must not exceed 365 days"), {
      code: "BAD_REQUEST",
    });
  }

  // Empty scope = no accessible branches → return empty
  if (accessibleNodeIds.length === 0) {
    return [];
  }

  // JOIN salesOrderItems → salesOrders → services → serviceCategories
  // Filter: order status confirmed/completed, date in range, branch in scope
  const rows = await tenantDb
    .select({
      categoryId: serviceCategories.id,
      categoryName: serviceCategories.name,
      revenueCents: sum(salesOrderItems.totalPrice),
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .innerJoin(services, eq(salesOrderItems.serviceId, services.id))
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(
      and(
        sql`${salesOrders.status} IN ('confirmed', 'completed')`,
        gte(salesOrders.date, from),
        lte(salesOrders.date, to),
        inArray(salesOrders.branchId, accessibleNodeIds)
      )
    )
    .groupBy(serviceCategories.id, serviceCategories.name);

  if (rows.length === 0) {
    return [];
  }

  const totalRevenue = rows.reduce(
    (acc, r) => acc + (Number(r.revenueCents) || 0),
    0
  );

  return rows.map((r) => {
    const rev = Number(r.revenueCents) || 0;
    return {
      categoryId: r.categoryId ?? null,
      categoryName: r.categoryName ?? null,
      revenueCents: rev,
      sharePct: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 10000) / 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 1.25 — avgSessionsSoldPerMonth
// ---------------------------------------------------------------------------

export type AvgSessionsSoldPerMonthResult = {
  serviceId: string;
  avgSessionsPerMonth: number;
};

/**
 * Average sessions sold per month for a service, based on a rolling 30-day window.
 * Counts sales order items linked to the service in confirmed/completed orders.
 */
export async function avgSessionsSoldPerMonth(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: { serviceId: string }
): Promise<AvgSessionsSoldPerMonthResult> {
  const { serviceId } = params;

  // Rolling 30-day window: one GROUP BY month bucket
  const rows = await tenantDb
    .select({
      month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${salesOrders.date}), 'YYYY-MM')`,
      sessionCount: sum(salesOrderItems.quantity),
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .where(
      and(
        eq(salesOrderItems.serviceId, serviceId),
        sql`${salesOrders.status} IN ('confirmed', 'completed')`
      )
    )
    .groupBy(sql`DATE_TRUNC('month', ${salesOrders.date})`);

  if (rows.length === 0) {
    return { serviceId, avgSessionsPerMonth: 0 };
  }

  const total = rows.reduce((acc, r) => acc + (Number(r.sessionCount) || 0), 0);
  const avg = Math.round((total / rows.length) * 100) / 100;

  return { serviceId, avgSessionsPerMonth: avg };
}

// ---------------------------------------------------------------------------
// 1.26 — listWithTrainerTiers
// ---------------------------------------------------------------------------

export type ServiceWithTrainerTiers = ServiceWithCategory & {
  eligibleTrainerTiers: string[];
};

/**
 * List services (same filters as listServices) with eligible trainer tier names
 * projected via a single batch JOIN on service_members → members → trainer_tiers.
 * No N+1.
 */
export async function listServicesWithTrainerTiers(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListServicesParams = {}
): Promise<ServiceWithTrainerTiers[]> {
  const baseServices = await listServices(tenantDb, params);

  if (baseServices.length === 0) {
    return [];
  }

  const serviceIds = baseServices.map((s) => s.id);

  // Single batch query: service_members JOIN members JOIN trainer_tiers
  const tierRows = await tenantDb
    .select({
      serviceId: serviceMembers.serviceId,
      tierName: trainerTiers.name,
    })
    .from(serviceMembers)
    .innerJoin(members, eq(serviceMembers.memberId, members.id))
    .innerJoin(trainerTiers, eq(members.trainerTierId, trainerTiers.id))
    .where(
      and(
        inArray(serviceMembers.serviceId, serviceIds),
        eq(trainerTiers.isActive, true)
      )
    );

  // Build map: serviceId → Set<tierName>
  const tiersByServiceId = new Map<string, Set<string>>();
  for (const row of tierRows) {
    let set = tiersByServiceId.get(row.serviceId);
    if (!set) {
      set = new Set();
      tiersByServiceId.set(row.serviceId, set);
    }
    set.add(row.tierName);
  }

  return baseServices.map((svc) => ({
    ...svc,
    eligibleTrainerTiers: Array.from(tiersByServiceId.get(svc.id) ?? []).sort(),
  }));
}

/**
 * Duplicate a service by ID.
 * Creates a copy with name "{name} (Copy)" and isActive: false.
 */
export async function duplicateService(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  options: { createdBy?: string | null } = {}
): Promise<typeof services.$inferSelect> {
  const existing = await getServiceById(tenantDb, id);
  if (!existing) {
    throw new Error("Service not found");
  }

  // Omit identity/audit fields; override name, isActive, timestamps
  const {
    id: _id,
    createdAt: _ca,
    updatedAt: _ua,
    createdBy: _cb,
    updatedBy: _ub,
    stripeProductId: _spi,
    stripePriceId: _spri,
    stripeSyncStatus: _sss,
    stripeLastSyncedAt: _slsa,
    name,
    ...rest
  } = existing;

  const [row] = await tenantDb
    .insert(services)
    .values({
      ...rest,
      name: `${name} (Copy)`,
      isActive: false,
      stripeSyncStatus: "pending",
      stripeProductId: null,
      stripePriceId: null,
      stripeLastSyncedAt: null,
      createdBy: options.createdBy ?? null,
      updatedBy: options.createdBy ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to duplicate service");
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
      ...(params.defaultCommissionBps !== undefined && {
        defaultCommissionBps: params.defaultCommissionBps,
      }),
      ...(params.timePresetConfig !== undefined && {
        timePresetConfig: params.timePresetConfig,
      }),
      ...(params.updatedBy !== undefined && { updatedBy: params.updatedBy }),
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  if (!row) {
    throw new Error("Service not found");
  }
  return row;
}
