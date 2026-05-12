/**
 * Notifications Router
 *
 * API endpoints for user notifications (list, mark read). Scoped to session user.
 */

import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const notificationsRouter = {
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        isRead: z.boolean().optional(),
        type: z.string().optional(),
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

      return listNotifications(context.tenantDb, {
        userId,
        isRead: input.isRead,
        type: input.type,
        limit: input.limit,
      });
    }),

  getUnreadCount: protectedProcedure
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

      return getUnreadCount(context.tenantDb, userId);
    }),

  markRead: protectedProcedure
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

      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const row = await markNotificationRead(
        context.tenantDb,
        input.id,
        userId
      );
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: "Notification not found",
        });
      }
      return row;
    }),

  markAllRead: protectedProcedure
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

      const count = await markAllNotificationsRead(context.tenantDb, userId);
      return { count };
    }),
};
