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
import { protectedProcedure } from "../index";

export const notificationPreferencesRouter = {
  get: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
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

      const prefs = await getNotificationPreferences(context.tenantDb, userId);
      return prefs;
    }),

  update: protectedProcedure
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

      const updated = await upsertNotificationPreferences(context.tenantDb, {
        userId,
        ...input,
      });
      return updated;
    }),
};
