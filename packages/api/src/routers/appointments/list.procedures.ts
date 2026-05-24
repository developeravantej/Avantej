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
  syncAppointmentToGoogleCalendar,
  getAppointmentStatusHistory,
  listAppointmentsWithRecurrence,
  isVirtualId,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardInputBranchForContext, resolveAccessibleNodeIds } from "../../guards";
import { eq, inArray, or, and, gte, ne } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { mapPgError } from "../../lib/orpc-error-mapper";
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

export const appointmentsListProcedures = {
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

      const accessibleNodeIds = await resolveAccessibleNodeIds(context);

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
        await guardInputBranchForContext(context, appointment.branchId);
        return appointment;
      }

      throw new ORPCError("FORBIDDEN", {
        message: "Access denied",
      });
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
    })
};
