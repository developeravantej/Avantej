/**
 * Unit tests for the tenant-isolation / RBAC guards in `./guards.ts`.
 *
 * These guards are the last line of defense against cross-tenant data access
 * (CLAUDE.md: "Multi-tenant isolation is critical: never let tenant A see
 * tenant B's data"). The cases below pin the exact spoofing-rejection behavior
 * so a refactor can't silently weaken it.
 *
 * No `mock.module` is used: every guard here is pure or takes an injectable
 * stub, so we avoid the process-global first-factory-wins hazard that breaks
 * the combined `bun test:unit` run.
 */

import { describe, expect, it } from "bun:test";
import { ORPCError } from "@orpc/server";
import { PermissionDeniedError } from "@avantej-core/services";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardBranchAccessible,
	guardInputBranchForContext,
	mapToOrpcForbidden,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
} from "./guards";
import { createMockContext } from "./test-utils/mock-context";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_IN_SCOPE = "node-branch-1";
const BRANCH_OUT_OF_SCOPE = "node-branch-evil";

/** Assert a sync call throws an ORPCError carrying the expected code. */
function expectOrpcError(fn: () => unknown, code: string) {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(ORPCError);
		expect((err as ORPCError<string, unknown>).code).toBe(code);
		return;
	}
	throw new Error(`expected ${code} ORPCError but nothing was thrown`);
}

/** Assert an async call rejects with an ORPCError carrying the expected code. */
async function expectOrpcErrorAsync(fn: () => Promise<unknown>, code: string) {
	try {
		await fn();
	} catch (err) {
		expect(err).toBeInstanceOf(ORPCError);
		expect((err as ORPCError<string, unknown>).code).toBe(code);
		return;
	}
	throw new Error(`expected ${code} ORPCError but nothing was thrown`);
}

// ---------------------------------------------------------------------------
// assertOrgContextMatch — the cross-tenant spoofing guard
// ---------------------------------------------------------------------------

describe("assertOrgContextMatch", () => {
	it("rejects an input organizationId that does not match the authenticated tenant", () => {
		const ctx = createMockContext({ organizationId: ORG_A });
		expectOrpcError(
			() => assertOrgContextMatch(ctx, { organizationId: ORG_B }),
			"FORBIDDEN",
		);
	});

	it("allows a matching organizationId", () => {
		const ctx = createMockContext({ organizationId: ORG_A });
		expect(() =>
			assertOrgContextMatch(ctx, { organizationId: ORG_A }),
		).not.toThrow();
	});

	it("does not fire when the context has no tenant org (public/global path)", () => {
		// A falsy context.organizationId means there is no tenant to spoof against;
		// the guard intentionally no-ops so public procedures stay callable.
		const ctx = createMockContext({ organizationId: null });
		expect(() =>
			assertOrgContextMatch(ctx, { organizationId: ORG_B }),
		).not.toThrow();
	});

	it("is exact-match — a near-miss id (trailing space) is still rejected", () => {
		const ctx = createMockContext({ organizationId: ORG_A });
		expectOrpcError(
			() => assertOrgContextMatch(ctx, { organizationId: `${ORG_A} ` }),
			"FORBIDDEN",
		);
	});
});

// ---------------------------------------------------------------------------
// assertTenantContext — presence of tenantDb + member
// ---------------------------------------------------------------------------

describe("assertTenantContext", () => {
	it("throws INTERNAL_SERVER_ERROR when tenantDb is missing", () => {
		const ctx = createMockContext({ tenantDb: undefined });
		expectOrpcError(() => assertTenantContext(ctx), "INTERNAL_SERVER_ERROR");
	});

	it("throws FORBIDDEN when the user is not a member of the org", () => {
		const ctx = createMockContext({ tenantDb: {} as never, member: null });
		expectOrpcError(() => assertTenantContext(ctx), "FORBIDDEN");
	});

	it("passes when both tenantDb and member are present", () => {
		const ctx = createMockContext({ tenantDb: {} as never });
		expect(() => assertTenantContext(ctx)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// guardBranchAccessible — RBAC node check
// ---------------------------------------------------------------------------

describe("guardBranchAccessible", () => {
	it("throws FORBIDDEN when the branch is outside the accessible scope", () => {
		expectOrpcError(
			() => guardBranchAccessible(BRANCH_OUT_OF_SCOPE, [BRANCH_IN_SCOPE]),
			"FORBIDDEN",
		);
	});

	it("passes when the branch is within the accessible scope", () => {
		expect(() =>
			guardBranchAccessible(BRANCH_IN_SCOPE, [BRANCH_IN_SCOPE, "node-2"]),
		).not.toThrow();
	});

	it("passes for undefined/null branchId (no branch filter requested)", () => {
		expect(() =>
			guardBranchAccessible(undefined, [BRANCH_IN_SCOPE]),
		).not.toThrow();
		expect(() => guardBranchAccessible(null, [BRANCH_IN_SCOPE])).not.toThrow();
	});

	it("skips enforcement when accessibleNodeIds is empty (admin/org-wide scope)", () => {
		// Documents the empty-list convention: an empty scope means "all nodes",
		// so any branch is permitted (mirrors assertBranchAccessible).
		expect(() => guardBranchAccessible(BRANCH_OUT_OF_SCOPE, [])).not.toThrow();
	});

	it("treats undefined accessibleNodeIds the same as an empty list", () => {
		expect(() =>
			guardBranchAccessible(BRANCH_OUT_OF_SCOPE, undefined),
		).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// guardInputBranchForContext — combined null-bypass + RBAC check
// ---------------------------------------------------------------------------

describe("guardInputBranchForContext", () => {
	const ctx = createMockContext({
		tenantDb: {} as never,
		accessibleNodeIds: [BRANCH_IN_SCOPE],
	}) as Parameters<typeof guardInputBranchForContext>[0];

	it("rejects an explicit null branchId (org-wide write bypass attempt)", async () => {
		// Hardened behavior: a caller sending `null` is trying to escape branch
		// scoping for an org-wide write. Always forbidden at the member level.
		await expectOrpcErrorAsync(
			() => guardInputBranchForContext(ctx, null),
			"FORBIDDEN",
		);
	});

	it("allows undefined branchId (no branch check needed)", async () => {
		await expect(
			guardInputBranchForContext(ctx, undefined),
		).resolves.toBeUndefined();
	});

	it("rejects a branchId outside the context's accessible scope", async () => {
		await expectOrpcErrorAsync(
			() => guardInputBranchForContext(ctx, BRANCH_OUT_OF_SCOPE),
			"FORBIDDEN",
		);
	});

	it("allows a branchId within the context's accessible scope", async () => {
		await expect(
			guardInputBranchForContext(ctx, BRANCH_IN_SCOPE),
		).resolves.toBeUndefined();
	});

	it("uses context.accessibleNodeIds without walking the DB when present", async () => {
		// tenantDb has no query methods; if the guard tried to walk descendants it
		// would throw a TypeError rather than a clean FORBIDDEN. Reaching FORBIDDEN
		// proves the cached-scope short-circuit was taken.
		await expectOrpcErrorAsync(
			() => guardInputBranchForContext(ctx, BRANCH_OUT_OF_SCOPE),
			"FORBIDDEN",
		);
	});
});

// ---------------------------------------------------------------------------
// resolveAccessibleNodeIds — cached-scope short-circuit
// ---------------------------------------------------------------------------

describe("resolveAccessibleNodeIds", () => {
	it("returns the context scope verbatim when already populated", async () => {
		const ctx = createMockContext({
			tenantDb: {} as never,
			accessibleNodeIds: [BRANCH_IN_SCOPE, "node-2"],
		}) as Parameters<typeof resolveAccessibleNodeIds>[0];
		await expect(resolveAccessibleNodeIds(ctx)).resolves.toEqual([
			BRANCH_IN_SCOPE,
			"node-2",
		]);
	});
});

// ---------------------------------------------------------------------------
// mapToOrpcForbidden — error normalization
// ---------------------------------------------------------------------------

describe("mapToOrpcForbidden", () => {
	it("maps a PermissionDeniedError to ORPCError FORBIDDEN", () => {
		expectOrpcError(
			() =>
				mapToOrpcForbidden(
					new PermissionDeniedError("reports", "read", "staff"),
				),
			"FORBIDDEN",
		);
	});

	it("maps a legacy 'Permission denied' message to ORPCError FORBIDDEN", () => {
		expectOrpcError(
			() =>
				mapToOrpcForbidden(
					new Error(
						"Permission denied: staff role does not have sales:read permission",
					),
				),
			"FORBIDDEN",
		);
	});

	it("rethrows unrelated errors unchanged", () => {
		const original = new Error("db down");
		expect(() => mapToOrpcForbidden(original)).toThrow("db down");
	});
});

// ---------------------------------------------------------------------------
// requirePermissionOrpc — wrapper over the services-layer requirePermission
// ---------------------------------------------------------------------------

/**
 * Stub tenantDb whose role lookups all miss, forcing `hasPermission` into its
 * documented fallback: grant only when `member.role === "admin"`. This lets us
 * exercise the real `requirePermission` → `mapToOrpcForbidden` path with no
 * module mocking.
 */
function buildPermissionStubDb() {
	const miss = () => Promise.resolve(undefined);
	return {
		query: {
			roles: { findFirst: miss },
			permissions: { findFirst: miss },
			rolePermissions: { findFirst: miss },
		},
	} as never;
}

describe("requirePermissionOrpc", () => {
	it("resolves for an admin member (fallback grants all)", async () => {
		const db = buildPermissionStubDb();
		const adminMember = { role: "admin", roleId: null } as never;
		await expect(
			requirePermissionOrpc(db, adminMember, "reports", "read"),
		).resolves.toBeUndefined();
	});

	it("throws ORPCError FORBIDDEN for a non-admin member without the permission", async () => {
		const db = buildPermissionStubDb();
		const staffMember = { role: "staff", roleId: null } as never;
		await expectOrpcErrorAsync(
			() => requirePermissionOrpc(db, staffMember, "reports", "read"),
			"FORBIDDEN",
		);
	});
});

// ---------------------------------------------------------------------------
// Edge cases — falsy inputs, fail-closed behavior, the null/"" asymmetry
// ---------------------------------------------------------------------------

describe("guard edge cases", () => {
	it("assertOrgContextMatch fails closed when input omits the org (empty string)", () => {
		// An empty-string organizationId never equals a real tenant id, so the
		// guard rejects it. Fail-closed is correct: a tenant-scoped call must
		// carry the matching org.
		const ctx = createMockContext({ organizationId: ORG_A });
		expectOrpcError(
			() => assertOrgContextMatch(ctx, { organizationId: "" }),
			"FORBIDDEN",
		);
	});

	it("guardBranchAccessible treats an empty-string branchId as 'no branch' (skips)", () => {
		// Mirrors assertBranchAccessible: falsy branchId means no branch filter.
		expect(() => guardBranchAccessible("", [BRANCH_IN_SCOPE])).not.toThrow();
	});

	it("guardInputBranchForContext rejects BOTH explicit null and empty-string branchId", async () => {
		// Both are provided-but-invalid org-wide-write bypass attempts. `undefined`
		// remains the only falsy value that legitimately skips the branch check.
		const ctx = createMockContext({
			tenantDb: {} as never,
			accessibleNodeIds: [BRANCH_IN_SCOPE],
		}) as Parameters<typeof guardInputBranchForContext>[0];

		await expectOrpcErrorAsync(
			() => guardInputBranchForContext(ctx, null),
			"FORBIDDEN",
		);
		await expectOrpcErrorAsync(
			() => guardInputBranchForContext(ctx, ""),
			"FORBIDDEN",
		);
		await expect(
			guardInputBranchForContext(ctx, undefined),
		).resolves.toBeUndefined();
	});

	it("requirePermissionOrpc rethrows non-permission errors (e.g. DB failure) unchanged", async () => {
		// A tenantDb whose query layer throws should surface the raw error, not be
		// masked as a FORBIDDEN — a 500 must not look like an authz denial.
		const boom = new Error("connection reset");
		const explodingDb = {
			query: {
				roles: {
					findFirst: () => Promise.reject(boom),
				},
			},
		} as never;
		const member = { role: "staff", roleId: "role-1" } as never;
		await expect(
			requirePermissionOrpc(explodingDb, member, "reports", "read"),
		).rejects.toThrow("connection reset");
	});
});
