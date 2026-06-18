/**
 * Hierarchy branch scope guards — Plan C C.1.
 *
 * Validates that an explicit branchId is within the caller's accessibleNodeIds
 * before querying or mutating branch-scoped data.
 */

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
 * Resolves the branch filter for analytics queries after scope validation.
 */
export function resolveBranchFilter(
	branchId: string | undefined,
	accessibleNodeIds: string[],
): string[] {
	assertBranchAccessible(branchId, accessibleNodeIds);
	return branchId ? [branchId] : accessibleNodeIds;
}

export function isBranchAccessDeniedError(error: unknown): boolean {
	return (
		error instanceof BranchAccessDeniedError ||
		(error instanceof Error &&
			error.message.startsWith("FORBIDDEN: branch") &&
			error.message.includes("not in accessible scope"))
	);
}
