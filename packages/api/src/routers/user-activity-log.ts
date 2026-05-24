/**
 * User Activity Log Router
 *
 * API endpoints for "Recent Activity" list. Scoped to session user.
 */

import { listUserActivityLog } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch } from "../guards";

export const userActivityLogRouter = {
  list: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        activityType: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

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
