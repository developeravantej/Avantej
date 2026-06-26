/**
 * Hierarchy branch scope guards — Plan C C.1.
 *
 * Validates that an explicit branchId is within the caller's accessibleNodeIds
 * before querying or mutating branch-scoped data.
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getDescendantNodeIds } from "./hierarchy.service";

export class BranchAccessDeniedError extends Error {
	constructor(branchId: string) {
		super(`FORBIDDEN: branch ${branchId} is not in accessible scope`);
		this.name = "BranchAccessDeniedError";
	}
}

/**
 * Throws when `branchId` is set and not included in `accessibleNodeIds`.
 * When `accessibleNodeIds` is empty, skips enforcement (matches sales-order.service).
 */
export function assertBranchAccessible(
	branchId: string | undefined | null,
	accessibleNodeIds: string[],
): void {
	if (!branchId) return;
	if (accessibleNodeIds.length > 0 && !accessibleNodeIds.includes(branchId)) {
		throw new BranchAccessDeniedError(branchId);
	}
}

/**
 * Resolves the set of hierarchy node IDs a (possibly non-leaf) scope node
 * expands to, for use as a branch-id filter on business rows.
 *
 * Business rows (sales_orders, appointments, …) are tagged with a LEAF branch
 * id. A country/region/state node has no rows tagged directly to it, so we
 * expand the picked node to its accessible SUBTREE (itself + all descendants)
 * via the recursive CTE in `getDescendantNodeIds`.
 *
 * Semantics:
 * - No scope picked → "All" = the caller's full accessible set. May be `[]`
 *   for an admin (org-wide / no filter). No DB hit.
 * - Scope picked, admin (empty ceiling) → the full subtree, unrestricted.
 * - Scope picked, non-admin → subtree ∩ accessible ceiling (narrow-only).
 *   The guard guarantees the picked node is within the ceiling, so the result
 *   is non-empty.
 */
export async function resolveScopeNodeIds(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	scopeNodeId: string | undefined | null,
	accessibleNodeIds: string[],
): Promise<string[]> {
	// 1. Guard: reuse assertBranchAccessible (skips when accessibleNodeIds empty = admin/org-wide)
	assertBranchAccessible(scopeNodeId, accessibleNodeIds);
	// 2. No scope picked → "All" = the caller's full accessible set (may be [] for admin = org-wide/no filter)
	if (!scopeNodeId) return accessibleNodeIds;
	// 3. Expand the picked node to its subtree
	const subtree = await getDescendantNodeIds(tenantDb, scopeNodeId);
	// 4. Admin/org-wide (no ceiling) → return the full subtree, unrestricted
	if (accessibleNodeIds.length === 0) return subtree;
	// 5. Non-admin → subtree ∩ accessible ceiling (narrow-only). Guaranteed non-empty (guard ensured scopeNodeId ∈ accessibleNodeIds).
	const allowed = new Set(accessibleNodeIds);
	return subtree.filter((id) => allowed.has(id));
}

export function isBranchAccessDeniedError(error: unknown): boolean {
	return (
		error instanceof BranchAccessDeniedError ||
		(error instanceof Error &&
			error.message.startsWith("FORBIDDEN: branch") &&
			error.message.includes("not in accessible scope"))
	);
}
