/**
 * Appointments Router
 *
 * API endpoints for managing appointments in tenant organizations.
 * list: staff view (branch, date range). listForUser: client view (user_id).
 * Requires appointment_management permission for staff; listForUser/getById can be called by client (user_id = session user).
 */

import {
  listAppointmentsForUser,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  getDescendantNodeIds,

  syncAppointmentToGoogleCalendar,
  getAppointmentStatusHistory,
  listAppointmentsWithRecurrence,
  isVirtualId,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { eq, inArray, or, and, gte, ne } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../lib/cursor";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../lib/context-helpers";
import { mapPgError } from "../lib/orpc-error-mapper";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

const appointmentTypeSchema = z.enum(["private", "semi-private"]);
const statusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no-show",
]);

export const appointmentsRouter = {
  /**
   * List appointments (staff view): by branch, date range, optional status.
   */
  list: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
        serviceId: z.string().uuid().nullable().optional(),
        trainerId: z.string().uuid().optional(),
        status: statusSchema.optional(),
        startFrom: z.string().datetime().optional(),
        startTo: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        /**
         * scope='assignable_to_me' — WHERE trainer_id = caller.member.id OR trainer_id IS NULL.
         * scope='all' — no additional trainer filter (default).
         */
        scope: z.enum(["assignable_to_me", "all"]).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);

      // Use recurrence-aware list which returns virtual occurrences for recurring series.
      // Note: status filter is not passed to listAppointmentsWithRecurrence — virtual
      // occurrences inherit the parent's status so we filter post-expansion below.
      const startFrom = input.startFrom ? new Date(input.startFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const startTo = input.startTo ? new Date(input.startTo) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      let items = await listAppointmentsWithRecurrence(context.tenantDb, {
        organizationId: input.organizationId,
        trainerId: input.trainerId,
        startFrom,
        startTo,
        accessibleNodeIds,
      });

      // Apply post-expansion filters that couldn't be pushed into the DB query
      if (input.status) {
        items = items.filter((r) => r.status === input.status);
      }
      if (input.serviceId !== undefined && input.serviceId !== null) {
        items = items.filter((r) => r.serviceId === input.serviceId);
      }
      if (input.branchId) {
        items = items.filter((r) => r.branchId === input.branchId);
      }
      // scope='assignable_to_me': keep rows where trainerId equals caller's memberId OR trainerId is null
      if (input.scope === "assignable_to_me") {
        const callerMemberId = context.member.id;
        items = items.filter(
          (r) => r.trainerId === null || r.trainerId === undefined || r.trainerId === callerMemberId,
        );
      }
      if (input.limit) {
        items = items.slice(0, input.limit);
      }

      if (items.length === 0) return items.map((r) => ({ ...r, isVirtual: r.isVirtual, parentId: r.parentId, serviceName: null, trainerName: null, clientName: null }));

      // Batch-resolve names in parallel.
      // For virtual occurrences: id is synthetic ("virtual__...") but parentId + trainerId/serviceId/userId
      // are all inherited from the parent row, so service/user lookups work transparently.
      // For appointmentStaff: virtual rows don't have their own staff rows — we must look up by parentId.
      const serviceIds = [...new Set(items.map((r) => r.serviceId).filter(Boolean) as string[])];
      const directTrainerIds = [...new Set(items.map((r) => r.trainerId).filter(Boolean) as string[])];
      const userIds = [...new Set(items.map((r) => r.userId).filter(Boolean) as string[])];

      // For appointmentStaff lookup: use real appt ids (non-virtual) OR parentId (for virtual rows)
      const realApptIds = items.filter((r) => !isVirtualId(r.id)).map((r) => r.id);
      const virtualParentIds = [...new Set(items.filter((r) => isVirtualId(r.id)).map((r) => r.parentId).filter(Boolean) as string[])];
      const staffQueryIds = [...new Set([...realApptIds, ...virtualParentIds])];

      const [serviceRows, staffAssignmentRows, userRows] = await Promise.all([
        serviceIds.length > 0
          ? context.tenantDb.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds))
          : [],
        staffQueryIds.length > 0
          ? context.tenantDb.select({ appointmentId: appointmentStaff.appointmentId, staffId: appointmentStaff.staffId, slotIndex: appointmentStaff.slotIndex }).from(appointmentStaff).where(inArray(appointmentStaff.appointmentId, staffQueryIds))
          : [],
        userIds.length > 0
          ? (() => { try { const cpDb = getControlPanelDb(context); return cpDb.select({ id: cpUsers.id, name: cpUsers.name }).from(cpUsers).where(inArray(cpUsers.id, userIds)); } catch { return Promise.resolve([]); } })()
          : [],
      ]);

      // Pick primary staff (lowest slotIndex) per appointment
      const primaryStaffByAppt = new Map<string, { staffId: string; slotIndex: number }>();
      for (const row of staffAssignmentRows as { appointmentId: string; staffId: string; slotIndex: number }[]) {
        const existing = primaryStaffByAppt.get(row.appointmentId);
        if (!existing || row.slotIndex < existing.slotIndex) {
          primaryStaffByAppt.set(row.appointmentId, { staffId: row.staffId, slotIndex: row.slotIndex });
        }
      }

      // Resolve fallback trainer names. `appointmentStaff.staffId` is written
      // inconsistently by callers — POS sends member.userId, the appointment form
      // sends member.id. Look up both forms in one query and translate to member.id.
      const fallbackStaffIds = [...new Set([...primaryStaffByAppt.values()].map((v) => v.staffId))];
      const memberRows = fallbackStaffIds.length > 0
        ? await context.tenantDb
            .select({ id: members.id, userId: members.userId })
            .from(members)
            .where(or(inArray(members.id, fallbackStaffIds), inArray(members.userId, fallbackStaffIds)))
        : [];
      const staffIdToMemberId = new Map<string, string>();
      for (const m of memberRows as { id: string; userId: string }[]) {
        staffIdToMemberId.set(m.id, m.id);
        staffIdToMemberId.set(m.userId, m.id);
      }

      const allTrainerMemberIds = [
        ...new Set([
          ...directTrainerIds,
          ...[...primaryStaffByAppt.values()].map((v) => staffIdToMemberId.get(v.staffId)).filter(Boolean) as string[],
        ]),
      ];
      const profileRows = allTrainerMemberIds.length > 0
        ? await context.tenantDb.select({ memberId: memberProfiles.memberId, displayName: memberProfiles.displayName }).from(memberProfiles).where(inArray(memberProfiles.memberId, allTrainerMemberIds))
        : [];

      const serviceMap = new Map((serviceRows as { id: string; name: string }[]).map((s) => [s.id, s.name]));
      const profileMap = new Map((profileRows as { memberId: string; displayName: string | null }[]).map((p) => [p.memberId, p.displayName]));
      const userMap = new Map((userRows as { id: string; name: string }[]).map((u) => [u.id, u.name]));

      return items.map((r) => {
        // For virtual occurrences, staff is stored on the parent; look up by parentId
        const staffLookupId = isVirtualId(r.id) ? (r.parentId ?? r.id) : r.id;
        const fallback = primaryStaffByAppt.get(staffLookupId);
        const fallbackMemberId = fallback ? staffIdToMemberId.get(fallback.staffId) : undefined;
        const trainerMemberId = r.trainerId ?? fallbackMemberId ?? null;
        return {
          ...r,
          isVirtual: r.isVirtual,
          parentId: r.parentId,
          serviceName: r.serviceId ? (serviceMap.get(r.serviceId) ?? null) : null,
          trainerName: trainerMemberId ? (profileMap.get(trainerMemberId) ?? null) : null,
          clientName: r.userId ? (userMap.get(r.userId) ?? null) : null,
        };
      });
    }),

  /**
   * List appointments for the current user (client view). Uses session user id.
   */
  listForUser: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: statusSchema.optional(),
        statuses: z.array(statusSchema).optional(),
        startFrom: z.string().datetime().optional(),
        startTo: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listAppointmentsForUser(context.tenantDb, {
        userId,
        status: input.status,
        statuses: input.statuses,
        startFrom: input.startFrom ? new Date(input.startFrom) : undefined,
        startTo: input.startTo ? new Date(input.startTo) : undefined,
        limit: input.limit,
      });

      return items;
    }),

  getById: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const appointment = await getAppointmentById(context.tenantDb, input.id);
      if (!appointment) {
        throw new ORPCError("NOT_FOUND", {
          message: "Appointment not found",
        });
      }

      const userId = context.session?.user?.id;
      const isClient = userId && appointment.userId === userId;
      const isStaff = context.member;

      if (isClient) {
        return appointment;
      }

      if (isStaff) {
        await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read");
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(
                context.tenantDb,
                context.member.hierarchyScopeId
              )
            : []);
        if (!accessibleNodeIds.includes(appointment.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this appointment",
          });
        }
        return appointment;
      }

      throw new ORPCError("FORBIDDEN", {
        message: "Access denied",
      });
    }),

  create: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        type: appointmentTypeSchema,
        startTime: z.string().datetime(),
        duration: z.number().int().min(1),
        branchId: z.string().uuid(),
        serviceId: z.string().uuid().nullable().optional(),
        status: statusSchema.optional(),
        sessionTotal: z.number().int().min(0),
        pricePerClient: z.number().int().min(0),
        userId: z.string().nullable().optional(),
        trainerId: z.string().uuid().nullable().optional(),
        packageInstanceId: z.string().uuid().nullable().optional(),
        creditsUsed: z.number().int().min(0).optional(),
        location: z.string().nullable().optional(),
        classSlotId: z.string().uuid().nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        bookingNumber: z.string().nullable().optional(),
        staffAssignments: z.array(z.object({
          staffId: z.string().uuid(),
          slotIndex: z.number().int().min(0),
        })).optional(),
        recurrence: z.object({
          frequencyValue: z.number().int().min(1),
          timeUnit: z.enum(["day", "week", "month"]),
          repeatOn: z.array(z.number().int().min(0).max(6)).optional(),
          monthlyType: z.enum(["day_of_month", "day_of_week"]).optional(),
          monthlyDayOfWeek: z.number().int().min(0).max(6).optional(),
          monthlyWeekOfMonth: z.number().int().min(-1).max(5).optional(),
          endsType: z.enum(["never", "on_date", "after_occurrences"]),
          endsAfterOccurrences: z.number().int().min(1).optional(),
          endsOn: z.string().datetime().optional(),
        }).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Clients can self-book without staff permission, but only:
      //  - for themselves (input.userId === their session user id)
      //  - at their own branch (input.branchId === their member.hierarchyScopeId)
      const sessionUserId = context.session?.user?.id;
      const isClientSelfBooking =
        context.member.role === "client" &&
        !!sessionUserId &&
        input.userId === sessionUserId &&
        input.branchId === context.member.hierarchyScopeId;

      if (!isClientSelfBooking) {
        await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create")

        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(
                context.tenantDb,
                context.member.hierarchyScopeId
              )
            : []);
        if (!accessibleNodeIds.includes(input.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this branch",
          });
        }
      }

      // Defensive guard: a booking against a `pending` package_instance is
      // never allowed (package is awaiting trainer assignment / approval).
      // The booking transaction in package-instance.service.ts also enforces
      // this — this router-level check just returns a friendlier error.
      if (input.packageInstanceId) {
        const pkg = await context.tenantDb.query.packageInstances.findFirst({
          where: eq(packageInstances.id, input.packageInstanceId),
        });
        if (pkg && pkg.status === "pending") {
          throw new ORPCError("FORBIDDEN", {
            message: "Package is awaiting trainer assignment.",
          });
        }
      }

      try {
        const created = await createAppointment(context.tenantDb, {
          type: input.type,
          startTime: new Date(input.startTime),
          duration: input.duration,
          branchId: input.branchId,
          serviceId: input.serviceId ?? null,
          status: input.status,
          sessionTotal: input.sessionTotal,
          pricePerClient: input.pricePerClient,
          createdBy: context.member.userId,
          userId: input.userId ?? null,
          trainerId: input.trainerId ?? null,
          packageInstanceId: input.packageInstanceId ?? null,
          creditsUsed: input.creditsUsed,
          location: input.location ?? null,
          classSlotId: input.classSlotId ?? null,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          notes: input.notes ?? null,
          bookingNumber: input.bookingNumber ?? null,
          staffAssignments: input.staffAssignments,
          recurrence: input.recurrence
            ? {
                ...input.recurrence,
                endsOn: input.recurrence.endsOn ? new Date(input.recurrence.endsOn) : undefined,
              }
            : undefined,
        });

        // Fire-and-forget Google Calendar sync — never blocks the response
        const gcalConfig = {
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        };
        syncAppointmentToGoogleCalendar(context.tenantDb, created, "create", gcalConfig).catch(
          (err) => console.error("GCal create sync error:", err),
        );

        return created;
      } catch (error) {
        // J3 — translate PG exclusion / FK violations into typed ORPCError so
        // the UI can show a "trainer/room already booked" toast instead of a
        // generic "Failed to create appointment" message.
        const mapped = mapPgError(error);
        if (mapped) throw mapped;
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to create appointment",
        });
      }
    }),

  /**
   * Materialize a virtual occurrence into a real child appointment.
   * Copies all fields from the parent and applies any provided updates.
   * The unique constraint (recurringParentId, startTime) prevents race conditions.
   */
  materializeOccurrence: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        parentId: z.string().uuid(),
        occurrenceDate: z.string(), // ISO date "YYYY-MM-DD"
        updates: z.object({
          status: statusSchema.optional(),
          duration: z.number().int().min(1).optional(),
          trainerId: z.string().uuid().nullable().optional(),
          location: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
          cancellationReason: z.string().nullable().optional(),
        }).optional(),
      })
    )
    .handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Missing context" });
      }

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create");

      const parent = await context.tenantDb.query.appointments.findFirst({
        where: eq(appointments.id, input.parentId),
      });
      if (!parent) {
        throw new ORPCError("NOT_FOUND", { message: "Parent appointment not found" });
      }

      // Compute startTime for this occurrence: combine date from input + time-of-day from parent
      const [datePart] = input.occurrenceDate.split("T");
      const parentTime = parent.startTime.toISOString().split("T")[1] ?? "00:00:00.000Z";
      const occurrenceStartTime = new Date(`${datePart}T${parentTime}`);
      const duration = input.updates?.duration ?? parent.duration;
      const occurrenceEndTime = new Date(occurrenceStartTime.getTime() + duration * 60 * 1000);

      const status = input.updates?.status ?? parent.status;
      const cancelledAt = status === "cancelled" ? new Date() : parent.cancelledAt;

      try {
        const [child] = await context.tenantDb
          .insert(appointments)
          .values({
            type: parent.type,
            startTime: occurrenceStartTime,
            duration,
            endTime: occurrenceEndTime,
            serviceId: parent.serviceId,
            branchId: parent.branchId,
            status,
            sessionTotal: parent.sessionTotal,
            pricePerClient: parent.pricePerClient,
            createdBy: context.member.userId,
            userId: parent.userId,
            trainerId: input.updates?.trainerId !== undefined ? input.updates.trainerId : parent.trainerId,
            packageInstanceId: parent.packageInstanceId,
            creditsUsed: parent.creditsUsed ?? 1,
            location: input.updates?.location !== undefined ? input.updates.location : parent.location,
            classSlotId: parent.classSlotId,
            description: input.updates?.description !== undefined ? input.updates.description : parent.description,
            imageUrl: input.updates?.imageUrl !== undefined ? input.updates.imageUrl : parent.imageUrl,
            notes: input.updates?.notes !== undefined ? input.updates.notes : parent.notes,
            bookingNumber: null, // each occurrence gets its own booking number if needed
            isRecurring: false,
            recurringParentId: parent.id,
            cancelledAt,
            cancellationReason: input.updates?.cancellationReason ?? parent.cancellationReason,
          })
          .returning();

        if (!child) throw new Error("Failed to create occurrence");
        return child;
      } catch (err: unknown) {
        // PG unique violation on (recurring_parent_id, start_time)
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
          throw new ORPCError("CONFLICT", {
            message: "An occurrence for this date already exists (concurrent creation).",
          });
        }
        throw new ORPCError("BAD_REQUEST", {
          message: err instanceof Error ? err.message : "Failed to materialize occurrence",
        });
      }
    }),

  /**
   * Split a recurring series at a given date.
   * Occurrences from `fromDate` onward are moved to a new series with optional updates.
   */
  splitSeries: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        parentId: z.string().uuid(),
        fromDate: z.string(), // ISO date "YYYY-MM-DD"
        updates: z.object({
          status: statusSchema.optional(),
          trainerId: z.string().uuid().nullable().optional(),
          location: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
        }).optional(),
        recurrence: z.object({
          frequencyValue: z.number().int().min(1),
          timeUnit: z.enum(["day", "week", "month"]),
          repeatOn: z.array(z.number().int().min(0).max(6)).optional(),
          monthlyType: z.enum(["day_of_month", "day_of_week"]).optional(),
          monthlyDayOfWeek: z.number().int().min(0).max(6).optional(),
          monthlyWeekOfMonth: z.number().int().min(-1).max(5).optional(),
          endsType: z.enum(["never", "on_date", "after_occurrences"]),
          endsAfterOccurrences: z.number().int().min(1).optional(),
          endsOn: z.string().datetime().optional(),
        }).optional(),
      })
    )
    .handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Missing context" });
      }

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create");

      
      return context.tenantDb.transaction(async (tx: TenantTx) => {
        // Fetch old parent + its rule
        const oldParent = await tx.query.appointments.findFirst({
          where: eq(appointments.id, input.parentId),
        });
        if (!oldParent) throw new ORPCError("NOT_FOUND", { message: "Parent appointment not found" });

        const oldRule = await tx.query.recurrenceRules.findFirst({
          where: eq(recurrenceRules.appointmentId, input.parentId),
        });

        // Compute new end date for old series: end-of-day of (fromDate - 1 day).
        // Using T23:59:59.999Z ensures occurrences on the day before fromDate
        // (which carry a time-of-day, e.g. 09:00) are still within range.
        const fromDateObj = new Date(input.fromDate + "T00:00:00.000Z");
        const prevDay = new Date(fromDateObj);
        prevDay.setUTCDate(prevDay.getUTCDate() - 1);
        const newEndDateForOld = new Date(
          Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), 23, 59, 59, 999)
        );

        // Update old parent's recurringEndDate
        await tx
          .update(appointments)
          .set({ recurringEndDate: newEndDateForOld, updatedAt: new Date() })
          .where(eq(appointments.id, input.parentId));

        // Update old rule to use endsType = 'on_date'
        if (oldRule) {
          await tx
            .update(recurrenceRules)
            .set({
              endsType: "on_date",
              endsAfterOccurrences: null,
              updatedAt: new Date(),
            })
            .where(eq(recurrenceRules.appointmentId, input.parentId));
        }

        // Compute new series start time (fromDate + parent time-of-day)
        const parentTime = oldParent.startTime.toISOString().split("T")[1] ?? "00:00:00.000Z";
        const newStartTime = new Date(`${input.fromDate}T${parentTime}`);
        const newEndTime = new Date(newStartTime.getTime() + oldParent.duration * 60 * 1000);

        // Insert new parent
        const [newParent] = await tx
          .insert(appointments)
          .values({
            type: oldParent.type,
            startTime: newStartTime,
            duration: oldParent.duration,
            endTime: newEndTime,
            serviceId: oldParent.serviceId,
            branchId: oldParent.branchId,
            status: input.updates?.status ?? oldParent.status,
            sessionTotal: oldParent.sessionTotal,
            pricePerClient: oldParent.pricePerClient,
            createdBy: context.member.userId,
            userId: oldParent.userId,
            trainerId: input.updates?.trainerId !== undefined ? input.updates.trainerId : oldParent.trainerId,
            packageInstanceId: null, // new series doesn't inherit package
            creditsUsed: oldParent.creditsUsed ?? 1,
            location: input.updates?.location !== undefined ? input.updates.location : oldParent.location,
            notes: input.updates?.notes !== undefined ? input.updates.notes : oldParent.notes,
            description: input.updates?.description !== undefined ? input.updates.description : oldParent.description,
            imageUrl: input.updates?.imageUrl !== undefined ? input.updates.imageUrl : oldParent.imageUrl,
            isRecurring: true,
            recurringEndDate: input.recurrence?.endsOn ? new Date(input.recurrence.endsOn) : null,
          })
          .returning();

        if (!newParent) throw new Error("Failed to create new series parent");

        // Insert new recurrence rule (use provided rule or copy from old)
        const ruleToUse = input.recurrence ?? (oldRule ? {
          frequencyValue: oldRule.frequencyValue,
          timeUnit: oldRule.timeUnit as "day" | "week" | "month",
          repeatOn: Array.isArray(oldRule.repeatOn) ? oldRule.repeatOn : [],
          monthlyType: (oldRule.monthlyType ?? undefined) as "day_of_month" | "day_of_week" | undefined,
          monthlyDayOfWeek: oldRule.monthlyDayOfWeek ?? undefined,
          monthlyWeekOfMonth: oldRule.monthlyWeekOfMonth ?? undefined,
          endsType: "never" as const,
          endsAfterOccurrences: undefined as number | undefined,
          endsOn: undefined as string | undefined,
        } : null);

        if (ruleToUse) {
          await tx.insert(recurrenceRules).values({
            appointmentId: newParent.id,
            frequencyValue: ruleToUse.frequencyValue,
            timeUnit: ruleToUse.timeUnit,
            repeatOn: ruleToUse.repeatOn ?? [],
            monthlyType: ruleToUse.monthlyType ?? null,
            monthlyDayOfWeek: ruleToUse.monthlyDayOfWeek ?? null,
            monthlyWeekOfMonth: ruleToUse.monthlyWeekOfMonth ?? null,
            endsType: ruleToUse.endsType,
            endsAfterOccurrences: ruleToUse.endsAfterOccurrences ?? null,
          });
        }

        // Re-parent materialized children with startTime >= fromDate
        await tx
          .update(appointments)
          .set({ recurringParentId: newParent.id, updatedAt: new Date() })
          .where(
            and(
              eq(appointments.recurringParentId, input.parentId),
              gte(appointments.startTime, fromDateObj),
            )
          );

        return newParent;
      });
    }),

  /**
   * Cancel all appointments in a recurring series (parent + all materialized children).
   */
  cancelSeries: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        parentId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Missing context" });
      }

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create");

      
      await context.tenantDb.transaction(async (tx: TenantTx) => {
        const cancelledAt = new Date();

        // Cancel the parent (unless already completed)
        await tx
          .update(appointments)
          .set({ status: "cancelled", cancelledAt, updatedAt: new Date() })
          .where(
            and(
              eq(appointments.id, input.parentId),
              ne(appointments.status, "completed"),
            )
          );

        // Cancel all materialized children (unless already completed)
        await tx
          .update(appointments)
          .set({ status: "cancelled", cancelledAt, updatedAt: new Date() })
          .where(
            and(
              eq(appointments.recurringParentId, input.parentId),
              ne(appointments.status, "completed"),
            )
          );
      });

      return { success: true };
    }),

  /**
   * Cancel all occurrences of a recurring series from a given date onward.
   * Truncates the old series and cancels materialized children on/after fromDate.
   */
  cancelFuture: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        parentId: z.string().uuid(),
        fromDate: z.string(), // ISO date "YYYY-MM-DD"
      })
    )
    .handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Missing context" });
      }

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create");

      
      await context.tenantDb.transaction(async (tx: TenantTx) => {
        const fromDateObj = new Date(input.fromDate + "T00:00:00.000Z");
        // End-of-day of the day before fromDate — preserves occurrences with time-of-day on that day.
        const prevDay = new Date(fromDateObj);
        prevDay.setUTCDate(prevDay.getUTCDate() - 1);
        const newEndDate = new Date(
          Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), 23, 59, 59, 999)
        );
        const cancelledAt = new Date();

        // Truncate the series' end date so virtual occurrences on/after fromDate stop emitting
        await tx
          .update(appointments)
          .set({ recurringEndDate: newEndDate, updatedAt: new Date() })
          .where(eq(appointments.id, input.parentId));

        // Also update the recurrence rule to ends on newEndDate
        await tx
          .update(recurrenceRules)
          .set({ endsType: "on_date", endsAfterOccurrences: null, updatedAt: new Date() })
          .where(eq(recurrenceRules.appointmentId, input.parentId));

        // Cancel materialized children on/after fromDate (skip completed)
        await tx
          .update(appointments)
          .set({ status: "cancelled", cancelledAt, updatedAt: new Date() })
          .where(
            and(
              eq(appointments.recurringParentId, input.parentId),
              gte(appointments.startTime, fromDateObj),
              ne(appointments.status, "completed"),
            )
          );
      });

      return { success: true };
    }),

  update: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        status: statusSchema.optional(),
        startTime: z.string().datetime().optional(),
        duration: z.number().int().min(1).optional(),
        trainerId: z.string().uuid().nullable().optional(),
        location: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        cancelledAt: z.string().datetime().nullable().optional(),
        cancellationReason: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        staffAssignments: z
          .array(
            z.object({
              staffId: z.string().uuid(),
              slotIndex: z.number().int().min(0),
            })
          )
          .optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const existing = await getAppointmentById(context.tenantDb, input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Appointment not found",
        });
      }

      const userId = context.session?.user?.id;
      const isClient = userId && existing.userId === userId;
      const isStaff = context.member;

      if (isStaff) {
        await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (context.member
            ? await getDescendantNodeIds(
                context.tenantDb,
                context.member.hierarchyScopeId
              )
            : []);
        if (!accessibleNodeIds.includes(existing.branchId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this appointment",
          });
        }
      } else if (isClient) {
        if (input.status && input.status !== "cancelled") {
          throw new ORPCError("FORBIDDEN", {
            message: "Clients can only cancel (set status to cancelled)",
          });
        }
        if (input.staffAssignments !== undefined) {
          throw new ORPCError("FORBIDDEN", {
            message: "Clients cannot modify staff assignments",
          });
        }
      } else {
        throw new ORPCError("FORBIDDEN", {
          message: "Access denied",
        });
      }

      // Actor is required by the service layer to fire commission generation
      // when status transitions to 'completed' or 'cancelled' (Phase 1 rule).
      // Without it, commission splits are never created.
      const actor = context.member
        ? {
            userId: context.session?.user?.id ?? "",
            memberId: context.member.id,
            role: context.member.role,
          }
        : undefined;

      const updateParams = {
        status: input.status,
        startTime: input.startTime ? new Date(input.startTime) : undefined,
        duration: input.duration,
        trainerId: input.trainerId,
        location: input.location,
        notes: input.notes,
        cancelledAt: input.cancelledAt ? new Date(input.cancelledAt) : undefined,
        cancellationReason:
          input.cancellationReason ??
          (input.status === "cancelled" ? "Cancelled by client" : undefined),
        description: input.description,
        imageUrl: input.imageUrl,
        staffAssignments: input.staffAssignments,
        actor,
      };

      try {
        const updated = await updateAppointment(
          context.tenantDb,
          input.id,
          updateParams
        );

        // Fire-and-forget Google Calendar sync — never blocks the response
        const gcalConfig = {
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        };
        const syncAction = input.status === "cancelled" ? "delete" : "update";
        syncAppointmentToGoogleCalendar(context.tenantDb, updated, syncAction, gcalConfig).catch(
          (err) => console.error("GCal update sync error:", err),
        );

        return updated;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to update appointment",
        });
      }
    }),

  statusHistory: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        appointmentId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read");

      const limit = input.limit;
      const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

      const rawRows = await getAppointmentStatusHistory(context.tenantDb, input.appointmentId, {
        parsedCursor,
        limit,
      });

      const hasMore = rawRows.length > limit;
      const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
      const lastRow = pageRows.at(-1);
      const nextCursor =
        hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

      const userIds = [
        ...new Set(pageRows.map((r) => r.changedBy).filter((id) => id !== "system")),
      ];
      const cpDb = getControlPanelDb(context);
      const userRecords =
        userIds.length > 0
          ? await cpDb
              .select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
              .from(cpUsers)
              .where(inArray(cpUsers.id, userIds))
          : [];
      const nameMap = new Map(
        userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
      );

      const rows = pageRows.map(({ changedBy, ...rest }) => ({
        ...rest,
        changedByName:
          changedBy === "system" ? "System" : (nameMap.get(changedBy) ?? "Unknown User"),
      }));

      return { rows, nextCursor };
    }),
};
