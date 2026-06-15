import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, queryClient } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const branchInviteKeys = {
	all: (orgId: string) => ["branchInvites", orgId] as const,
	byBranch: (orgId: string, branchId: string) =>
		["branchInvites", orgId, branchId] as const,
	allIndex: (orgId: string) => ["branchInvites", orgId, "all"] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useBranchInvites(organizationId: string, branchId: string) {
	return useQuery({
		queryKey: branchInviteKeys.byBranch(organizationId, branchId),
		queryFn: () => client.branchInvites.list({ organizationId, branchId }),
		enabled: !!organizationId && !!branchId,
	});
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateBranchInvite(
	organizationId: string,
	branchId: string,
) {
	return useApiMutation({
		mutationFn: (vars: { maxUses?: number }) =>
			client.branchInvites.create({
				organizationId,
				branchId,
				maxUses: vars.maxUses,
			}),
		successMessage: "QR code generated.",
		invalidate: [branchInviteKeys.byBranch(organizationId, branchId)],
	});
}

export function useRevokeBranchInvite(
	organizationId: string,
	branchId: string,
) {
	return useApiMutation({
		mutationFn: (id: string) =>
			client.branchInvites.revoke({ organizationId, id }),
		successMessage: "Invite revoked.",
		invalidate: [branchInviteKeys.byBranch(organizationId, branchId)],
	});
}

export function useRegenerateBranchInvite(
	organizationId: string,
	branchId: string,
) {
	return useApiMutation({
		mutationFn: (id: string) =>
			client.branchInvites.regenerate({ organizationId, id }),
		successMessage: "New QR code generated.",
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: branchInviteKeys.byBranch(organizationId, branchId),
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Index-page hooks (one row per branch — used by /dashboard/onboarding/view)
// ---------------------------------------------------------------------------

export function useAllBranchInvites(organizationId: string | null | undefined) {
	return useQuery({
		queryKey: branchInviteKeys.allIndex(organizationId ?? ""),
		queryFn: () =>
			client.branchInvites.listAll({ organizationId: organizationId ?? "" }),
		enabled: !!organizationId,
	});
}

export function useCreateBranchInviteFromIndex(organizationId: string) {
	return useApiMutation({
		mutationFn: (vars: { branchId: string; maxUses?: number }) =>
			client.branchInvites.create({
				organizationId,
				branchId: vars.branchId,
				maxUses: vars.maxUses,
			}),
		successMessage: "QR code generated.",
		invalidate: [branchInviteKeys.allIndex(organizationId)],
	});
}

export function useRevokeBranchInviteFromIndex(organizationId: string) {
	return useApiMutation({
		mutationFn: (id: string) =>
			client.branchInvites.revoke({ organizationId, id }),
		successMessage: "Invite revoked.",
		invalidate: [branchInviteKeys.allIndex(organizationId)],
	});
}

export function useRegenerateBranchInviteFromIndex(organizationId: string) {
	return useApiMutation({
		mutationFn: (id: string) =>
			client.branchInvites.regenerate({ organizationId, id }),
		successMessage: "New QR code generated.",
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: branchInviteKeys.allIndex(organizationId),
			});
		},
	});
}
