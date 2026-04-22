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

import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { resolveBufferTime, checkAppointmentBufferConflict } from "./buffer-time.service";
import { evaluateAndExpireIfOverdue, evaluateAndLockIfOverdue } from "./installment.service";
import { assertValidTransition } from "./utils/appointment-status-machine";
import { writeAudit } from "./audit-log.service";
import { calculateCommissionForAppointment } from "./commission-calculator.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

// Lock acquisition order for all transaction paths in this service:
//   1. sales_orders   (never acquired here — belongs to pos/refunds)
//   2. package_instances  ← acquired here via FOR UPDATE after evaluateAndLockIfOverdue
//   3. appointments   (not locked — appointments are the output of createAppointment)
//   4. commission_splits  (never acquired here — belongs to commission-splits service)
// Always acquire in this order when multiple tables are locked in one transaction.

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
  staffAssignments?: { staffId: string; slotIndex: number }[];
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
  // D.3.1 — SQL-side RBAC filter: push the accessible-nodes check into the WHERE clause
  // so the DB never returns rows the caller cannot access.
  // When accessibleNodeIds is undefined the caller is an admin who sees all nodes — skip filter.
  // When provided but empty, return nothing (sql`1=0`).
  if (accessibleNodeIds !== undefined) {
    if (accessibleNodeIds.length > 0) {
      conditions.push(inArray(appointments.branchId, accessibleNodeIds));
    } else {
      conditions.push(sql`1=0`);
    }
  }

  return tenantDb.query.appointments.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [appointments.startTime],
    limit: Math.min(limit, 500),
  });
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
  // A.1.1 — Input validation
  if (params.packageInstanceId) {
    const creditsUsed = params.creditsUsed ?? 1;
    if (!Number.isInteger(creditsUsed) || creditsUsed < 1) {
      throw new Error("creditsUsed must be a positive integer");
    }
  }

  const endTime = addMinutes(params.startTime, params.duration);

  // Buffer time enforcement — stays outside the transaction (read-only)
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

  // A.1.2–A.1.6 — Transactional: lock, ownership check, credit deduction, insert
  try {
    return await tenantDb.transaction(async (tx: TenantTx) => {
      if (params.packageInstanceId) {
        // A.1.2 — Evaluate expiry first, then overdue → grace → lock (pass tx, not tenantDb)
        await evaluateAndExpireIfOverdue(tx as unknown as TenantDb, params.packageInstanceId);
        await evaluateAndLockIfOverdue(tx as unknown as NeonDatabase<typeof tenantSchema>, params.packageInstanceId);

        // A.1.3 — Second locked read of the package row (FOR UPDATE)
        const [lockedPkg] = await tx
          .select()
          .from(packageInstances)
          .where(eq(packageInstances.id, params.packageInstanceId))
          .for("update");
        if (!lockedPkg) throw new Error("Package instance not found");

        // A.1.4 — Ownership check (Gap #10)
        if (params.userId && lockedPkg.clientId !== params.userId) {
          throw new Error("Not authorized");
        }

        // A.1.5 — Re-check status and credits on locked row
        if (lockedPkg.isLocked) {
          throw new Error("Package is locked due to unpaid installment. Please complete your payment to continue booking.");
        }
        if (lockedPkg.status !== "active") {
          throw new Error("Package is not active");
        }
        const creditsRequested = params.creditsUsed ?? 1;
        const creditsRemaining = lockedPkg.creditsTotal - lockedPkg.creditsUsed;
        if (creditsRemaining < creditsRequested) {
          throw new Error(`Not enough credits. You have ${creditsRemaining} credits available.`);
        }
      }

      // A.1.6 — Insert appointment inside transaction
      const [row] = await tx
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

      // Decrement credits on the package instance (inside transaction)
      if (params.packageInstanceId && row.creditsUsed !== undefined) {
        const creditsToConsume = params.creditsUsed ?? 1;
        await tx
          .update(packageInstances)
          .set({
            creditsUsed: sql`credits_used + ${creditsToConsume}`,
            updatedAt: new Date(),
          })
          .where(eq(packageInstances.id, params.packageInstanceId));
      }

      // D.2.1 — Audit appointment creation
      await writeAudit(tx, {
        actorUserId: params.createdBy,
        action: "appointment.created",
        entityType: "appointment",
        entityId: row.id,
        summary: `Appointment ${row.id} created (status: ${row.status})`,
        changes: {
          packageInstanceId: params.packageInstanceId ?? null,
          creditsUsed: params.creditsUsed ?? 1,
        },
      });

      // A.1.7 — Insert appointment_staff rows
      const staffAssignmentsToInsert = params.staffAssignments?.length
        ? params.staffAssignments
        : params.trainerId
          ? [{ staffId: params.trainerId, slotIndex: 0 }]
          : [];
      if (staffAssignmentsToInsert.length > 0) {
        await tx.insert(appointmentStaff).values(
          staffAssignmentsToInsert.map((a) => ({
            appointmentId: row.id,
            staffId: a.staffId,
            slotIndex: a.slotIndex,
          }))
        );
      }

      return row;
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23P01") {
      throw new Error("Trainer is already booked during this time");
    }
    throw err;
  }
}

/**
 * Update an appointment by ID. If startTime or duration changes, endTime is recalculated.
 */
export async function updateAppointment(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: UpdateAppointmentParams
): Promise<typeof appointments.$inferSelect> {
  // Pre-fetch for buffer-time enforcement (read-only, stays outside tx)
  const existingForBuffer = await getAppointmentById(tenantDb, id);
  if (!existingForBuffer) {
    throw new Error("Appointment not found");
  }

  const startTime = params.startTime ?? existingForBuffer.startTime;
  const duration = params.duration ?? existingForBuffer.duration;
  const endTime = params.endTime ?? addMinutes(startTime, duration);

  // Buffer time enforcement when time changes (read-only, outside transaction)
  const timeChanged = params.startTime !== undefined || params.duration !== undefined;
  const trainerId = params.trainerId !== undefined ? params.trainerId : existingForBuffer.trainerId;
  if (timeChanged && existingForBuffer.serviceId && trainerId) {
    const bufferMinutes = await resolveBufferTime(tenantDb, existingForBuffer.serviceId, trainerId);
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

  let row: typeof appointments.$inferSelect | undefined;

  try {
    row = await tenantDb.transaction(async (tx: TenantTx) => {
      // B.1.2 — Re-fetch inside the transaction for an authoritative view
      // Plain SELECT (no FOR UPDATE): the appointment row itself is not a contended resource;
      // the package_instances row is locked below if credits need restoring.
      const [existing] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, id));
      if (!existing) {
        throw new Error("Appointment not found");
      }

      // B.1.3 — Status machine check
      if (params.status !== undefined) {
        assertValidTransition(existing.status, params.status);
      }

      // B.1.4 — Cancellation credit restore
      if (
        params.status === "cancelled" &&
        existing.status !== "cancelled" &&
        existing.packageInstanceId &&
        (existing.creditsUsed ?? 0) > 0
      ) {
        const creditsToRestore = existing.creditsUsed as number; // narrowed by guard above

        // Lock the package row
        const [pkg] = await tx
          .select()
          .from(packageInstances)
          .where(eq(packageInstances.id, existing.packageInstanceId))
          .for("update");

        if (pkg && (pkg.status === "active" || pkg.status === "exhausted")) {
          await tx
            .update(packageInstances)
            .set({
              creditsUsed: sql`GREATEST(credits_used - ${creditsToRestore}, 0)`,
              ...(pkg.status === "exhausted" && { status: "active" }),
              updatedAt: new Date(),
            })
            .where(eq(packageInstances.id, existing.packageInstanceId));
        } else {
          // Package not found or in terminal status — skip restore
          console.warn(
            `[credit-restore] Skipping credit restore for appointment ${id}: ` +
              `package ${existing.packageInstanceId} status=${pkg?.status ?? "not found"}`,
          );
        }
      }

      // B.1.5 — Perform the UPDATE
      const [updated] = await tx
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

      if (!updated) {
        throw new Error("Appointment not found");
      }

      // Commission: create splits when appointment completes
      if (params.status === "completed" && existing.status !== "completed" && existing.serviceId) {
        // P6: double-commission guard — if this appointment is linked to a POS sale
        // that already has commission splits, skip.
        if (updated.salesOrderId) {
          const existingPosSplits = await tx
            .select({ id: commissionSplits.id })
            .from(commissionSplits)
            .where(eq(commissionSplits.salesOrderId, updated.salesOrderId))
            .limit(1);
          if (existingPosSplits.length > 0) {
            console.info(JSON.stringify({
              event: "commission_skipped_already_commissioned_at_pos",
              appointmentId: id,
              salesOrderId: updated.salesOrderId,
            }));
          } else {
            await runAppointmentCommission(tx, id, updated, params.actor);
          }
        } else {
          await runAppointmentCommission(tx, id, updated, params.actor);
        }
      }

      // D.2.2 — Audit status changes
      if (params.status !== undefined && params.actor) {
        await writeAudit(tx, {
          actorUserId: params.actor.userId,
          actorMemberId: params.actor.memberId,
          actorRole: params.actor.role,
          action: "appointment.status_changed",
          entityType: "appointment",
          entityId: id,
          summary: `Appointment ${id} status changed from '${existing.status}' to '${params.status}'`,
          changes: { from: existing.status, to: params.status },
        });
      }

      return updated;
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23P01") {
      throw new Error("Trainer is already booked during this time");
    }
    throw err;
  }

  if (!row) {
    throw new Error("Appointment not found");
  }

  return row;
}

// ---------------------------------------------------------------------------
// Private helper: run commission calculation for a completed appointment
// ---------------------------------------------------------------------------

async function runAppointmentCommission(
  tx: TenantTx,
  appointmentId: string,
  appointment: typeof appointments.$inferSelect,
  actor?: { userId: string; memberId: string; role: string },
): Promise<void> {
  if (!actor || !appointment.serviceId) return;

  // Count attended clients
  const attendeeRows = await (tx as unknown as TenantDb)
    .select({ id: appointmentClients.id })
    .from(appointmentClients)
    .where(
      and(
        eq(appointmentClients.appointmentId, appointmentId),
        eq(appointmentClients.attended, true),
      ),
    );
  const attendeeCount = attendeeRows.length;

  // Load staff assignments ordered by slotIndex
  const staffRows = await (tx as unknown as TenantDb)
    .select({
      staffId: appointmentStaff.staffId,
      slotIndex: appointmentStaff.slotIndex,
    })
    .from(appointmentStaff)
    .where(eq(appointmentStaff.appointmentId, appointmentId));

  const staffAssignments = staffRows
    .filter((r) => r.slotIndex !== null)
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
    .map((r) => ({ staffId: r.staffId, slotIndex: r.slotIndex! }));

  let effectiveAssignments = staffAssignments;
  if (effectiveAssignments.length === 0 && appointment.trainerId) {
    effectiveAssignments = [{ staffId: appointment.trainerId, slotIndex: 0 }];
  }
  if (effectiveAssignments.length === 0) return;

  await calculateCommissionForAppointment(tx as unknown as TenantDb, {
    appointmentId,
    serviceId: appointment.serviceId,
    sessionTotalCents: appointment.pricePerClient,
    attendeeCount,
    staffAssignments: effectiveAssignments,
    earnedAt: new Date(), // completion time
    actor,
  });
}
