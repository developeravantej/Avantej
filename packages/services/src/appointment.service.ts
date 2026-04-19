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

import { eq, and, gte, lte, sql } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { resolveBufferTime, checkAppointmentBufferConflict } from "./buffer-time.service";
import { evaluateAndLockIfOverdue } from "./installment.service";
// TODO (Open Question 6, Phase 6): When serviceCommissionConfig is added to the schema,
// import createCommissionSplitsForAppointment from "./commission-splits.service" and call it
// inside the completion hook below (see "Commission auto-creation on appointment completion").
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListAppointmentsParams = {
  branchId?: string;
  serviceId?: string | null;
  userId?: string | null;
  trainerId?: string;
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
  /**
   * Actor performing the update. Required for audit logging and commission creation.
   * When status transitions to 'completed', commission splits are auto-created if
   * service commission config exists (currently dormant — see NOTE in commission-splits.service.ts).
   */
  actor?: { userId: string; memberId: string; role: string };
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
  if (params.trainerId) {
    conditions.push(eq(appointments.trainerId, params.trainerId));
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

  // Buffer time enforcement
  if (params.serviceId && params.trainerId) {
    const bufferMinutes = await resolveBufferTime(tenantDb, params.serviceId, params.trainerId);
    if (bufferMinutes > 0) {
      const { hasConflict } = await checkAppointmentBufferConflict(tenantDb, {
        trainerId: params.trainerId,
        startTime: params.startTime,
        endTime,
        bufferTimeMinutes: bufferMinutes,
      });
      if (hasConflict) {
        throw new Error(
          `This time conflicts with another appointment. A ${bufferMinutes}-minute buffer is required between bookings.`
        );
      }
    }
  }

  // Package installment lock + credit check (lazy evaluation)
  if (params.packageInstanceId) {
    // Evaluate overdue → grace → lock before checking state
    const pkg = await evaluateAndLockIfOverdue(tenantDb, params.packageInstanceId);
    if (!pkg) throw new Error("Package instance not found");
    if (pkg.isLocked) {
      throw new Error("Package is locked due to unpaid installment. Please complete your payment to continue booking.");
    }
    if (pkg.status !== "active") {
      throw new Error("Package is not active");
    }
    const creditsRequested = params.creditsUsed ?? 1;
    if (pkg.creditsRemaining < creditsRequested) {
      const hasMoreInstallments = pkg.paymentPlanType !== null && pkg.installmentsPaid < pkg.installmentsTotal;
      const hint = hasMoreInstallments ? " Complete your next installment to unlock more." : "";
      throw new Error(`Not enough credits. You have ${pkg.creditsRemaining} credits available.${hint}`);
    }
  }

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

  // Decrement credits on the package instance (atomic)
  if (params.packageInstanceId && row.creditsUsed !== undefined) {
    const creditsToConsume = params.creditsUsed ?? 1;
    await tenantDb
      .update(packageInstances)
      .set({
        creditsUsed: sql`credits_used + ${creditsToConsume}`,
        updatedAt: new Date(),
      })
      .where(eq(packageInstances.id, params.packageInstanceId));
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

  // Buffer time enforcement when time changes
  const timeChanged = params.startTime !== undefined || params.duration !== undefined;
  const trainerId = params.trainerId !== undefined ? params.trainerId : existing.trainerId;
  if (timeChanged && existing.serviceId && trainerId) {
    const bufferMinutes = await resolveBufferTime(tenantDb, existing.serviceId, trainerId);
    if (bufferMinutes > 0) {
      const { hasConflict } = await checkAppointmentBufferConflict(tenantDb, {
        trainerId,
        startTime,
        endTime,
        bufferTimeMinutes: bufferMinutes,
        excludeAppointmentId: id,
      });
      if (hasConflict) {
        throw new Error(
          `This time conflicts with another appointment. A ${bufferMinutes}-minute buffer is required between bookings.`
        );
      }
    }
  }

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

  // ---------------------------------------------------------------------------
  // Commission auto-creation on appointment completion (Phase 6 — P6 scaffold)
  //
  // IMPORTANT (Open Question 6): The schema does NOT yet have a serviceCommissionConfig
  // table or a services.commissionPercentage column. Until that config is added,
  // commission creation for appointments is a no-op (logged below). This hook is
  // scaffolded so the creation path is wired and ready.
  //
  // When commission config is available, implement:
  //   1. Fetch config: const cfg = await tenantDb.query.serviceCommissionConfig.findFirst(...)
  //   2. Fetch assigned staff: appointmentStaff rows for this appointment
  //   3. Build splits array from config percentages
  //   4. Call createCommissionSplitsForAppointment(tenantDb, { appointmentId, splits, actor })
  //
  // For now: if transitioning to 'completed' AND actor is provided, log the no-op.
  // ---------------------------------------------------------------------------
  if (params.status === "completed" && existing.status !== "completed" && params.actor) {
    // Check if any staff are assigned — if commission config existed, we'd use these
    const assignedStaff = await tenantDb
      .select({ staffId: appointmentStaff.staffId })
      .from(appointmentStaff)
      .where(eq(appointmentStaff.appointmentId, id));

    if (assignedStaff.length > 0) {
      // NOTE: No service commission config table exists in schema (Open Question 6).
      // Commission creation is dormant. Assigned staff count is logged for visibility.
      // Remove this branch and implement splits once serviceCommissionConfig is available.
      console.warn(
        `[commission] Appointment ${id} completed with ${assignedStaff.length} staff assigned. ` +
        "Commission auto-creation skipped: no serviceCommissionConfig in schema. " +
        "See packages/services/src/commission-splits.service.ts NOTE and execute/log.md.",
      );
    }
  }

  return row;
}
