/**
 * Onboarding Router
 *
 * Public endpoints for the branch QR-code self-signup flow (Journey H).
 * No authentication required — these are called before the customer has an account.
 *
 * URL contract (set by branchInvites.create):
 *   GET /onboarding/<token>?org=<orgId>   → getInviteContext
 *   POST (mutation)                        → redeemInvite
 *
 * Both procedures receive organizationId from the query param so the correct
 * tenant DB can be resolved by orpcTenantMiddleware.
 */

import { ORPCError } from "@orpc/server";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { z } from "zod";
import { publicProcedure } from "../index";
import {
	getInviteContext,
	redeemBranchInvite,
} from "@avantej-core/services/onboarding.service";

function getControlPanelDb(context: {
	honoContext?: { get: (key: string) => unknown };
}): NeonDatabase<typeof controlPanelSchema> | null {
	return (context.honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| null) ?? null;
}

function getBetterAuthBaseUrl(context: {
	honoContext?: { get: (key: string) => unknown; req: { url: string } };
}): string {
	// Derive from the request URL (strip the path) — avoids hardcoding
	const rawUrl = context.honoContext?.req?.url;
	if (rawUrl) {
		try {
			const parsed = new URL(rawUrl);
			return `${parsed.protocol}//${parsed.host}`;
		} catch {
			// fall through
		}
	}
	return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const onboardingRouter = {
	/**
	 * getInviteContext — public
	 *
	 * Returns branded org/branch info for the onboarding landing page.
	 * Validates the invite is active, not expired, and has capacity.
	 * Throws NOT_FOUND (404) if the token doesn't exist.
	 * Throws GONE (410) if revoked, expired, or max-uses reached.
	 */
	getInviteContext: publicProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organizationId is included in the request.",
				});
			}

			const controlPanelDb = getControlPanelDb(context);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available.",
				});
			}

			try {
				return await getInviteContext({
					token: input.token,
					tenantDb: context.tenantDb,
					controlPanelDb,
					organizationId: input.organizationId,
				});
			} catch (err: unknown) {
				// Re-map service errors to ORPC errors
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "NOT_FOUND") {
						throw new ORPCError("NOT_FOUND", { message: err.message });
					}
					if (code === "GONE") {
						// GONE is not a standard ORPC code; use NOT_FOUND with a descriptive message
						throw new ORPCError("NOT_FOUND", {
							message: err.message,
							cause: { httpCode: 410 },
						});
					}
				}
				throw err;
			}
		}),

	/**
	 * redeemInvite — public
	 *
	 * Creates a Better-Auth user + tenant member row and returns a session token.
	 * Idempotent: re-submitting with the same email + token returns a fresh sign-in session.
	 */
	redeemInvite: publicProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				token: z.string().min(1),
				email: z.string().email(),
				password: z.string().min(8),
				fullName: z.string().min(1).max(200),
				phone: z.string().max(30).optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organizationId is included in the request.",
				});
			}

			const controlPanelDb = getControlPanelDb(context);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available.",
				});
			}

			const betterAuthBaseUrl = getBetterAuthBaseUrl(context);

			// Retrieve the raw Request for Better-Auth header forwarding
			const rawRequest: Request =
				(context.honoContext?.req as unknown as { raw: Request })?.raw ??
				new Request("http://localhost");

			try {
				const result = await redeemBranchInvite({
					token: input.token,
					organizationId: input.organizationId,
					email: input.email,
					password: input.password,
					fullName: input.fullName,
					phone: input.phone ?? null,
					tenantDb: context.tenantDb,
					controlPanelDb,
					betterAuthBaseUrl,
					rawRequest,
				});

				return {
					userId: result.userId,
					memberId: result.memberId,
					sessionToken: result.sessionToken,
					isExistingUser: result.isExistingUser,
				};
			} catch (err: unknown) {
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "NOT_FOUND") {
						throw new ORPCError("NOT_FOUND", { message: err.message });
					}
					if (code === "GONE") {
						throw new ORPCError("NOT_FOUND", {
							message: err.message,
							cause: { httpCode: 410 },
						});
					}
					// Surface auth failures as BAD_REQUEST (wrong password on idempotent path)
					if (
						err.message.includes("sign-in failed") ||
						err.message.includes("sign-up failed")
					) {
						throw new ORPCError("BAD_REQUEST", { message: err.message });
					}
				}
				throw err;
			}
		}),
};
