import { useInfiniteQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const myServicesKeys = {
	all: (orgId: string) => ["myServices", orgId] as const,
	assignedPackages: (orgId: string, status?: string) =>
		["myServices", orgId, "assignedPackages", status] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssignedPackage = {
	id: string;
	serviceName: string;
	clientDisplayName: string;
	creditsRemaining: number;
	nextDueDate: string | null;
	status: "active" | "frozen";
	frozenUntil?: string | null;
	createdAt: string;
};

export type AssignedPackagesPage = {
	items: AssignedPackage[];
	nextCursor: string | null;
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Infinite query for packages assigned to the currently logged-in trainer.
 */
export function useAssignedPackages(
	organizationId: string | null,
	statusFilter?: "active" | "frozen",
) {
	return useInfiniteQuery<AssignedPackagesPage>({
		queryKey: myServicesKeys.assignedPackages(
			organizationId ?? "",
			statusFilter,
		),
		queryFn: async ({ pageParam }) => {
			const result = await client.packageInstances.listAssignedToMe({
				organizationId: organizationId ?? "",
				cursor: (pageParam as string | undefined) ?? undefined,
				limit: 25,
				status: statusFilter,
			});
			return result as unknown as AssignedPackagesPage;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled: !!organizationId,
		staleTime: 30_000,
	});
}
