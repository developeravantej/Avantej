import { eq, and, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { user } from "@avantej-core/db/schema/auth";
import { requirePlatformAdmin } from "@/lib/admin-procedure";
import {
	getPlatformAdmin,
	getFirstActiveOrgForUser,
} from "@/services/admin.service";
import { getBetterAuth } from "@/lib/better-auth";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export const impersonationProcedures = {
	/**
	 * Start impersonating a user as a platform admin.
	 * Only super_admin and support roles may impersonate.
	 * Writes an audit row to admin_sessions.
	 */
	impersonateUser: protectedProcedure
		.use(requirePlatformAdmin(["super_admin", "support"]))
		.input(z.object({ userId: z.string().min(1).max(64) }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			// Prevent self-impersonation
			if (input.userId === context.session.user.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot impersonate yourself",
				});
			}

			// Prevent nested impersonation
			const rawSession = context.session as {
				session?: { impersonatedBy?: string | null };
			};
			if (rawSession.session?.impersonatedBy) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Already impersonating another user. Stop the current impersonation first.",
				});
			}

			const cph = context.honoContext;
			const controlPanelDb = getControlPanelDb(context);

			// Check target is not a platform admin
			const targetAdminRecord = await getPlatformAdmin(
				controlPanelDb,
				input.userId,
			);
			if (targetAdminRecord) {
				throw new ORPCError("FORBIDDEN", {
					message: "Cannot impersonate platform admins",
				});
			}

			// Verify target user exists
			const targetUser = await controlPanelDb.query.user.findFirst({
				where: eq(user.id, input.userId),
			});
			if (!targetUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target user not found",
				});
			}

			// Build auth instance with request-scoped pool
			const auth = getBetterAuth(cph);

			// Forward the incoming admin session cookie so Better-Auth validates the caller
			const incomingHeaders = new Headers(cph!.req.raw.headers);

			// Call Better-Auth impersonateUser — returnHeaders: true so we get Set-Cookie back
			const result = await auth.api.impersonateUser({
				body: { userId: input.userId },
				headers: incomingHeaders,
				returnHeaders: true,
			});

			// Extract Set-Cookie from the returned headers
			let setCookies: string[] = [];
			if (result.headers) {
				// Standard way to get multiple Set-Cookie values
				if (typeof result.headers.getSetCookie === "function") {
					setCookies = result.headers.getSetCookie();
				} else {
					// Fallback: iterate entries
					for (const [key, value] of result.headers.entries()) {
						if (key.toLowerCase() === "set-cookie") {
							setCookies.push(value);
						}
					}
				}
			}

			// Stash cookies on Hono context for the index.ts wrapper to re-attach
			if (setCookies.length > 0) {
				cph!.set("__impersonationSetCookie__", setCookies);
			}

			// Session token from Better-Auth's new impersonation session
			const newSessionToken = result.response.session.token;

			// Determine the target's primary organization (deterministic: earliest active)
			const organizationId = await getFirstActiveOrgForUser(
				controlPanelDb,
				input.userId,
			);

			// Insert audit row — wrap in try/catch; rollback by stopping impersonation on failure
			try {
				await controlPanelDb.insert(adminSessions).values({
					adminUserId: context.session.user.id,
					impersonatedUserId: input.userId,
					organizationId: organizationId ?? undefined,
					sessionToken: newSessionToken,
				});
			} catch (auditError) {
				console.error(
					"Audit insert failed, rolling back impersonation:",
					auditError,
				);

				// Rollback: use the NEW impersonation cookie to call stopImpersonating
				try {
					const rollbackHeaders = new Headers();
					for (const cookie of setCookies) {
						rollbackHeaders.append("Set-Cookie", cookie);
					}
					// Build a cookie header string from the Set-Cookie values
					// Better-Auth needs the session cookie to know which session to stop
					const cookieHeader = setCookies
						.map((c) => c.split(";")[0])
						.join("; ");
					const rollbackRequestHeaders = new Headers();
					rollbackRequestHeaders.set("cookie", cookieHeader);
					await auth.api.stopImpersonating({
						headers: rollbackRequestHeaders,
					});
				} catch (rollbackError) {
					console.error("Rollback failed:", rollbackError);
				}

				// Clear the stashed cookies so the browser doesn't get the impersonation cookie
				cph!.set("__impersonationSetCookie__", []);

				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to record impersonation audit. Session rolled back.",
					cause: auditError,
				});
			}

			return {
				success: true as const,
				redirectTo: "/dashboard",
				impersonatedUserId: input.userId,
				organizationId,
			};
		}),

	/**
	 * Stop an active impersonation session and restore the original admin session.
	 * Callable while impersonating (uses protectedProcedure — no admin gate).
	 */
	stopImpersonating: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		// Verify we are actually impersonating
		const rawSession = context.session as {
			session?: { impersonatedBy?: string | null; token?: string };
		};

		if (!rawSession.session?.impersonatedBy) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Not currently impersonating",
			});
		}

		// Capture token before we stop (for audit update)
		const currentSessionToken = rawSession.session.token;

		const cph = context.honoContext;
		const controlPanelDb = getControlPanelDb(context);

		const auth = getBetterAuth(cph);
		const incomingHeaders = new Headers(cph!.req.raw.headers);

		// Call Better-Auth to restore the original admin session
		const result = await auth.api.stopImpersonating({
			headers: incomingHeaders,
			returnHeaders: true,
		});

		// Extract and stash Set-Cookie for the index.ts wrapper
		let setCookies: string[] = [];
		if (result.headers) {
			if (typeof result.headers.getSetCookie === "function") {
				setCookies = result.headers.getSetCookie();
			} else {
				for (const [key, value] of result.headers.entries()) {
					if (key.toLowerCase() === "set-cookie") {
						setCookies.push(value);
					}
				}
			}
		}

		if (setCookies.length > 0) {
			cph!.set("__impersonationSetCookie__", setCookies);
		}

		// Close the audit row (if it exists — it's a no-op if 0 rows updated)
		if (currentSessionToken) {
			await controlPanelDb
				.update(adminSessions)
				.set({ endedAt: new Date() })
				.where(
					and(
						eq(adminSessions.sessionToken, currentSessionToken),
						isNull(adminSessions.endedAt),
					),
				);
		}

		return {
			success: true as const,
			redirectTo: "/dashboard/platform-admin/users",
		};
	}),

	/**
	 * Return whether the current session is an impersonation session, and of what type.
	 */
	getImpersonationStatus: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		const rawSession = context.session as {
			session?: { impersonatedBy?: string | null };
		};

		if (!rawSession.session?.impersonatedBy) {
			return { isImpersonating: false as const };
		}

		const originalAdminId = rawSession.session.impersonatedBy;

		const controlPanelDb = getControlPanelDb(context);

		// Look up original admin user
		const adminUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.id, originalAdminId),
		});

		// Determine type: platform if originalAdmin is in platform_admins
		const adminPlatformRecord = await getPlatformAdmin(
			controlPanelDb,
			originalAdminId,
		);
		const impersonationType = adminPlatformRecord ? "platform" : "tenant";

		// Current user is the impersonated user
		const impersonatedUser = context.session.user;

		return {
			isImpersonating: true as const,
			type: impersonationType as "platform" | "tenant",
			adminUser: {
				id: originalAdminId,
				email: adminUser?.email ?? null,
				name: adminUser?.name ?? null,
			},
			impersonatedUser: {
				id: impersonatedUser.id,
				email: impersonatedUser.email,
				name: impersonatedUser.name,
			},
		};
	}),
};
