import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const packageInstanceKeys = {
	all: (orgId: string) => ["packageInstances", orgId] as const,
	list: (orgId: string, status?: string) =>
		["packageInstances", orgId, status] as const,
	memberships: (orgId: string) => ["memberships", orgId] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CancelInstanceVars = {
	organizationId: string;
	id: string;
	reason: string;
};

export type FreezeInstanceVars = {
	organizationId: string;
	id: string;
	until?: string; // ISO date string; undefined = indefinite
	reason?: string;
};

export type UnfreezeInstanceVars = {
	organizationId: string;
	id: string;
};

export type ExtendInstanceVars = {
	organizationId: string;
	id: string;
	addDays: number;
	reason?: string;
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCancelPackageInstance(organizationId: string) {
	return useApiMutation<unknown, CancelInstanceVars>({
		mutationFn: (vars) => client.packageInstances.cancel(vars),
		successMessage: "Package cancelled successfully.",
		errorMessage: (err) => err.message || "Failed to cancel package.",
		invalidate: [
			packageInstanceKeys.all(organizationId),
			packageInstanceKeys.memberships(organizationId),
		],
	});
}

export function useFreezePackageInstance(organizationId: string) {
	return useApiMutation<unknown, FreezeInstanceVars>({
		mutationFn: (vars) =>
			client.packageInstances.freeze({
				...vars,
				until: vars.until ? (new Date(vars.until) as any) : undefined,
			} as any),
		successMessage: "Package frozen.",
		errorMessage: (err) => err.message || "Failed to freeze package.",
		invalidate: [
			packageInstanceKeys.all(organizationId),
			packageInstanceKeys.memberships(organizationId),
		],
	});
}

export function useUnfreezePackageInstance(organizationId: string) {
	return useApiMutation<unknown, UnfreezeInstanceVars>({
		mutationFn: (vars) => client.packageInstances.unfreeze(vars),
		successMessage: "Package unfrozen.",
		errorMessage: (err) => err.message || "Failed to unfreeze package.",
		invalidate: [
			packageInstanceKeys.all(organizationId),
			packageInstanceKeys.memberships(organizationId),
		],
	});
}

export function useExtendPackageInstance(organizationId: string) {
	return useApiMutation<unknown, ExtendInstanceVars>({
		mutationFn: (vars) => client.packageInstances.extend(vars as any),
		successMessage: "Package expiry extended.",
		errorMessage: (err) => err.message || "Failed to extend package.",
		invalidate: [
			packageInstanceKeys.all(organizationId),
			packageInstanceKeys.memberships(organizationId),
		],
	});
}
