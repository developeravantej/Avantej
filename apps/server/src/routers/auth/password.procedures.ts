import { verifyEmailToken } from "@/services/auth.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { authMiddleware, o } from "./_shared";

/**
 * Verify email procedure - Verify email address via token
 */
export const verifyEmail = o
	.input(
		z.object({
			token: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const { token } = input;
		const c = context.honoContext;

		if (!c) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Missing Hono context",
			});
		}

		try {
			await verifyEmailToken(token, c);
			return { message: "Email verified successfully" };
		} catch (error) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Invalid or expired token",
			});
		}
	});

/**
 * Set password procedure — for accounts that have no password yet (e.g. a
 * customer who just claimed their profile via magic link). Requires an active
 * session; calls Better-Auth's server-only `setPassword`, which links a
 * credential account when none exists. If a password is already set (e.g. the
 * claim link was used twice), we treat it as success so the UX is idempotent.
 */
export const setPassword = o
	.use(authMiddleware)
	.input(
		z.object({
			newPassword: z.string().min(8),
		}),
	)
	.handler(async ({ input, context }) => {
		const c = context.honoContext;
		if (!c) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Missing Hono context",
			});
		}

		const getBetterAuthFn = c.get("getBetterAuth");
		const auth = getBetterAuthFn ? getBetterAuthFn() : null;
		if (!auth) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Auth service unavailable",
			});
		}

		try {
			// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
			await (auth as any).api.setPassword({
				body: { newPassword: input.newPassword },
				headers: c.req.raw.headers,
			});
			return { success: true, alreadySet: false };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// Idempotent: a password already exists on this account.
			if (message.toLowerCase().includes("already")) {
				return { success: true, alreadySet: true };
			}
			throw new ORPCError("BAD_REQUEST", {
				message: message || "Failed to set password",
			});
		}
	});
