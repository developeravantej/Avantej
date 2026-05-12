import { client } from "@/utils/orpc";
import * as SecureStore from "expo-secure-store";
import {
	createContext,
	useCallback,
	use,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

const STORAGE_KEY = "avantej_selected_organization_id";

interface Organization {
	id: string;
	name: string;
	slug: string;
	role: string;
	hierarchy: {
		nodes: Array<{
			id: string;
			name: string;
			type: string;
			depth: number;
			parentId: string | null;
			createdAt: Date | null;
			updatedAt: Date | null;
		}>;
		member: {
			role: string;
			hierarchyScopeId: string;
			hierarchyScopeName: string;
			accessibleNodeIds: string[];
		} | null;
	};
}

interface OrganizationContextValue {
	organizationId: string | null;
	setOrganizationId: (id: string) => void;
	organizations: Organization[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({
	children,
	isAuthenticated,
}: {
	children: ReactNode;
	isAuthenticated: boolean;
}) {
	const [organizationId, setOrganizationIdState] = useState<string | null>(null);
	const [organizations, setOrganizations] = useState<Organization[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const setOrganizationId = useCallback((id: string) => {
		setOrganizationIdState(id);
		SecureStore.setItemAsync(STORAGE_KEY, id).catch(console.error);
	}, []);

	const fetchUserContext = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const userContext = await client.auth.userContext();
			const orgs = userContext.organizations ?? [];
			setOrganizations(orgs);

			// Try to restore previously selected org
			const storedId = await SecureStore.getItemAsync(STORAGE_KEY);
			const storedOrgStillValid = storedId && orgs.some((o) => o.id === storedId);

			if (storedOrgStillValid) {
				setOrganizationIdState(storedId);
			} else if (orgs.length === 1) {
				// Auto-select if only one org
				setOrganizationId(orgs[0].id);
			} else if (userContext.currentOrganizationId) {
				setOrganizationId(userContext.currentOrganizationId);
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Failed to fetch user context"));
		} finally {
			setIsLoading(false);
		}
	}, [setOrganizationId]);

	// react-doctor-disable-next-line react-doctor/no-cascading-set-state -- async restore flow with multiple branches (stored vs single-org vs current-org) interleaved with abort checks; each setter targets independent context state and cannot be consolidated without obscuring the abort/branch logic
	useEffect(() => {
		let aborted = false;
		if (isAuthenticated) {
			(async () => {
				try {
					setIsLoading(true);
					setError(null);
					const userContext = await client.auth.userContext();
					if (aborted) return;
					const orgs = userContext.organizations ?? [];
					setOrganizations(orgs);
					const storedId = await SecureStore.getItemAsync(STORAGE_KEY);
					if (aborted) return;
					const storedOrgStillValid =
						storedId && orgs.some((o) => o.id === storedId);
					if (storedOrgStillValid) {
						setOrganizationIdState(storedId);
					} else if (orgs.length === 1) {
						setOrganizationId(orgs[0].id);
					} else if (userContext.currentOrganizationId) {
						setOrganizationId(userContext.currentOrganizationId);
					}
				} catch (err) {
					if (aborted) return;
					setError(
						err instanceof Error
							? err
							: new Error("Failed to fetch user context"),
					);
				} finally {
					if (!aborted) setIsLoading(false);
				}
			})();
		} else {
			setOrganizations([]);
			setOrganizationIdState(null);
			setIsLoading(false);
		}
		return () => {
			aborted = true;
		};
	}, [isAuthenticated, setOrganizationId]);

	const value = useMemo(
		() => ({
			organizationId,
			setOrganizationId,
			organizations,
			isLoading,
			error,
			refetch: fetchUserContext,
		}),
		[organizationId, setOrganizationId, organizations, isLoading, error, fetchUserContext],
	);

	return (
		<OrganizationContext.Provider value={value}>
			{children}
		</OrganizationContext.Provider>
	);
}

export function useOrganizationContext() {
	const context = use(OrganizationContext);
	if (!context) {
		throw new Error("useOrganizationContext must be used within an OrganizationProvider");
	}
	return context;
}
