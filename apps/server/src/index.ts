import { getBetterAuth } from "@/lib/better-auth";
import { dbMiddleware } from "@/middleware/db.middleware";
import { orpcTenantMiddleware } from "@/middleware/orpc-tenant.middleware";
import { rateLimit } from "@/middleware/rate-limit.middleware";
import { authRoutes } from "@/routes/auth.routes";
import { hierarchyRoutes } from "@/routes/hierarchy.routes";
import { organizationRoutes } from "@/routes/organizations.routes";
import { invitationRoutes } from "@/routes/invitations.routes";
import { webhookRoutes } from "@/routes/webhooks.routes";
import { stripeConnectOAuthRoutes } from "@/routes/stripe-connect-oauth.routes";
import googleCalendarRoutes from "@/routes/google-calendar";
import { authRouter } from "@/routers/auth";
import { serverInvitationRouter } from "@/routers/invitations";
import { serverCustomerProfilesRouter } from "@/routers/customer-profiles";
import { adminRouter } from "@/routers/admin";
import { tenantAdminRouter } from "@/routers/tenant-admin";
import { ghlRouter } from "@/routers/ghl";
import { subscriptionsRouter } from "@/routers/subscriptions";
import { stripeConnectRouter } from "@/routers/stripe-connect";
import { paymentsRouter } from "@/routers/payments";
import { platformAdminPaymentsRouter } from "@/routers/platform-admin-payments";
import { platformAdminTenantsRouter } from "@/routers/platform-admin-tenants";
import { platformAdminTenantsCommsRouter } from "@/routers/platform-admin-tenants-comms";
import { platformAdminTenantsProvisionRouter } from "@/routers/platform-admin-tenants-provision";
import { platformAdminTenantsDeletionRouter } from "@/routers/platform-admin-tenants-deletion";
import { platformAdminTenantsNotesRouter } from "@/routers/platform-admin-tenants-notes";
import { platformAdminTenantsTagsRouter } from "@/routers/platform-admin-tenants-tags";
import { platformAdminTenantsSearchRouter } from "@/routers/platform-admin-tenants-search";
import { platformAdminTenantsHealthRouter } from "@/routers/platform-admin-tenants-health";
import { platformAdminTenantsBillingRouter } from "@/routers/platform-admin-tenants-billing";
import { platformAdminTenantsMembersRouter } from "@/routers/platform-admin-tenants-members";
import { platformAdminTenantsFeatureFlagsRouter } from "@/routers/platform-admin-tenants-feature-flags";
import { platformAdminAuditRouter } from "@/routers/platform-admin-audit";
import { platformAdminDashboardRouter } from "@/routers/platform-admin-dashboard";
import { platformAdminRevenueRouter } from "@/routers/platform-admin-revenue";
import { platformAdminCommsRouter } from "@/routers/platform-admin-comms";
import { platformAdminCouponsRouter } from "@/routers/platform-admin-coupons";
import { platformAdminBillingRouter } from "@/routers/platform-admin-billing";
import { platformAdminRenewalsRouter } from "@/routers/platform-admin-renewals";
import { platformAdminHealthRouter } from "@/routers/platform-admin-health";
import { platformAdminWebhooksRouter } from "@/routers/platform-admin-webhooks";
import { platformAdminMigrationsRouter } from "@/routers/platform-admin-migrations";

import { createContext } from "@avantej-core/api/context";
import { baseRouter } from "@avantej-core/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { logger } from "hono/logger";

// Multi-port allowlist for dev/E2E (3001 = web, 4001 = E2E worktrees).
// Env CORS_ORIGIN adds a prod origin per-request.
const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3001",
  "http://localhost:4001",
]);
function getAllowedOrigin(env: Record<string, unknown>, requestOrigin?: string): string {
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) return requestOrigin;
  const envOrigin = env?.CORS_ORIGIN;
  if (requestOrigin && typeof envOrigin === "string" && envOrigin === requestOrigin) return requestOrigin;
  return ((typeof envOrigin === "string" && envOrigin) || "http://localhost:3001").trim();
}

// Combine base router with server-specific routers
const appRouter = {
	...baseRouter,
	auth: authRouter,
	// Extend invitations router with server-specific sendEmail procedure
	invitations: {
		...baseRouter.invitations,
		...serverInvitationRouter,
	},
	// Extend customerProfiles router with GHL sync-enabled overrides + softDelete
	customerProfiles: {
		...baseRouter.customerProfiles,
		...serverCustomerProfilesRouter,
	},
	admin: adminRouter,
	tenantAdmin: tenantAdminRouter,
	ghl: ghlRouter,
	subscriptions: subscriptionsRouter,
	stripeConnect: stripeConnectRouter,
	payments: paymentsRouter,
	platformAdminPayments: platformAdminPaymentsRouter,
	platformAdminTenants: {
		...platformAdminTenantsRouter,
		...platformAdminTenantsCommsRouter,
		...platformAdminTenantsProvisionRouter,
		...platformAdminTenantsDeletionRouter,
		notes: platformAdminTenantsNotesRouter,
		tags: platformAdminTenantsTagsRouter,
		search: platformAdminTenantsSearchRouter,
		health: platformAdminTenantsHealthRouter,
		billing: platformAdminTenantsBillingRouter,
		members: platformAdminTenantsMembersRouter,
		featureFlags: platformAdminTenantsFeatureFlagsRouter,
	},
	platformAdminAudit: platformAdminAuditRouter,
	platformAdminDashboard: platformAdminDashboardRouter,
	platformAdminRevenue: platformAdminRevenueRouter,
	platformAdminComms: platformAdminCommsRouter,
	platformAdminCoupons: platformAdminCouponsRouter,
	platformAdminBilling: platformAdminBillingRouter,
	platformAdminRenewals: platformAdminRenewalsRouter,
	platformAdminHealth: platformAdminHealthRouter,
	platformAdminWebhooks: platformAdminWebhooksRouter,
	platformAdminMigrations: platformAdminMigrationsRouter,
};

const app = new Hono();

app.use(logger());

// Manual CORS — replaces hono/cors to guarantee per-request origin resolution
app.use("/*", async (c, next) => {
  const origin = getAllowedOrigin(c.env as Record<string, unknown>, c.req.header("Origin"));
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }

  await next();

  for (const [k, v] of Object.entries(corsHeaders)) {
    c.header(k, v);
  }
});

// Database middleware: Creates request-scoped connection pools
// Must be applied early, before any database access
app.use("/*", dbMiddleware);

// oRPC tenant middleware: Sets up tenant DB for oRPC routes
// Must run after dbMiddleware but before createContext
app.use("/*", orpcTenantMiddleware);

// Phase 8.2 — rate-limit pre-auth endpoints. Per-isolate in-memory limiter;
// see middleware/rate-limit.middleware.ts for the Cloudflare-native upgrade.
//
// Better-Auth routes all sign-in / sign-up / password-reset under /api/auth/*.
// Cap login + signup at 10 req / IP / 60s. Password-reset endpoints fall
// under the same prefix, so the cap applies there too — intentional.
app.use(
	"/api/auth/sign-in/*",
	rateLimit({ route: "auth.signIn", limit: 10, windowSec: 60 }),
);
app.use(
	"/api/auth/sign-up/*",
	rateLimit({ route: "auth.signUp", limit: 10, windowSec: 60 }),
);
app.use(
	"/api/auth/forget-password",
	rateLimit({ route: "auth.forgetPassword", limit: 3, windowSec: 300 }),
);
app.use(
	"/api/auth/reset-password",
	rateLimit({ route: "auth.resetPassword", limit: 3, windowSec: 300 }),
);
// Custom auth + invitation endpoints (Hono routes, not Better-Auth handler).
app.use(
	"/api/invitations/accept",
	rateLimit({ route: "invitations.accept", limit: 5, windowSec: 60 }),
);

// Create a new Request with mutable headers for Cloudflare Workers compatibility
// Uses request-scoped Better-Auth instance for transaction support
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const origin = getAllowedOrigin(c.env as Record<string, unknown>, c.req.header("Origin"));
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    // Clone the request to get a new body stream (required for Cloudflare Workers)
    const clonedRequest = c.req.raw.clone();
    const headers = new Headers(clonedRequest.headers);
    const newRequest = new Request(clonedRequest.url, {
      method: clonedRequest.method,
      headers: headers,
      body: clonedRequest.body,
      ...(clonedRequest.body && { duplex: "half" }),
    });

    const auth = getBetterAuth(c);
    const response = await auth.handler(newRequest);

    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) newHeaders.set(k, v);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    console.error("[auth handler]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
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
app.route("/api/stripe/connect/oauth", stripeConnectOAuthRoutes);

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

// Phase 8.2 — liveness + readiness endpoints. Unauthenticated; no DB write.
//   /health is always 200 — used by uptime monitors.
//   /ready pings the control-panel DB. Tenant DBs are deliberately NOT in
//   /ready: a single bad Neon branch must not turn into a global outage.
app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/ready", async (c) => {
  try {
    const { getControlPanelDb } = await import("@/lib/db");
    const cpDb = getControlPanelDb();
    // Lightweight ping — single-row SELECT 1.
    await cpDb.execute("select 1");
    return c.json({ status: "ready" });
  } catch (err) {
    return c.json(
      {
        status: "not_ready",
        error: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  }
});

app.onError((err, c) => {
  console.error("[onError]", err);
  const origin = getAllowedOrigin(c.env as Record<string, unknown>, c.req.header("Origin"));
  return c.json(
    { error: err.message || "Internal server error" },
    500,
    {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    }
  );
});

// Plan C C.1 + C.6: scheduled handler dispatches cron triggers to services.
// Wrangler.jsonc declares 3 crons:
//   "0 * * * *"   — hourly webhook backfill (C.1)
//   "30 2 * * *"  — daily reconciliation at 02:30 UTC (C.5, wired in next slice)
//   "0 9 * * *"   — daily onboarding-stuck alert at 09:00 UTC (C.6)
//
// ADR-0021 — CF Cron over external cron / DO alarms.
export default {
  fetch: app.fetch,
  scheduled: async (
    event: ScheduledController | { cron: string },
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<void> => {
    const cron = "cron" in event ? event.cron : "";
    console.log(`[scheduled] firing cron='${cron}'`);

    // Lazy imports — avoid top-level side effects on cold start.
    const { getControlPanelDb } = await import("@/lib/db");
    const { getStripeClient } = await import("@/lib/stripe");

    // CF Workers scheduled handler doesn't get a Hono Context — fall back to
    // singleton DB (this is the documented exception per @/lib/db.ts).
    const cpDb = getControlPanelDb();

    try {
      if (cron === "0 * * * *") {
        const { runWebhookBackfill } = await import("@/services/webhook-backfill.service");
        ctx.waitUntil(
          runWebhookBackfill({ controlPanelDb: cpDb, stripe: getStripeClient() })
            .then((r) => console.log(`[scheduled] backfill done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] backfill failed:`, e)),
        );

        // Phase 5.6: also process due scheduled reports hourly.
        const { runScheduledReports } = await import("@/services/scheduled-reports.service");
        const { getTenantDb } = await import("@/lib/db");
        const dashboardUrl =
          (_env as { WEB_APP_URL?: string })?.WEB_APP_URL ??
          "https://app.avantej.com";
        ctx.waitUntil(
          runScheduledReports({
            controlPanelDb: cpDb,
            getTenantDb: (orgId) => getTenantDb(orgId),
            dashboardUrl,
          })
            .then((r) => console.log(`[scheduled] scheduled-reports done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] scheduled-reports failed:`, e)),
        );
      } else if (cron === "0 9 * * *") {
        const { runOnboardingAlerts } = await import("@/services/onboarding-alerts.service");
        ctx.waitUntil(
          runOnboardingAlerts({ controlPanelDb: cpDb })
            .then((r) => console.log(`[scheduled] onboarding-alerts done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] onboarding-alerts failed:`, e)),
        );
      } else if (cron === "30 2 * * *") {
        const { runReconciliation } = await import("@/services/reconciler.service");
        ctx.waitUntil(
          runReconciliation({ controlPanelDb: cpDb, stripe: getStripeClient() })
            .then((r) => console.log(`[scheduled] reconciliation done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] reconciliation failed:`, e)),
        );
      } else if (cron === "0 3 * * *") {
        // Plan E E.8 — hard-delete overdue soft-deleted tenants.
        const { hardDeleteOverdueTenants } = await import(
          "@/services/tenant-deletion.service"
        );
        const neonApiKey = (_env as { NEON_API_KEY?: string })?.NEON_API_KEY;
        ctx.waitUntil(
          hardDeleteOverdueTenants({ controlPanelDb: cpDb, neonApiKey })
            .then((r) => console.log(`[scheduled] tenant-hard-delete done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] tenant-hard-delete failed:`, e)),
        );
      } else if (cron === "0 1 * * *") {
        // Plan E E.2 — tenant usage snapshot.
        const { runTenantUsageSnapshots } = await import(
          "@/services/tenant-usage-snapshot.service"
        );
        const { getTenantDb } = await import("@/lib/db");
        ctx.waitUntil(
          runTenantUsageSnapshots({
            controlPanelDb: cpDb,
            getTenantDb: (orgId) => getTenantDb(orgId),
          })
            .then((r) => console.log(`[scheduled] usage-snapshot done: ${JSON.stringify(r)}`))
            .catch((e) => console.error(`[scheduled] usage-snapshot failed:`, e)),
        );
      } else if (cron === "0 2 * * *") {
        // Phase 4 installments — daily installment sweep (merged from PR #23).
        // TODO: merged from main — wire real multi-tenant sweep service.
        console.log("[scheduled] installment sweep trigger received (stub)");
      } else {
        console.warn(`[scheduled] unknown cron='${cron}' — no handler`);
      }
    } catch (e) {
      console.error(`[scheduled] dispatch threw for cron='${cron}':`, e);
    }
  },
};
