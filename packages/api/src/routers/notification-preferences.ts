/**
 * Notification Preferences Router
 *
 * API endpoints for user notification preferences (get, update). Scoped to session user.
 */

import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch } from "../guards";

export const notificationPreferencesRouter = {
  get: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
      

      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const prefs = await getNotificationPreferences(context.tenantDb, userId);
      return prefs;
    }),

  update: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        emailEnabled: z.boolean().optional(),
        smsEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        bookingReminders: z.boolean().optional(),
        bookingConfirmations: z.boolean().optional(),
        promotionalEmails: z.boolean().optional(),
        packageExpiry: z.boolean().optional(),
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

      const updated = await upsertNotificationPreferences(context.tenantDb, {
        userId,
        ...input,
      });
      return updated;
    }),
};
