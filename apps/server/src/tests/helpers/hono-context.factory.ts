/**
 * Hono Context Factory — test infrastructure only.
 *
 * Provides a lightweight Hono Context stub for unit-testing middleware
 * without spinning up a full HTTP server. The factory is intentionally
 * minimal: it exposes only the surface area that the auth/tenant/admin
 * middleware actually touch.
 */

import type { createMiddleware } from "hono/factory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MakeHonoContextOpts = {
	headers?: Record<string, string>;
	params?: Record<string, string>;
	path?: string;
	/** Pre-populate c.get("user") */
	user?: { id: string; [key: string]: unknown } | null;
	/** Pre-populate c.get("session") */
	session?: unknown;
	/** Pre-populate c.get("organization") */
	organization?: unknown;
	/** Pre-populate c.get("organizationId") */
	organizationId?: string;
	/** Pre-populate c.get("tenantDb") */
	tenantDb?: unknown;
	/** Pre-populate c.get("adminRecord") */
	adminRecord?: unknown;
	/** Pre-populate c.get("adminRole") */
	adminRole?: string;
	/** Pre-populate c.get("controlPanelDb") — used by getControlPanelDb(c) shortcut */
	controlPanelDb?: unknown;
};

export type HonoContextStub = ReturnType<typeof makeHonoContext>;

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal Hono Context stub.
 *
 * - `c.get` / `c.set` are backed by a Map.
 * - `c.req.param(name)` returns from `opts.params`.
 * - `c.req.header(name)` returns from `opts.headers` (case-insensitive).
 * - `c.req.path` returns `opts.path ?? "/"`.
 * - `c.req.raw.headers` is a real `Headers` object.
 * - `c.json(body, status?)` returns `{ __response: true, body, status }`.
 */
export function makeHonoContext(opts: MakeHonoContextOpts = {}) {
	const store = new Map<string, unknown>();

	// Seed pre-populated values
	if (opts.user !== undefined) store.set("user", opts.user);
	if (opts.session !== undefined) store.set("session", opts.session);
	if (opts.organization !== undefined)
		store.set("organization", opts.organization);
	if (opts.organizationId !== undefined)
		store.set("organizationId", opts.organizationId);
	if (opts.tenantDb !== undefined) store.set("tenantDb", opts.tenantDb);
	if (opts.adminRecord !== undefined)
		store.set("adminRecord", opts.adminRecord);
	if (opts.adminRole !== undefined) store.set("adminRole", opts.adminRole);
	if (opts.controlPanelDb !== undefined)
		store.set("controlPanelDb", opts.controlPanelDb);

	// Build case-insensitive header lookup
	const normalizedHeaders: Record<string, string> = {};
	for (const [k, v] of Object.entries(opts.headers ?? {})) {
		normalizedHeaders[k.toLowerCase()] = v;
	}

	// Real Headers object for c.req.raw.headers
	const rawHeaders = new Headers(opts.headers ?? {});

	const c = {
		get(key: string) {
			return store.get(key);
		},
		set(key: string, value: unknown) {
			store.set(key, value);
		},
		json(body: unknown, status?: number) {
			return { __response: true, body, status: status ?? 200 };
		},
		req: {
			param(name: string): string | undefined {
				return (opts.params ?? {})[name];
			},
			header(name: string): string | undefined {
				return normalizedHeaders[name.toLowerCase()];
			},
			path: opts.path ?? "/",
			raw: {
				headers: rawHeaders,
			},
		},
	};

	return c;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Execute a Hono middleware fn against the stub context.
 *
 * Returns `{ response, nextCalled }` so tests can assert on both the early-exit
 * response and whether the middleware called through to `next()`.
 *
 * The `as any` cast is intentional — this is test infrastructure and the
 * middleware function signature is only partially typed at the point where
 * `createMiddleware` returns it. This mirrors the pattern used in
 * `rate-limit.middleware.test.ts`.
 */
export async function runMiddleware(
	middleware: ReturnType<typeof createMiddleware>,
	c: ReturnType<typeof makeHonoContext>,
): Promise<{ response: unknown; nextCalled: boolean }> {
	let nextCalled = false;
	const next = async () => {
		nextCalled = true;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response = await (middleware as any)(c, next);
	return { response, nextCalled };
}
