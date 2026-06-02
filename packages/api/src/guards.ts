import { ORPCError } from "@orpc/server";
import type { members } from "@avantej-core/db/schema/tenant/members";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	assertBranchAccessible,
	getDescendantNodeIds,
	isBranchAccessDeniedError,
	PermissionDeniedError,
	requirePermission,
	type Action,
	type Resource,
} from "@avantej-core/services";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { Context } from "./context";

type Member = typeof members.$inferSelect;
type TenantDb = NeonDatabase<typeof tenantSchema>;

/** Reject cross-tenant organizationId spoofing (Plan C C.2). */
export function assertOrgContextMatch(
	context: Context,
	input: { organizationId: string },
): void {
	if (
		context.organizationId &&
		input.organizationId !== context.organizationId
	) {
		throw new ORPCError("FORBIDDEN", {
			message: "organizationId does not match authenticated tenant context",
		});
	}
}

/** Require tenantDb + member on context (Plan C C.4 helper). */
export function assertTenantContext(
	context: Context,
): asserts context is Context & {
	tenantDb: TenantDb;
	member: Member;
} {
	if (!context.tenantDb) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"Tenant database not available. Ensure organization context is set.",
		});
	}
	if (!context.member) {
		throw new ORPCError("FORBIDDEN", {
			message: "User is not a member of this organization",
		});
	}
}

/** Map service-layer branch guard failures to oRPC FORBIDDEN. */
export function guardBranchAccessible(
	branchId: string | undefined | null,
	accessibleNodeIds: string[] | undefined,
): void {
	try {
		assertBranchAccessible(branchId, accessibleNodeIds ?? []);
	} catch (error) {
		if (isBranchAccessDeniedError(error)) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Branch not accessible",
			});
		}
		throw error;
	}
}

/** Resolve hierarchy scope for the current member (context or descendant walk). */
export async function resolveAccessibleNodeIds(
	context: Context & { tenantDb: TenantDb; member: Member },
): Promise<string[]> {
	if (context.accessibleNodeIds?.length) {
		return context.accessibleNodeIds;
	}
	return getDescendantNodeIds(
		context.tenantDb,
		context.member.hierarchyScopeId,
	);
}

/** Guard input.branchId using resolved accessibleNodeIds (Plan C.1.3). */
export async function guardInputBranchForContext(
	context: Context & { tenantDb: TenantDb; member: Member },
	branchId: string | undefined | null,
): Promise<void> {
	// An explicit null or empty-string branchId is a provided-but-invalid value —
	// an attempt to bypass branch scoping for org-wide writes. Always forbidden at
	// the tenant member level. (Today every caller validates branchId with
	// z.string().uuid(), so "" is rejected upstream; this guards against a future
	// caller using a plain z.string() that would silently reopen the bypass.)
	if (branchId === null || branchId === "") {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Explicit null/empty branchId is not permitted. Provide a valid branch.",
		});
	}
	if (!branchId) return; // undefined — no branch check needed
	const accessibleNodeIds = await resolveAccessibleNodeIds(context);
	guardBranchAccessible(branchId, accessibleNodeIds);
}

/** Map PermissionDeniedError (and legacy messages) to ORPCError FORBIDDEN (Plan C C.3). */
export function mapToOrpcForbidden(error: unknown): never {
	if (error instanceof PermissionDeniedError) {
		throw new ORPCError("FORBIDDEN", { message: error.message });
	}
	if (error instanceof Error && error.message.startsWith("Permission denied")) {
		throw new ORPCError("FORBIDDEN", { message: error.message });
	}
	throw error;
}

/** Typed wrapper — prefer over try/catch + ORPCError in routers. */
export async function requirePermissionOrpc(
	tenantDb: TenantDb,
	member: Member,
	resource: Resource,
	action: Action,
): Promise<void> {
	try {
		await requirePermission(tenantDb, member, resource, action);
	} catch (error) {
		mapToOrpcForbidden(error);
	}
}
