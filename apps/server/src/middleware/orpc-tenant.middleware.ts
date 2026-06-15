/**
 * oRPC Tenant Middleware
 *
 * Extracts organizationId from oRPC request body and sets up tenant DB context
 * This runs before createContext to ensure tenant DB is available for oRPC handlers
 *
 * This middleware is necessary because oRPC routes don't go through tenantMiddleware,
 * so we need to extract organizationId from the request body and set up tenant DB here.
 */

import { createMiddleware } from "hono/factory";
import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { resolveMemberContext } from "@avantej-core/services";
import { getBetterAuth } from "@/lib/better-auth";
import { matchesPublicTenantEndpoint } from "./public-endpoints";
import { isAppBlocked } from "@/services/tenant-lifecycle.service";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import {
	evaluateAccess,
	isWriteProcedure,
	type SubStateInput,
} from "@/middleware/require-active-saas-sub.middleware";

export const orpcTenantMiddleware = createMiddleware(async (c, next) => {
	// Only process oRPC routes
	if (!c.req.path.startsWith("/rpc")) {
		await next();
		return;
	}

	// Happy-path debug logging is gated behind DEBUG_TENANT_MW so it does not
	// fire on every production /rpc request. Fault-path console.error/warn stay
	// unconditional. Mirrors the (c.env as Record<...>) access used for the
	// installment lock flag below.
	const tenantMwDebugEnabled =
		(c.env as Record<string, unknown>)?.DEBUG_TENANT_MW === "true";
	const debugLog = (...args: unknown[]) => {
		if (tenantMwDebugEnabled) console.log(...args);
	};

	// Public-like endpoint by path (needs tenantDb but not necessarily an
	// existing member). See PUBLIC_TENANT_ENDPOINT_SUFFIXES above.
	const isInvitationPublicEndpointByPath = matchesPublicTenantEndpoint(
		c.req.path,
	);

	try {
		// Parse request body to extract organizationId
		// Clone request to avoid consuming the body stream
		const clonedRequest = c.req.raw.clone();
		const contentType = clonedRequest.headers.get("content-type");

		if (contentType?.includes("application/json")) {
			let body: any;
			try {
				body = await clonedRequest.json();
			} catch (parseError) {
				console.error("Failed to parse oRPC request body:", {
					error:
						parseError instanceof Error
							? parseError.message
							: String(parseError),
					path: c.req.path,
					contentType,
				});
				await next();
				return;
			}

			// oRPC format can be:
			// 1. Direct: { jsonrpc: "2.0", method: "...", params: { input: {...} } }
			// 2. Wrapped: { json: { jsonrpc: "2.0", method: "...", params: { input: {...} } } }
			// 3. String wrapped: { json: "{\"jsonrpc\":\"2.0\",...}" }

			let rpcPayload = body;

			// Handle wrapped format
			if (body.json) {
				if (typeof body.json === "string") {
					try {
						rpcPayload = JSON.parse(body.json);
					} catch (e) {
						console.error("Failed to parse body.json string:", e);
						await next();
						return;
					}
				} else {
					rpcPayload = body.json;
				}
			}

			// Extract method name and organizationId from oRPC payload
			// oRPC can send in different formats:
			// 1. { jsonrpc: "2.0", method: "invitations.getByToken", params: { input: { organizationId: "..." } } }
			// 2. { organizationId: "..." } - direct format (what we're actually receiving)
			const method = rpcPayload?.method || rpcPayload?.params?.method;
			const organizationId =
				rpcPayload?.params?.input?.organizationId || rpcPayload?.organizationId;

			// Check if this is a public invitation endpoint that doesn't require a
			// user session. Both path and method are checked against the same
			// PUBLIC_TENANT_ENDPOINT_SUFFIXES source of truth (substring match
			// covers acceptWithSignup — see note on the constant).
			const isInvitationPublicEndpointByMethod =
				matchesPublicTenantEndpoint(method);

			const isInvitationPublicEndpoint =
				isInvitationPublicEndpointByPath || isInvitationPublicEndpointByMethod;

			// Debug logging for invitation endpoints (gated)
			if (isInvitationPublicEndpoint) {
				debugLog("🔓 Public invitation endpoint detected:", {
					path: c.req.path,
					method,
					organizationId,
					isInvitationPublicEndpointByPath,
					isInvitationPublicEndpointByMethod,
				});
			}

			if (!organizationId) {
				await next();
				return;
			}

			// ─── ADR-0024 suspension/cancellation gate (Layer 1) ───────────────
			// Block oRPC mutations on app-blocked tenants (suspended | cancelled —
			// see isAppBlocked). Platform-admin endpoints bypass so ops can
			// resume/cancel/inspect. A later Layer-2 read-only billing gate sits
			// beside this self-contained block.
			//
			// Procedure identity is taken from the URL PATH — the oRPC RPCLink wire
			// format encodes the procedure in the path (/rpc/<router>/<proc>) and the
			// body is { json: input } with NO `method`. Deriving the bypass from a
			// body `method` makes it always-false, which would 403 every platform-admin
			// recovery call (resume / forceCancel / reTrial) against the suspended
			// target tenant — a deadlock with no way back.
			const procPath = c.req.path.replace(/^\/rpc\//, "").replace(/\//g, ".");
			const isPlatformAdminCall =
				procPath.startsWith("platformAdmin") || procPath.startsWith("admin.");
			if (!isPlatformAdminCall) {
				try {
					const cpDb = getControlPanelDb(c);
					const org = await cpDb.query.organizations.findFirst({
						where: eq(organizations.id, organizationId),
						columns: {
							id: true,
							paymentStatus: true,
							subscriptionId: true,
							trialEndsAt: true,
						},
					});
					// Cross-tenant safety: if the requested organizationId doesn't
					// resolve to any organization, reject with FORBIDDEN BEFORE we
					// attempt getTenantDb. Without this, getTenantDb fails (no neon
					// branch for an unknown org), the middleware falls through with
					// tenantDb=null, and the procedure's assertTenantContext fires
					// with INTERNAL_SERVER_ERROR (500) — the security guard still
					// works, but a permission denial surfaced as a 500 is wrong and
					// creates noisy monitoring. Use 403 here so the surface code
					// matches the actual reason.
					if (!org) {
						return c.json(
							{ error: "Forbidden: organization not accessible" },
							403,
						);
					}
					// `org` is defined — check Layer-1 app-blocked state.
					if (isAppBlocked(org.paymentStatus)) {
						return c.json(
							{
								error: `Tenant is ${org.paymentStatus}`,
								paymentStatus: org.paymentStatus,
							},
							403,
						);
					}

					// ─── ADR-0003/0009 SaaS-subscription read-only gate (Layer 2) ───
					// A lapsed SaaS subscription (past_due past grace / canceled /
					// unpaid / trial-expired) puts the tenant in read-only: WRITE
					// (mutation) procedures are blocked, reads pass. The billing escape
					// hatch (subscriptions.*) and signup (registration.*) are exempt so a
					// lapsed tenant can still reach checkout to recover. Platform-admin
					// already bypassed above. We only load the subscription row for write
					// procedures (reads skip this entirely).
					//
					// NOTE: this enforces read-only (block writes) for BOTH the
					// read_only and block decisions. The stricter ADR-0003 full lockout
					// (trial-expired = no access at all, including reads) is intentionally
					// deferred until the locked-out UX and a read-side exempt-list
					// (auth/userContext, subscriptions) are verified — blocking reads
					// here would lock a tenant out of the screens needed to subscribe.
					const isBillingExempt =
						procPath.startsWith("subscriptions") ||
						procPath.startsWith("registration");
					// Only gate tenants actually on the SaaS billing path (those with a
					// subscription). An admin-provisioned tenant (paymentStatus=active,
					// no subscription yet) must NOT be write-locked — the Layer-1
					// lifecycle gate already governs its access. Without this guard,
					// evaluateAccess(null sub) returns `block` (trial_expired_no_sub) and
					// 403s a healthy provisioned tenant.
					if (
						org.subscriptionId &&
						!isBillingExempt &&
						isWriteProcedure(procPath)
					) {
						let sub: SubStateInput = null;
						{
							const subRow = await cpDb.query.subscriptions.findFirst({
								where: eq(subscriptions.id, org.subscriptionId),
								columns: {
									status: true,
									pastDueAt: true,
									gracePeriodEndsAt: true,
									trialEndsAt: true,
								},
							});
							if (subRow) sub = subRow;
						}
						const decision = evaluateAccess(sub, new Date(), org.trialEndsAt);
						if (
							decision.decision === "read_only" ||
							decision.decision === "block"
						) {
							return c.json(
								{
									error: `Read-only: SaaS subscription ${decision.reason}`,
									saas: decision.reason,
								},
								403,
							);
						}
					}
				} catch (e) {
					// If we can't check (e.g. control-panel DB unavailable), fall
					// through — handler-level checks remain. We intentionally do NOT
					// 403 here because that would convert infra failures into auth
					// errors and mask real outages.
					console.warn("suspension check failed:", e);
				}
			}

			try {
				// Get user from Better-Auth session (more reliable than context.get("user"))
				const auth = getBetterAuth(c);
				const session = await auth.api.getSession({
					headers: c.req.raw.headers,
				});

				const user = session?.user;

				// For public invitation endpoints, we still need tenantDb even without a user session
				// For other endpoints, require a user session
				if (!user && !isInvitationPublicEndpoint) {
					console.warn(
						"No user session found in oRPC middleware for organization:",
						organizationId,
					);
					await next();
					return;
				}

				// Set up tenant DB using request-scoped pool
				let tenantDb;
				try {
					tenantDb = await getTenantDb(organizationId, c);
					debugLog(
						"✅ Tenant DB set up successfully for organization:",
						organizationId,
					);
				} catch (tenantDbError) {
					console.error("❌ getTenantDb failed:", {
						error:
							tenantDbError instanceof Error
								? tenantDbError.message
								: String(tenantDbError),
						organizationId,
						errorName:
							tenantDbError instanceof Error ? tenantDbError.name : undefined,
						stack:
							tenantDbError instanceof Error ? tenantDbError.stack : undefined,
					});
					// Don't set tenantDb - let handler return proper error
					await next();
					return;
				}

				c.set("organizationId", organizationId);
				c.set("tenantDb", tenantDb);

				// Thread installmentLockOnOpen env flag — default true if unset
				const lockOnOpenRaw = (c.env as Record<string, unknown>)
					?.INSTALLMENTS_LOCK_ON_OPEN;
				const installmentLockOnOpen = lockOnOpenRaw !== "false";
				c.set("installmentLockOnOpen", installmentLockOnOpen);

				// Only get member record if user exists (skip for public invitation endpoints without user)
				if (user) {
					const resolved = await resolveMemberContext(tenantDb, user.id);
					if (resolved) {
						c.set("member", resolved.member);
						c.set("accessibleNodeIds", resolved.accessibleNodeIds);
					} else {
						// Member not found - this is OK for invitation endpoints (user might be new)
						// For other endpoints, handler will return proper error
						debugLog(
							`Member not found for user ${user.id} in organization ${organizationId} - this is OK for invitation endpoints`,
						);
					}
				} else {
					// No user session - this is OK for public invitation endpoints
					debugLog(
						`No user session for invitation endpoint - tenantDb set up for organization ${organizationId}`,
					);
				}
			} catch (dbError) {
				console.error("Failed to set up tenant DB in oRPC middleware:", {
					error: dbError instanceof Error ? dbError.message : String(dbError),
					organizationId,
					stack: dbError instanceof Error ? dbError.stack : undefined,
				});
				// Don't re-throw - let handler return proper error based on missing tenantDb
				await next();
				return;
			}
		} else {
			console.warn("oRPC request missing JSON content-type:", {
				contentType,
				path: c.req.path,
			});
		}
	} catch (error) {
		// Log but don't fail - createContext/handler will handle errors appropriately
		console.error("Unexpected error in oRPC tenant middleware:", {
			error: error instanceof Error ? error.message : String(error),
			path: c.req.path,
			stack: error instanceof Error ? error.stack : undefined,
		});
	}

	await next();
});
