/**
 * Push Tokens Router
 *
 * API endpoints for registering / unregistering Expo push notification
 * tokens on the user's devices. Tokens live in tenant DBs, so these run on
 * `tenantProcedure` — which guarantees `context.tenantDb` and that the caller
 * is a member of the org (the perimeter invariant enforced in CI).
 */

import { registerPushToken, unregisterPushToken } from "@avantej-core/services";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch } from "../guards";

export const pushTokensRouter = {
	register: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
				platform: z.enum(["ios", "android"]),
				deviceId: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			return registerPushToken(context.tenantDb, {
				userId: context.session.user.id,
				token: input.token,
				platform: input.platform,
				deviceId: input.deviceId,
			});
		}),

	unregister: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			return unregisterPushToken(context.tenantDb, input.token);
		}),
};
