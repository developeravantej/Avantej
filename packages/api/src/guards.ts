import { ORPCError } from "@orpc/server";
import {
	assertBranchAccessible,
	isBranchAccessDeniedError,
} from "@avantej-core/services";
import type { Context } from "./context";

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
