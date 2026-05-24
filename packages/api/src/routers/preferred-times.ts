/**
 * Preferred Times Router
 *
 * API endpoints for preferred scheduling times on package instances (max 4 per instance).
 */

import {
  listPreferredTimes,
  upsertPreferredTimes,
  getPackageInstanceById,

} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";

const dayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const preferredTimeItemSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  time: z.string().min(1),
  priority: z.number().int().min(1).max(4),
});

export const preferredTimesRouter = {
  list: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const instance = await getPackageInstanceById(
        context.tenantDb,
        input.packageInstanceId
      );
      if (!instance) {
        throw new ORPCError("NOT_FOUND", {
          message: "Package instance not found",
        });
      }

      const clientId = context.session?.user?.id;
      const isClient = clientId && instance.clientId === clientId;
      const isStaff = context.member;

      if (isClient || isStaff) {
        return listPreferredTimes(context.tenantDb, input.packageInstanceId);
      }

      throw new ORPCError("FORBIDDEN", {
        message: "Access denied",
      });
    }),

  upsert: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        packageInstanceId: z.string().uuid(),
        items: z.array(preferredTimeItemSchema).max(4),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const instance = await getPackageInstanceById(
        context.tenantDb,
        input.packageInstanceId
      );
      if (!instance) {
        throw new ORPCError("NOT_FOUND", {
          message: "Package instance not found",
        });
      }

      const clientId = context.session?.user?.id;
      const isClient = clientId && instance.clientId === clientId;
      const isStaff = context.member;

      if (isStaff) {
        await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "update");
      } else if (!isClient) {
        throw new ORPCError("FORBIDDEN", {
          message: "Access denied",
        });
      }

      try {
        const rows = await upsertPreferredTimes(
          context.tenantDb,
          input.packageInstanceId,
          input.items
        );
        return rows;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error ? error.message : "Failed to upsert preferred times",
        });
      }
    }),
};
