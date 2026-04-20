import { getBetterAuth } from "@/lib/better-auth";
import { dbMiddleware } from "@/middleware/db.middleware";
import { orpcTenantMiddleware } from "@/middleware/orpc-tenant.middleware";
import { authRoutes } from "@/routes/auth.routes";
import { hierarchyRoutes } from "@/routes/hierarchy.routes";
import { organizationRoutes } from "@/routes/organizations.routes";
import { invitationRoutes } from "@/routes/invitations.routes";
import { webhookRoutes } from "@/routes/webhooks.routes";
import googleCalendarRoutes from "@/routes/google-calendar";
import { authRouter } from "@/routers/auth";
import { serverInvitationRouter } from "@/routers/invitations";
import { adminRouter } from "@/routers/admin";
import { tenantAdminRouter } from "@/routers/tenant-admin";

import { createContext } from "@avantej-core/api/context";
import { baseRouter } from "@avantej-core/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const ALLOWED_ORIGIN = (typeof env !== "undefined" && env?.CORS_ORIGIN) || "http://localhost:3001";

// Combine base router with server-specific routers
const appRouter = {
	...baseRouter,
	auth: authRouter,
	// Extend invitations router with server-specific sendEmail procedure
	invitations: {
		...baseRouter.invitations,
		...serverInvitationRouter,
	},
	admin: adminRouter,
	tenantAdmin: tenantAdminRouter,
};

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ALLOWED_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Database middleware: Creates request-scoped connection pools
// Must be applied early, before any database access
app.use("/*", dbMiddleware);

// oRPC tenant middleware: Sets up tenant DB for oRPC routes
// Must run after dbMiddleware but before createContext
app.use("/*", orpcTenantMiddleware);

// Better-Auth handler for internal auth routes (e.g., /api/auth/get-session, sign-in, sign-up)
// OPTIONS: respond to CORS preflight so browser allows GET/POST from web origin
app.on(["OPTIONS"], "/api/auth/*", (_c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true",
    },
  });
});

// Create a new Request with mutable headers for Cloudflare Workers compatibility
// Uses request-scoped Better-Auth instance for transaction support
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  // Clone the request to get a new body stream (required for Cloudflare Workers)
  const clonedRequest = c.req.raw.clone();

  // Create new mutable headers
  const headers = new Headers(clonedRequest.headers);

  // Create a new Request with mutable headers and cloned body
  const newRequest = new Request(clonedRequest.url, {
    method: clonedRequest.method,
    headers: headers,
    body: clonedRequest.body,
    ...(clonedRequest.body && { duplex: "half" }),
  });

  // Use request-scoped Better-Auth instance
  const auth = getBetterAuth(c);
  const response = await auth.handler(newRequest);

  // Ensure CORS headers on auth response (browser requires them for cross-origin requests)
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  newHeaders.set("Access-Control-Allow-Credentials", "true");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
});

// Custom auth routes following OpenAPI contract
app.route("/auth", authRoutes);
app.route("/auth/google-calendar", googleCalendarRoutes);

// Organization routes following OpenAPI contract
app.route("/orgs", organizationRoutes);

// Hierarchy routes (nested under organizations)
app.route("/orgs/:organizationId/hierarchy", hierarchyRoutes);

// Invitation routes (for email sending)
app.route("/api/invitations", invitationRoutes);

// Webhook routes (external integrations)
app.route("/webhooks", webhookRoutes);

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

// oRPC and OpenAPI handlers - only for specific prefixes
app.use("/rpc/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    // Re-attach any Set-Cookie headers stored by impersonation procedures.
    // oRPC builds its own Response object and doesn't inherit Hono context headers,
    // so impersonation handlers stash cookies via c.set("__impersonationSetCookie__", string[])
    // and we merge them here before returning to the browser.
    const impersonationCookies = c.get("__impersonationSetCookie__");
    if (impersonationCookies && impersonationCookies.length > 0) {
      const merged = new Headers(rpcResult.response.headers);
      for (const cookie of impersonationCookies) {
        merged.append("Set-Cookie", cookie);
      }
      // Build a new Response (not c.newResponse) to preserve status + merged headers
      const mergedResponse = new Response(rpcResult.response.body, {
        status: rpcResult.response.status,
        statusText: rpcResult.response.statusText,
        headers: merged,
      });
      return mergedResponse;
    }
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  await next();
});

app.use("/api-reference/*", async (c, next) => {
  const context = await createContext({ context: c });

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
