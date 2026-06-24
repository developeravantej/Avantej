/**
 * Push Tokens Router
 *
 * API endpoints for registering / unregistering Expo push notification
 * tokens on the user's devices. Tokens live in tenant DBs.
 */

import {
	registerPushToken,
	unregisterPushToken,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const pushTokensRouter = {
	register: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
				platform: z.enum(["ios", "android"]),
				deviceId: z.string().optional(),
			}),
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

			return registerPushToken(context.tenantDb, {
				userId,
				token: input.token,
				platform: input.platform,
				deviceId: input.deviceId,
			});
		}),

	unregister: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
			}),
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

			return unregisterPushToken(context.tenantDb, input.token);
		}),
};
