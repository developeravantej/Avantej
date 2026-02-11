/**
 * Appointment Service
 *
 * Handles appointment CRUD for tenant organizations.
 * Supports staff view (by branch/date) and client view (by user_id).
 *
 * Usage:
 * ```typescript
 * import { listAppointments, createAppointment } from "@avantej-core/services";
 * const appointments = await listAppointments(tenantDb, { branchId, startFrom, startTo });
 * ```
 */

import { eq, and, gte, lte } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListAppointmentsParams = {
  branchId?: string;
  serviceId?: string | null;
  userId?: string | null;
  status?: string;
  startFrom?: Date;
  startTo?: Date;
  accessibleNodeIds?: string[];
  limit?: number;
};

export type ListAppointmentsForUserParams = {
  userId: string;
  status?: string;
  startFrom?: Date;
  startTo?: Date;
  limit?: number;
};

export type CreateAppointmentParams = {
  type: "private" | "semi-private";
  startTime: Date;
  duration: number;
  serviceId?: string | null;
  branchId: string;
  status?: string;
  sessionTotal: number;
  pricePerClient: number;
  createdBy: string;
  userId?: string | null;
  trainerId?: string | null;
  packageInstanceId?: string | null;
  creditsUsed?: number;
  location?: string | null;
  classSlotId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  bookingNumber?: string | null;
};

export type UpdateAppointmentParams = {
  status?: string;
  startTime?: Date;
  duration?: number;
  endTime?: Date;
  trainerId?: string | null;
  location?: string | null;
  notes?: string | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

/**
 * List appointments (staff view): by branch, date range, optional service/status.
 * When accessibleNodeIds is provided, only appointments in those branches are returned.
 */
export async function listAppointments(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListAppointmentsParams = {}
): Promise<(typeof appointments.$inferSelect)[]> {
  const {
    branchId,
    serviceId,
    userId,
    status,
    startFrom,
    startTo,
    accessibleNodeIds,
    limit = 100,
  } = params;

  const conditions = [];
  if (branchId) {
    conditions.push(eq(appointments.branchId, branchId));
  }
  if (serviceId !== undefined && serviceId !== null) {
    conditions.push(eq(appointments.serviceId, serviceId));
  }
  if (userId !== undefined && userId !== null) {
    conditions.push(eq(appointments.userId, userId));
  }
  if (status) {
    conditions.push(eq(appointments.status, status));
  }
  if (startFrom) {
    conditions.push(gte(appointments.startTime, startFrom));
  }
  if (startTo) {
    conditions.push(lte(appointments.startTime, startTo));
  }

  const rows = await tenantDb.query.appointments.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [appointments.startTime],
    limit: Math.min(limit, 500),
  });

  if (accessibleNodeIds && accessibleNodeIds.length > 0) {
    return rows.filter((row) => accessibleNodeIds.includes(row.branchId));
  }

  return rows;
}

/**
 * List appointments for a specific user (client view).
 */
export async function listAppointmentsForUser(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListAppointmentsForUserParams
): Promise<(typeof appointments.$inferSelect)[]> {
  const { userId, status, startFrom, startTo, limit = 50 } = params;

  const conditions = [eq(appointments.userId, userId)];
  if (status) {
    conditions.push(eq(appointments.status, status));
  }
  if (startFrom) {
    conditions.push(gte(appointments.startTime, startFrom));
  }
  if (startTo) {
    conditions.push(lte(appointments.startTime, startTo));
  }

  return tenantDb.query.appointments.findMany({
    where: and(...conditions),
    orderBy: [appointments.startTime],
    limit: Math.min(limit, 200),
  });
}

/**
 * Get an appointment by ID.
 */
export async function getAppointmentById(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<(typeof appointments.$inferSelect) | null> {
  const row = await tenantDb.query.appointments.findFirst({
    where: eq(appointments.id, id),
  });
  return row ?? null;
}

/**
 * Create an appointment. endTime is computed from startTime + duration (minutes).
 */
export async function createAppointment(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: CreateAppointmentParams
): Promise<typeof appointments.$inferSelect> {
  const endTime = addMinutes(params.startTime, params.duration);

  const [row] = await tenantDb
    .insert(appointments)
    .values({
      type: params.type,
      startTime: params.startTime,
      duration: params.duration,
      endTime,
      serviceId: params.serviceId ?? null,
      branchId: params.branchId,
      status: params.status ?? "pending",
      sessionTotal: params.sessionTotal,
      pricePerClient: params.pricePerClient,
      createdBy: params.createdBy,
      userId: params.userId ?? null,
      trainerId: params.trainerId ?? null,
      packageInstanceId: params.packageInstanceId ?? null,
      creditsUsed: params.creditsUsed ?? 1,
      location: params.location ?? null,
      classSlotId: params.classSlotId ?? null,
      description: params.description ?? null,
      imageUrl: params.imageUrl ?? null,
      notes: params.notes ?? null,
      bookingNumber: params.bookingNumber ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create appointment");
  }
  return row;
}

/**
 * Update an appointment by ID. If startTime or duration changes, endTime is recalculated.
 */
export async function updateAppointment(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: UpdateAppointmentParams
): Promise<typeof appointments.$inferSelect> {
  const existing = await getAppointmentById(tenantDb, id);
  if (!existing) {
    throw new Error("Appointment not found");
  }

  const startTime = params.startTime ?? existing.startTime;
  const duration = params.duration ?? existing.duration;
  const endTime = params.endTime ?? addMinutes(startTime, duration);

  const [row] = await tenantDb
    .update(appointments)
    .set({
      ...(params.status !== undefined && { status: params.status }),
      ...(params.startTime !== undefined && { startTime: params.startTime }),
      ...(params.duration !== undefined && { duration: params.duration }),
      endTime,
      ...(params.trainerId !== undefined && { trainerId: params.trainerId }),
      ...(params.location !== undefined && { location: params.location }),
      ...(params.notes !== undefined && { notes: params.notes }),
      ...(params.cancelledAt !== undefined && { cancelledAt: params.cancelledAt }),
      ...(params.cancellationReason !== undefined && {
        cancellationReason: params.cancellationReason,
      }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, id))
    .returning();

  if (!row) {
    throw new Error("Appointment not found");
  }
  return row;
}
