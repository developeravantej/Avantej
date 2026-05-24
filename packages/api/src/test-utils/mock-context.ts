/**
 * Test harness for oRPC procedures in `packages/api/src/routers/`.
 *
 * Builds a fake `Context` (matching `packages/api/src/context.ts`) so that
 * procedures can be invoked via `@orpc/server`'s `call()` helper without
 * spinning up Hono, Better-Auth, or real Drizzle clients.
 *
 * Usage:
 * ```ts
 * import { call } from "@orpc/server";
 * import { memberRouter } from "../routers/members";
 * import { createMockContext } from "../test-utils/mock-context";
 *
 * const ctx = createMockContext({
 *   tenantDb: { ... } as any,
 *   honoBindings: { dispatchStaffSync: someMock },
 * });
 * const result = await call(memberRouter.retryGhlSync, input, { context: ctx });
 * ```
 *
 * All sub-objects are typed as `any` because real Drizzle clients carry deep
 * generics that aren't useful in unit tests — tests should stub only the
 * methods their procedure-under-test actually touches.
 */

import type { Context } from "../context";

// biome-ignore lint/suspicious/noExplicitAny: shared test stubs are intentionally loose
type Any = any;

export type MockContextOverrides = {
	session?: Any;
	organizationId?: string | null;
	tenantDb?: Any;
	member?: Any;
	organization?: Any;
	accessibleNodeIds?: string[];
	/**
	 * Bindings exposed via `context.honoContext.get(key)`. Procedures retrieve
	 * `controlPanelDb`, `dispatchStaffSync`, etc. from here. Provide whichever
	 * keys the procedure-under-test reads.
	 */
	honoBindings?: Record<string, unknown>;
};

const defaultSession = {
	user: {
		id: "user-test-1",
		email: "test@example.com",
		name: "Test User",
	},
	session: { id: "sess-test-1" },
};

const defaultMember = {
	id: "member-test-1",
	userId: "user-test-1",
	role: "admin" as const,
	status: "active" as const,
	hierarchyScopeId: "node-root",
};

/**
 * Construct a `Context` object suitable for calling oRPC procedures in tests.
 * All fields default to sane stubs; pass `overrides` for the specific shape
 * your procedure needs.
 */
export function createMockContext(overrides: MockContextOverrides = {}): Context {
	const honoBindings: Record<string, unknown> = {
		...(overrides.honoBindings ?? {}),
	};

	const honoContext = {
		get: (key: string) => honoBindings[key],
		set: (key: string, value: unknown) => {
			honoBindings[key] = value;
		},
		req: { raw: { headers: new Headers() } },
	} as Any;

	return {
		session: overrides.session === undefined ? defaultSession : overrides.session,
		organizationId:
			overrides.organizationId === undefined
				? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
				: overrides.organizationId,
		tenantDb: overrides.tenantDb,
		member: overrides.member === undefined ? defaultMember : overrides.member,
		organization: overrides.organization,
		accessibleNodeIds: overrides.accessibleNodeIds ?? ["node-root"],
		honoContext,
	} as Context;
}
