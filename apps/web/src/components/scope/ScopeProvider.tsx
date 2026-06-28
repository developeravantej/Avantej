// apps/web/src/components/scope/ScopeProvider.tsx
import * as React from "react";
import {
	useUserContext,
	type UserContextResponse,
} from "@/hooks/useUserContext";

/** Element of org.hierarchy.nodes — the flat hierarchy tree (parentId/depth shape). */
export type ScopeNode =
	UserContextResponse["organizations"][number]["hierarchy"]["nodes"][number];

export interface ScopeContextValue {
	activeScopeId: string | null;
	activeScopeNode: ScopeNode | null;
	setActiveScope: (nodeId: string) => void;
	resetScope: () => void;
	accessibleNodeIds: string[];
	scopeNodes: ScopeNode[];
	topAccessibleNodeId: string | null;
	isAllScope: boolean;
	scopeNodeId: string | undefined;
	isScopeReady: boolean;
}

const ScopeContext = React.createContext<ScopeContextValue | null>(null);

function scopeStorageKey(userId: string, organizationId: string): string {
	return `scope:${userId}:${organizationId}`;
}

function readStoredScope(
	userId: string,
	organizationId: string,
): string | null {
	try {
		return localStorage.getItem(scopeStorageKey(userId, organizationId));
	} catch {
		return null;
	}
}

function writeStoredScope(
	userId: string,
	organizationId: string,
	nodeId: string,
): void {
	try {
		localStorage.setItem(scopeStorageKey(userId, organizationId), nodeId);
	} catch {
		// ignore quota / private-mode failures
	}
}

export function useScope(): ScopeContextValue {
	const context = React.use(ScopeContext);
	if (!context) {
		throw new Error("useScope must be used within a ScopeProvider.");
	}
	return context;
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
	const { data: userContext } = useUserContext();

	const userId = userContext?.user.id ?? null;
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Resolve current org the same way useUserContext helpers do:
	// prefer currentOrganizationId, else organizations[0].
	const org = React.useMemo(() => {
		if (!userContext) return null;
		const id = userContext.currentOrganizationId;
		return (
			(id
				? userContext.organizations.find((o) => o.id === id)
				: userContext.organizations[0]) ?? null
		);
	}, [userContext]);

	const member = org?.hierarchy.member ?? null;

	const accessibleNodeIds = React.useMemo<string[]>(
		() => member?.accessibleNodeIds ?? [],
		[member],
	);

	// "All" = the caller's top accessible node = member.hierarchyScopeId.
	const topAccessibleNodeId = member?.hierarchyScopeId ?? null;

	// Switcher options: org nodes within accessibleNodeIds, depth-ordered.
	const scopeNodes = React.useMemo<ScopeNode[]>(() => {
		if (!org) return [];
		const allowed = new Set(accessibleNodeIds);
		return org.hierarchy.nodes
			.filter((n) => allowed.has(n.id))
			.sort((a, b) => a.depth - b.depth);
	}, [org, accessibleNodeIds]);

	const [activeScopeId, setActiveScopeId] = React.useState<string | null>(null);

	// Default + validation + org-reset: re-key on (user, org, RBAC). A persisted
	// scope wins only if still accessible; otherwise fall back to the top node.
	React.useEffect(() => {
		if (!userId || !organizationId || !topAccessibleNodeId) {
			setActiveScopeId(null);
			return;
		}
		const stored = readStoredScope(userId, organizationId);
		const valid = stored != null && accessibleNodeIds.includes(stored);
		setActiveScopeId(valid ? stored : topAccessibleNodeId);
	}, [userId, organizationId, topAccessibleNodeId, accessibleNodeIds]);

	const setActiveScope = React.useCallback(
		(nodeId: string) => {
			if (!userId || !organizationId) return;
			// Security: the switcher can only NARROW within accessibleNodeIds.
			if (!accessibleNodeIds.includes(nodeId)) {
				if (import.meta.env.DEV) {
					console.warn(
						`[ScopeProvider] Ignoring setActiveScope("${nodeId}") — not within accessibleNodeIds.`,
					);
				}
				return;
			}
			writeStoredScope(userId, organizationId, nodeId);
			setActiveScopeId(nodeId);
		},
		[userId, organizationId, accessibleNodeIds],
	);

	const resetScope = React.useCallback(() => {
		if (!userId || !organizationId || !topAccessibleNodeId) return;
		writeStoredScope(userId, organizationId, topAccessibleNodeId);
		setActiveScopeId(topAccessibleNodeId);
	}, [userId, organizationId, topAccessibleNodeId]);

	const activeScopeNode = React.useMemo<ScopeNode | null>(() => {
		if (!org || !activeScopeId) return null;
		return org.hierarchy.nodes.find((n) => n.id === activeScopeId) ?? null;
	}, [org, activeScopeId]);

	const isAllScope =
		activeScopeId != null && activeScopeId === topAccessibleNodeId;

	// Inject as `branchId`: undefined for "All" (server uses full accessibleNodeIds),
	// else the selected node id (narrows within RBAC).
	const scopeNodeId = isAllScope ? undefined : (activeScopeId ?? undefined);

	const isScopeReady = activeScopeId != null;

	const value = React.useMemo<ScopeContextValue>(
		() => ({
			activeScopeId,
			activeScopeNode,
			setActiveScope,
			resetScope,
			accessibleNodeIds,
			scopeNodes,
			topAccessibleNodeId,
			isAllScope,
			scopeNodeId,
			isScopeReady,
		}),
		[
			activeScopeId,
			activeScopeNode,
			setActiveScope,
			resetScope,
			accessibleNodeIds,
			scopeNodes,
			topAccessibleNodeId,
			isAllScope,
			scopeNodeId,
			isScopeReady,
		],
	);

	return (
		<ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
	);
}
