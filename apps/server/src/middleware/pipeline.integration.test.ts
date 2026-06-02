/**
 * Middleware Pipeline Integration Test
 *
 * Proves that authMiddleware, tenantMiddleware, and adminMiddleware compose
 * correctly in a real Hono application — not isolated stubs.
 *
 * Key design note: tenantMiddleware reads URL params only when registered on a
 * path-specific pattern (e.g. "/protected/:organizationId"). When registered
 * globally as "app.use('*', ...)", Hono has not yet matched the route, so
 * c.req.param() returns undefined. This matches real usage — the server never
 * applies tenantMiddleware as a global wildcard.
 *
 * Tests (8 total):
 *  1. Unauthenticated request → 401 from authMiddleware; terminal handler NOT reached
 *  2. Authenticated + valid org → 200; terminal handler receives user, organizationId, tenantDb
 *  3. Authenticated + no org ID (no param, no header, no session orgId) → 400
 *  4. Authenticated + org not found → 404 from tenantMiddleware
 *  5. Authenticated + suspended tenant (non-admin path) → 403; terminal handler NOT reached
 *  6. Authenticated + suspended tenant on /platformAdmin path → bypass; terminal handler reached
 *  7. Admin chain — non-admin user on admin route → 403 from adminMiddleware
 *  8. Admin chain — super_admin role → 200; terminal handler receives adminRecord + adminRole
 */

import { Hono } from "hono";
import { describe, it, expect, mock, afterEach } from "bun:test";

// ─── Mock setup ──────────────────────────────────────────────────────────────
// All mocks must be declared before dynamic imports so bun:test hoists them.

const mockGetSession = mock(async () => null as unknown);
const mockOrgFindFirst = mock(async () => null as unknown);
const mockAdminFindFirst = mock(async () => null as unknown);

const mockTenantDb = { __isMockTenantDb: true };

const mockControlPanelDb = {
	query: {
		organizations: { findFirst: mockOrgFindFirst },
		platformAdmins: { findFirst: mockAdminFindFirst },
	},
};

mock.module("../lib/better-auth", () => ({
	getBetterAuth: (_c?: unknown) => ({
		api: { getSession: mockGetSession },
	}),
}));

mock.module("../lib/db", () => ({
	getControlPanelDb: (_c?: unknown) => mockControlPanelDb,
	getTenantDb: mock(async (_orgId: string, _c?: unknown) => mockTenantDb),
}));

// Dynamic imports AFTER mock.module calls
const { authMiddleware } = await import("./auth.middleware");
const { tenantMiddleware } = await import("./tenant.middleware");
const { adminMiddleware } = await import("./admin.middleware");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const VALID_SESSION = {
	user: { id: USER_ID, email: "u@example.com" },
	session: { id: "sess_1", token: "tok_abc", userId: USER_ID },
};

const ACTIVE_ORG = {
	id: ORG_ID,
	name: "Acme",
	paymentStatus: "active",
	connectionString: "postgresql://dummy",
};

const SUSPENDED_ORG = { ...ACTIVE_ORG, paymentStatus: "suspended" };

const SUPER_ADMIN_RECORD = {
	userId: USER_ID,
	role: "super_admin",
	createdAt: new Date(),
};

// ─── App builders ────────────────────────────────────────────────────────────

/**
 * Protected app: auth → tenant → probe handler.
 *
 * tenantMiddleware is registered on the specific route pattern so that
 * c.req.param("organizationId") is populated (Hono only resolves route params
 * when middleware is bound to a matching path pattern, not when bound to "*").
 *
 * Routes:
 *   GET /protected/:organizationId  — param-based org resolution
 *   GET /no-org                     — no param/header/session orgId → 400
 *   GET /platformAdmin/:organizationId — suspended-tenant bypass path
 */
function makeProtectedApp() {
	const app = new Hono();

	// Auth middleware runs globally (it doesn't need route params)
	app.use("*", authMiddleware);

	// Tenant middleware must be bound to the param-carrying pattern so the
	// middleware fires after Hono has extracted the route parameter.
	app.use("/protected/:organizationId", tenantMiddleware);
	app.get("/protected/:organizationId", (c) =>
		c.json({
			userId: (c.get("user") as { id: string } | undefined)?.id ?? null,
			organizationId: c.get("organizationId") ?? null,
			hasTenantDb: !!c.get("tenantDb"),
			hasOrganization: !!c.get("organization"),
		}),
	);

	// Route without an org param — tenantMiddleware still runs (via header lookup),
	// but there is no X-Organization-Id header and the session user has no orgId.
	app.use("/no-org", tenantMiddleware);
	app.get("/no-org", (c) => c.json({ reached: true }));

	// Platform-admin bypass: path includes "/platformAdmin" so tenantMiddleware
	// skips the suspended/cancelled guard even when paymentStatus is "suspended".
	app.use("/platformAdmin/:organizationId", tenantMiddleware);
	app.get("/platformAdmin/:organizationId", (c) =>
		c.json({
			userId: (c.get("user") as { id: string } | undefined)?.id ?? null,
			organizationId: c.get("organizationId") ?? null,
			hasTenantDb: !!c.get("tenantDb"),
		}),
	);

	return app;
}

/**
 * Admin sub-app: auth → admin → probe handler.
 * No tenantMiddleware — this chain is for platform admin routes only.
 */
function makeAdminApp() {
	const app = new Hono();
	app.use("*", authMiddleware);
	app.use("*", adminMiddleware);
	app.get("/admin/probe", (c) =>
		c.json({
			role: c.get("adminRole") ?? null,
			hasAdminRecord: !!c.get("adminRecord"),
		}),
	);
	return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Middleware pipeline integration", () => {
	afterEach(() => {
		mockGetSession.mockReset();
		mockOrgFindFirst.mockReset();
		mockAdminFindFirst.mockReset();
	});

	// ── 1. Unauthenticated request ─────────────────────────────────────────────
	it("1. unauthenticated request → 401 from authMiddleware; terminal handler NOT reached", async () => {
		mockGetSession.mockImplementationOnce(async () => null);

		const app = makeProtectedApp();
		const res = await app.request(`/protected/${ORG_ID}`);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toMatchObject({ error: "Unauthorized" });

		// tenantMiddleware was NOT reached — org findFirst never called
		expect(mockOrgFindFirst.mock.calls.length).toBe(0);
	});

	// ── 2. Authenticated + valid org ─────────────────────────────────────────
	it("2. authenticated + valid org → 200; terminal handler receives user, organizationId, tenantDb", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockOrgFindFirst.mockImplementationOnce(async () => ACTIVE_ORG);

		const app = makeProtectedApp();
		const res = await app.request(`/protected/${ORG_ID}`, {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.userId).toBe(USER_ID);
		expect(body.organizationId).toBe(ORG_ID);
		expect(body.hasTenantDb).toBe(true);
		expect(body.hasOrganization).toBe(true);
	});

	// ── 3. Authenticated + no org ID ─────────────────────────────────────────
	it("3. authenticated + no org ID → 400 from tenantMiddleware; tenantDb NOT set", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		// orgFindFirst should never be reached — no org ID to query with

		const app = makeProtectedApp();
		// /no-org has no :organizationId param, no X-Organization-Id header,
		// and VALID_SESSION.user has no organizationId property
		const res = await app.request("/no-org", {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toMatchObject({ error: "No active organization" });
		expect(mockOrgFindFirst.mock.calls.length).toBe(0);
	});

	// ── 4. Authenticated + org not found ────────────────────────────────────
	it("4. authenticated + org not found → 404 from tenantMiddleware", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockOrgFindFirst.mockImplementationOnce(async () => undefined);

		const app = makeProtectedApp();
		const res = await app.request(`/protected/${ORG_ID}`, {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ error: "Organization not found" });
	});

	// ── 5. Authenticated + suspended tenant (non-admin path) ─────────────────
	it("5. authenticated + suspended tenant on non-admin path → 403; terminal handler NOT reached", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockOrgFindFirst.mockImplementationOnce(async () => SUSPENDED_ORG);

		const app = makeProtectedApp();
		const res = await app.request(`/protected/${ORG_ID}`, {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body).toMatchObject({
			error: "Tenant is suspended",
			paymentStatus: "suspended",
		});
	});

	// ── 6. Authenticated + suspended tenant on /platformAdmin path ────────────
	it("6. authenticated + suspended tenant on /platformAdmin path → bypass; terminal handler reached", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockOrgFindFirst.mockImplementationOnce(async () => SUSPENDED_ORG);

		const app = makeProtectedApp();
		// Path contains "/platformAdmin" — triggers bypass in tenantMiddleware
		const res = await app.request(`/platformAdmin/${ORG_ID}`, {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.organizationId).toBe(ORG_ID);
		expect(body.hasTenantDb).toBe(true);
	});

	// ── 7. Admin chain — non-admin user ────────────────────────────────────────
	it("7. admin chain — non-admin user on admin route → 403 from adminMiddleware", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockAdminFindFirst.mockImplementationOnce(async () => undefined);

		const app = makeAdminApp();
		const res = await app.request("/admin/probe", {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body).toMatchObject({ error: "Forbidden: Admin access required" });
	});

	// ── 8. Admin chain — super_admin role ─────────────────────────────────────
	it("8. admin chain — super_admin → 200; terminal handler receives adminRecord + adminRole", async () => {
		mockGetSession.mockImplementationOnce(async () => VALID_SESSION);
		mockAdminFindFirst.mockImplementationOnce(async () => SUPER_ADMIN_RECORD);

		const app = makeAdminApp();
		const res = await app.request("/admin/probe", {
			headers: { Cookie: "better_auth_session=tok_abc" },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.role).toBe("super_admin");
		expect(body.hasAdminRecord).toBe(true);
	});
});
