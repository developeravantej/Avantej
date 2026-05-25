import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
} from "../../guards";
import { eq, and, gte, ne } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { statusSchema } from "./schemas";
import type { TenantTx } from "./types";

export const appointmentsRecurrenceProcedures = {
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

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

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

      await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

      
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

};
