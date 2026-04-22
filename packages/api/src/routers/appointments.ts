/**
 * Appointments Router
 *
 * API endpoints for managing appointments in tenant organizations.
 * list: staff view (branch, date range). listForUser: client view (user_id).
 * Requires appointment_management permission for staff; listForUser/getById can be called by client (user_id = session user).
 */

import {
  listAppointments,
  listAppointmentsForUser,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  getDescendantNodeIds,
  requirePermission,
  syncAppointmentToGoogleCalendar,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { inArray } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../lib/context-helpers";

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
  list: protectedProcedure
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
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "appointment_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const accessibleNodeIds =
        context.accessibleNodeIds ??
        (context.member
          ? await getDescendantNodeIds(
              context.tenantDb,
              context.member.hierarchyScopeId
            )
          : []);

      const items = await listAppointments(context.tenantDb, {
        branchId: input.branchId,
        serviceId: input.serviceId ?? undefined,
        trainerId: input.trainerId,
        status: input.status,
        startFrom: input.startFrom ? new Date(input.startFrom) : undefined,
        startTo: input.startTo ? new Date(input.startTo) : undefined,
        accessibleNodeIds,
        limit: input.limit,
      });

      if (items.length === 0) return items.map((r) => ({ ...r, serviceName: null, trainerName: null, clientName: null }));

      // Batch-resolve names in parallel
      const serviceIds = [...new Set(items.map((r) => r.serviceId).filter(Boolean) as string[])];
      const trainerIds = [...new Set(items.map((r) => r.trainerId).filter(Boolean) as string[])];
      const userIds = [...new Set(items.map((r) => r.userId).filter(Boolean) as string[])];

      const [serviceRows, profileRows, userRows] = await Promise.all([
        serviceIds.length > 0
          ? context.tenantDb.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds))
          : [],
        trainerIds.length > 0
          ? context.tenantDb.select({ memberId: memberProfiles.memberId, displayName: memberProfiles.displayName }).from(memberProfiles).where(inArray(memberProfiles.memberId, trainerIds))
          : [],
        userIds.length > 0
          ? (() => { try { const cpDb = getControlPanelDb(context); return cpDb.select({ id: cpUsers.id, name: cpUsers.name }).from(cpUsers).where(inArray(cpUsers.id, userIds)); } catch { return Promise.resolve([]); } })()
          : [],
      ]);

      const serviceMap = new Map((serviceRows as { id: string; name: string }[]).map((s) => [s.id, s.name]));
      const profileMap = new Map((profileRows as { memberId: string; displayName: string | null }[]).map((p) => [p.memberId, p.displayName]));
      const userMap = new Map((userRows as { id: string; name: string }[]).map((u) => [u.id, u.name]));

      return items.map((r) => ({
        ...r,
        serviceName: r.serviceId ? (serviceMap.get(r.serviceId) ?? null) : null,
        trainerName: r.trainerId ? (profileMap.get(r.trainerId) ?? null) : null,
        clientName: r.userId ? (userMap.get(r.userId) ?? null) : null,
      }));
    }),

  /**
   * List appointments for the current user (client view). Uses session user id.
   */
  listForUser: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: statusSchema.optional(),
        startFrom: z.string().datetime().optional(),
        startTo: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listAppointmentsForUser(context.tenantDb, {
        userId,
        status: input.status,
        startFrom: input.startFrom ? new Date(input.startFrom) : undefined,
        startTo: input.startTo ? new Date(input.startTo) : undefined,
        limit: input.limit,
      });

      return items;
    }),

  getById: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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
        try {
          await requirePermission(
            context.tenantDb,
            context.member!,
            "appointment_management",
            "read"
          );
        } catch (error) {
          throw new ORPCError("FORBIDDEN", {
            message: error instanceof Error ? error.message : "Permission denied",
          });
        }
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

  create: protectedProcedure
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
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "appointment_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to create appointment",
        });
      }
    }),

  update: protectedProcedure
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
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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
        try {
          await requirePermission(
            context.tenantDb,
            context.member!,
            "appointment_management",
            "update"
          );
        } catch (error) {
          throw new ORPCError("FORBIDDEN", {
            message: error instanceof Error ? error.message : "Permission denied",
          });
        }
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
      } else {
        throw new ORPCError("FORBIDDEN", {
          message: "Access denied",
        });
      }

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
};
