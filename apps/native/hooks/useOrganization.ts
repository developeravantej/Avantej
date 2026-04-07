import { useOrganizationContext } from "@/contexts/organization-context";

/**
 * Hook that returns a guaranteed organizationId for API calls.
 * Throws if no organization is selected (should only be used in screens
 * that are behind the organization selection gate).
 */
export function useOrganization() {
	const { organizationId, organizations, isLoading, setOrganizationId } =
		useOrganizationContext();

	if (!organizationId && !isLoading) {
		throw new Error(
			"No organization selected. Ensure the user has selected an organization.",
		);
	}

	return {
		organizationId: organizationId as string,
		organizations,
		isLoading,
		setOrganizationId,
	};
}
