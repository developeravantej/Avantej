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
import { members } from "@avantej-core/db/schema/tenant/members";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { getDescendantNodeIds } from "@avantej-core/services";
import { getBetterAuth } from "@/lib/better-auth";

export const orpcTenantMiddleware = createMiddleware(async (c, next) => {
  // Only process oRPC routes
  if (!c.req.path.startsWith('/rpc')) {
    await next();
    return;
  }

  // Check if this is a public-like endpoint by path (needs tenantDb but not necessarily an existing member)
  // oRPC routes are at /rpc/invitations/getByToken or /rpc/invitations/accept or /rpc/registration/complete
  const isInvitationPublicEndpointByPath = c.req.path.includes('/invitations/getByToken') ||
                                           c.req.path.includes('/invitations/accept') ||
                                           c.req.path.includes('/invitations/verifyEmailByToken') ||
                                           c.req.path.includes('/registration/complete');

  try {
    // Parse request body to extract organizationId
    // Clone request to avoid consuming the body stream
    const clonedRequest = c.req.raw.clone();
    const contentType = clonedRequest.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      let body: any;
      try {
        body = await clonedRequest.json();
      } catch (parseError) {
        console.error("Failed to parse oRPC request body:", {
          error: parseError instanceof Error ? parseError.message : String(parseError),
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
        if (typeof body.json === 'string') {
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
      const organizationId = rpcPayload?.params?.input?.organizationId || rpcPayload?.organizationId;

      // Check if this is a public invitation endpoint that doesn't require a user session
      // Check both path (more reliable) and method name (handles different formats)
      const isInvitationPublicEndpointByMethod = method && (
        method.includes('invitations.getByToken') ||
        method.includes('invitations.accept') ||
        method.includes('invitations.verifyEmailByToken') ||
        method.includes('invitations/getByToken') ||
        method.includes('invitations/accept') ||
        method.includes('invitations/verifyEmailByToken') ||
        method === 'invitations.getByToken' ||
        method === 'invitations.accept' ||
        method === 'invitations.verifyEmailByToken' ||
        method.includes('registration.complete') ||
        method.includes('registration/complete') ||
        method === 'registration.complete'
      );

      const isInvitationPublicEndpoint = isInvitationPublicEndpointByPath || isInvitationPublicEndpointByMethod;

      // Debug logging for invitation endpoints
      if (isInvitationPublicEndpoint) {
        console.log("🔓 Public invitation endpoint detected:", {
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

      // Plan E E.3 / ADR-0024 — block oRPC mutations on suspended tenants.
      // Platform-admin endpoints bypass so ops can resume/cancel.
      const methodStr = String(method ?? "");
      const isPlatformAdminCall =
        methodStr.startsWith("platformAdmin") || methodStr.startsWith("admin.");
      if (!isPlatformAdminCall) {
        try {
          const cpDb = getControlPanelDb(c);
          const org = await cpDb.query.organizations.findFirst({
            where: eq(organizations.id, organizationId),
            columns: { id: true, paymentStatus: true },
          });
          if (
            org?.paymentStatus === "suspended" ||
            org?.paymentStatus === "cancelled"
          ) {
            return c.json(
              {
                error: `Tenant is ${org.paymentStatus}`,
                paymentStatus: org.paymentStatus,
              },
              403,
            );
          }
        } catch (e) {
          // If we can't check, fall through — handler-level checks remain.
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
          console.warn("No user session found in oRPC middleware for organization:", organizationId);
          await next();
          return;
        }

        // Set up tenant DB using request-scoped pool
        let tenantDb;
        try {
          tenantDb = await getTenantDb(organizationId, c);
          console.log("✅ Tenant DB set up successfully for organization:", organizationId);
        } catch (tenantDbError) {
          console.error("❌ getTenantDb failed:", {
            error: tenantDbError instanceof Error ? tenantDbError.message : String(tenantDbError),
            organizationId,
            errorName: tenantDbError instanceof Error ? tenantDbError.name : undefined,
            stack: tenantDbError instanceof Error ? tenantDbError.stack : undefined,
          });
          // Don't set tenantDb - let handler return proper error
          await next();
          return;
        }

        c.set('organizationId', organizationId);
        c.set('tenantDb', tenantDb);

        // Only get member record if user exists (skip for public invitation endpoints without user)
        if (user) {
          // Get member record
          const member = await tenantDb.query.members.findFirst({
            where: eq(members.userId, user.id),
          });

          if (member) {
            // Calculate accessible node IDs
            const accessibleNodeIds = await getDescendantNodeIds(tenantDb, member.hierarchyScopeId);

            c.set('member', member);
            c.set('accessibleNodeIds', accessibleNodeIds);
          } else {
            // Member not found - this is OK for invitation endpoints (user might be new)
            // For other endpoints, handler will return proper error
            console.log(`Member not found for user ${user.id} in organization ${organizationId} - this is OK for invitation endpoints`);
          }
        } else {
          // No user session - this is OK for public invitation endpoints
          console.log(`No user session for invitation endpoint - tenantDb set up for organization ${organizationId}`);
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
