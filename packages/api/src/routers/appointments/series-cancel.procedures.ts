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

export const appointmentsSeriesCancelProcedures = {
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
};
