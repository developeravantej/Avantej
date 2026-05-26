import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { eq, and, gte, or, notInArray } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { updateAppointment, syncAppointmentToGoogleCalendar } from "@avantej-core/services";
import type { TenantTx } from "./types";

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

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

      const actor = {
        userId: context.session?.user?.id ?? "",
        memberId: context.member.id,
        role: context.member.role,
      };

      const TERMINAL = ["completed", "cancelled", "no-show"];

      // Fetch all non-terminal appointments in the series (parent + materialized children)
      const toCancel = await context.tenantDb
        .select()
        .from(appointments)
        .where(
          and(
            or(
              eq(appointments.id, input.parentId),
              eq(appointments.recurringParentId, input.parentId),
            ),
            notInArray(appointments.status, TERMINAL),
          ),
        );

      const gcalConfig = {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      };

      for (const appt of toCancel) {
        const updated = await updateAppointment(context.tenantDb, appt.id, {
          status: "cancelled",
          cancelledAt: new Date(),
          actor,
        });
        syncAppointmentToGoogleCalendar(context.tenantDb, updated, "delete", gcalConfig).catch(
          (err) => console.error("GCal cancelSeries sync error:", err),
        );
      }

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

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

      const actor = {
        userId: context.session?.user?.id ?? "",
        memberId: context.member.id,
        role: context.member.role,
      };

      const fromDateObj = new Date(input.fromDate + "T00:00:00.000Z");
      // End-of-day of the day before fromDate — preserves occurrences with time-of-day on that day.
      const prevDay = new Date(fromDateObj);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      const newEndDate = new Date(
        Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), 23, 59, 59, 999),
      );

      // Truncate the series' recurrence metadata atomically (these are not appointment-status
      // transitions so they don't go through updateAppointment).
      await context.tenantDb.transaction(async (tx: TenantTx) => {
        await tx
          .update(appointments)
          .set({ recurringEndDate: newEndDate, updatedAt: new Date() })
          .where(eq(appointments.id, input.parentId));

        await tx
          .update(recurrenceRules)
          .set({ endsType: "on_date", endsAfterOccurrences: null, updatedAt: new Date() })
          .where(eq(recurrenceRules.appointmentId, input.parentId));
      });

      const TERMINAL = ["completed", "cancelled", "no-show"];

      // Fetch non-terminal materialized children on/after fromDate
      const toCancel = await context.tenantDb
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.recurringParentId, input.parentId),
            gte(appointments.startTime, fromDateObj),
            notInArray(appointments.status, TERMINAL),
          ),
        );

      const gcalConfig = {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      };

      for (const appt of toCancel) {
        const updated = await updateAppointment(context.tenantDb, appt.id, {
          status: "cancelled",
          cancelledAt: new Date(),
          actor,
        });
        syncAppointmentToGoogleCalendar(context.tenantDb, updated, "delete", gcalConfig).catch(
          (err) => console.error("GCal cancelFuture sync error:", err),
        );
      }

      return { success: true };
    }),
};
