/**
 * User Activity Log Router
 *
 * API endpoints for "Recent Activity" list. Scoped to session user.
 */

import { listUserActivityLog } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const userActivityLogRouter = {
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        activityType: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
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

      return listUserActivityLog(context.tenantDb, {
        userId,
        activityType: input.activityType,
        limit: input.limit,
      });
    }),
};
