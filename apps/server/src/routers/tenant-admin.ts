/**
 * Tenant Admin Router
 *
 * oRPC procedures for tenant admins (member.role === 'admin') to impersonate
 * staff members within their own organization.
 *
 * Requires orpcTenantMiddleware to have run first — expects context.tenantDb,
 * context.member, and context.honoContext to be populated.
 *
 * This file lives in apps/server (not packages/api) because it imports
 * getBetterAuth — a server-only dependency. Type stubs for client inference
 * live in packages/api/src/routers/index.ts (tenantAdminRouterType).
 */

import { eq, and, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { memberSessions } from "@avantej-core/db/schema/tenant/member-sessions";
import { assertTenantAdminCanImpersonate } from "@avantej-core/services/tenant-admin.service";
import { getBetterAuth } from "@/lib/better-auth";
import { user as userTable } from "@avantej-core/db/schema/auth";

/**
 * Extract typed DB references from the oRPC context.
 * Mirrors the pattern used in apps/server/src/routers/admin.ts.
 */
function getContextDbs(context: {
	honoContext?: { get: (key: string) => unknown } | null;
	tenantDb?: unknown;
}) {
	const controlPanelDb = context.honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;

	const tenantDb = context.tenantDb as NeonDatabase<typeof tenantSchema> | undefined;

	if (!controlPanelDb || !tenantDb) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"Database context not available. Ensure organizationId is provided in the request body.",
		});
	}

	return { controlPanelDb, tenantDb };
}

export const tenantAdminRouter = {
	/**
	 * Impersonate a staff member within the caller's own organization.
	 *
	 * Guards:
	 * - Caller has member.role === 'admin' in the current tenant
	 * - Caller is NOT already impersonating (no nesting)
	 * - Target exists in the SAME tenant DB (cross-tenant blocked by scoped tenantDb)
	 * - Target has role === 'staff'
	 * - Target is NOT a platform admin
	 *
	 * On success: swaps the Better-Auth session cookie and inserts a member_sessions
	 * audit row. The Set-Cookie is stashed on Hono context for the apps/server/src/index.ts
	 * wrapper to re-attach (same pattern as admin.impersonateUser).
	 *
	 * Rollback: if the audit insert fails, calls stopImpersonating to undo the session
	 * swap and clears the stashed cookie before throwing 500.
	 */
	impersonateMember: protectedProcedure
		.input(z.object({
			organizationId: z.string().uuid(),
			targetMemberId: z.string().uuid(),
		}))
		.handler(async ({ input, context }) => {
			const session = context.session;
			if (!session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}

			const { controlPanelDb, tenantDb } = getContextDbs(context);

			// context.member is lifted from Hono context by createContext (orpcTenantMiddleware sets it)
			const member = context.member;
			if (!member) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Member context not found. Ensure organizationId is provided in the request.",
				});
			}

			// Extract impersonatedBy from the raw session to detect nested impersonation
			const rawSession = session as {
				session?: { impersonatedBy?: string | null; token?: string };
			};
			const impersonatedBy = rawSession.session?.impersonatedBy ?? null;

			// Run all precondition checks
			const { target } = await assertTenantAdminCanImpersonate(
				tenantDb,
				controlPanelDb,
				member.id,
				input.targetMemberId,
				impersonatedBy,
			);

			const cph = context.honoContext;
			if (!cph) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Hono context not available",
				});
			}

			const auth = getBetterAuth(cph);
			const incomingHeaders = new Headers(cph.req.raw.headers);

			// Better-Auth's admin plugin checks user.role === 'admin' on the CALLER before
			// allowing impersonation. Tenant admins are org-scoped admins (member.role),
			// not platform admins — their user.role is 'user'. We temporarily elevate to
			// 'admin' for this single call, then restore immediately after.
			const callerUserId = session.user.id;
			const callerOriginalRole = (session.user as { role?: string | null }).role ?? null;
			const needsElevation = callerOriginalRole !== "admin";

			if (needsElevation) {
				await controlPanelDb.update(userTable).set({ role: "admin" }).where(eq(userTable.id, callerUserId));
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let result: any;
			try {
				result = await auth.api.impersonateUser({
					body: { userId: target.userId },
					headers: incomingHeaders,
					returnHeaders: true,
				});
			} finally {
				// Always restore role — even if impersonation throws
				if (needsElevation) {
					await controlPanelDb.update(userTable).set({ role: callerOriginalRole }).where(eq(userTable.id, callerUserId));
				}
			}

			// Extract Set-Cookie headers — mirror of admin.impersonateUser pattern
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

			// Stash cookies on Hono context — apps/server/src/index.ts merges them
			if (setCookies.length > 0) {
				cph.set("__impersonationSetCookie__", setCookies);
			}

			// Session token for the new impersonation session (for audit row)
			const newSessionToken = (result.response as { session?: { token?: string } }).session?.token ?? "";

			// Insert audit row — rollback on failure (atomicity without cross-DB TX)
			try {
				await tenantDb.insert(memberSessions).values({
					adminMemberId: member.id,
					impersonatedMemberId: target.id,
					adminUserId: session.user.id,
					impersonatedUserId: target.userId,
					sessionToken: newSessionToken,
				});
			} catch (auditError) {
				console.error(
					"Tenant admin impersonation audit insert failed — rolling back session:",
					auditError,
				);

				// Rollback: use the new cookie to build headers, then stop impersonating
				try {
					const cookieHeader = setCookies
						.map((c) => c.split(";")[0])
						.join("; ");
					const rollbackHeaders = new Headers();
					rollbackHeaders.set("cookie", cookieHeader);
					await auth.api.stopImpersonating({ headers: rollbackHeaders });
				} catch (rollbackError) {
					console.error("Rollback failed:", rollbackError);
				}

				// Clear stashed cookies so browser does not receive the impersonation cookie
				cph.set("__impersonationSetCookie__", []);

				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to record impersonation audit. Session rolled back.",
					cause: auditError,
				});
			}

			return {
				success: true as const,
				redirectTo: "/dashboard",
				impersonatedUserId: target.userId,
			};
		}),

	/**
	 * Stop an active tenant-admin impersonation session and restore the original session.
	 *
	 * Updates member_sessions.endedAt for the closed session token.
	 * Safe to call even if no member_sessions row exists for this token (e.g., if
	 * somehow the scope classification resolves to 'tenant' for a platform session —
	 * the UPDATE becomes a no-op).
	 */
	stopImpersonating: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
		const session = context.session;
		if (!session?.user) {
			throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
		}

		const rawSession = session as {
			session?: { impersonatedBy?: string | null; token?: string };
		};

		if (!rawSession.session?.impersonatedBy) {
			throw new ORPCError("BAD_REQUEST", { message: "Not currently impersonating" });
		}

		// Capture token BEFORE stopping (Better-Auth will issue a new session token)
		const currentSessionToken = rawSession.session.token;

		const cph = context.honoContext;
		if (!cph) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Hono context not available",
			});
		}

		// tenantDb needed to close the audit row — may not be available if called
		// from a non-org context. In that case the UPDATE is skipped gracefully.
		const tenantDb = context.tenantDb as NeonDatabase<typeof tenantSchema> | undefined;

		const auth = getBetterAuth(cph);
		const incomingHeaders = new Headers(cph.req.raw.headers);

		// Restore the original admin session
		const result = await auth.api.stopImpersonating({
			headers: incomingHeaders,
			returnHeaders: true,
		});

		// Re-attach cookies via Hono context stash
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
			cph.set("__impersonationSetCookie__", setCookies);
		}

		// Close the audit row — no-op if token not found (e.g. already closed)
		if (tenantDb && currentSessionToken) {
			await tenantDb
				.update(memberSessions)
				.set({ endedAt: new Date() })
				.where(
					and(
						eq(memberSessions.sessionToken, currentSessionToken),
						isNull(memberSessions.endedAt),
					),
				);
		}

		return {
			success: true as const,
			redirectTo: "/dashboard/user/view",
		};
	}),
};
