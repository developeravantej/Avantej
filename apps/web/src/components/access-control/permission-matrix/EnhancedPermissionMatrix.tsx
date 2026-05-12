import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	cycleScope,
	getPermissionScope,
	hasPermission,
	usePermissionMatrixState,
	type PermissionScope,
} from "@/hooks/usePermissionMatrixState";
import type { PermissionResource, Role } from "./PermissionMatrix";
import { BulkApplyBar } from "./matrix/BulkApplyBar";
import { CompactView } from "./matrix/CompactView";
import { MatrixControls } from "./matrix/MatrixControls";
import { MatrixLegend } from "./matrix/MatrixLegend";
import { MobileRoleCards } from "./matrix/MobileRoleCards";
import { ResourceRow } from "./matrix/ResourceRow";
import { RolePagination } from "./matrix/RolePagination";
import { RolePicker } from "./matrix/RolePicker";
import { ROLE_GROUPS } from "./matrix/scope-style";

const EMPTY_SELECTED_ROLES: string[] = [];

interface EnhancedPermissionMatrixProps {
	roles: Role[];
	resources: PermissionResource[];
	onPermissionChange?: (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope?: PermissionScope | null,
	) => void;
	onRoleSelect?: (roleId: string) => void;
	selectedRoles?: string[];
	maxVisibleRoles?: number;
	hideControls?: boolean;
}

export function EnhancedPermissionMatrix({
	roles,
	resources,
	onPermissionChange,
	onRoleSelect: _onRoleSelect,
	selectedRoles: _selectedRoles = EMPTY_SELECTED_ROLES,
	maxVisibleRoles = 6,
	hideControls = false,
}: EnhancedPermissionMatrixProps) {
	const isMobile = useIsMobile();
	const { state, dispatch } = usePermissionMatrixState({
		initialViewMode: isMobile ? "roles" : "matrix",
	});
	const {
		viewMode,
		roleFilter,
		searchQuery,
		expandedResources,
		visibleRoleStart,
		selectedBatchRoles,
	} = state;

	const filteredRoles = useMemo(() => {
		let filtered = roles;
		if (!hideControls && roleFilter !== "all") {
			const cfg = ROLE_GROUPS[roleFilter];
			filtered = filtered.filter((r) => cfg.priorities.includes(r.priority));
		}
		if (!hideControls && searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(r) =>
					r.name.toLowerCase().includes(q) ||
					r.description?.toLowerCase().includes(q),
			);
		}
		return filtered;
	}, [roles, roleFilter, searchQuery, hideControls]);

	const visibleRoles = useMemo(() => {
		if (viewMode === "matrix" && filteredRoles.length > maxVisibleRoles) {
			return filteredRoles.slice(
				visibleRoleStart,
				visibleRoleStart + maxVisibleRoles,
			);
		}
		return filteredRoles;
	}, [filteredRoles, viewMode, visibleRoleStart, maxVisibleRoles]);

	const handleScopeChange = (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope: PermissionScope | null,
	) => onPermissionChange?.(roleId, resourceId, actionId, enabled, scope);

	const handlePermissionCycle = (
		roleId: string,
		resourceId: string,
		actionId: string,
	) => {
		const current = getPermissionScope(roles, roleId, resourceId, actionId);
		const has = hasPermission(roles, roleId, resourceId, actionId);
		const { enabled, scope } = cycleScope(has ? current : undefined);
		onPermissionChange?.(roleId, resourceId, actionId, enabled, scope);
	};

	const handleBulkSet = (enabled: boolean) => {
		const nextScope = enabled ? "own" : null;
		selectedBatchRoles.forEach((roleId) =>
			resources.forEach((r) =>
				r.actions.forEach((a) =>
					onPermissionChange?.(roleId, r.id, a.id, enabled, nextScope),
				),
			),
		);
	};

	const controls = (
		<MatrixControls
			variant={isMobile ? "mobile" : "desktop"}
			searchQuery={searchQuery}
			onSearchChange={(v) =>
				dispatch({ type: "SET_SEARCH_QUERY", searchQuery: v })
			}
			roleFilter={roleFilter}
			onRoleFilterChange={(v) =>
				dispatch({ type: "SET_ROLE_FILTER", roleFilter: v })
			}
			viewMode={viewMode}
			onViewModeChange={(v) => dispatch({ type: "SET_VIEW_MODE", viewMode: v })}
		/>
	);

	if (isMobile) {
		return (
			<div className="space-y-4">
				{!hideControls && (
					<Card>
						<CardContent className="p-4 space-y-4">{controls}</CardContent>
					</Card>
				)}
				<MobileRoleCards
					filteredRoles={filteredRoles}
					roles={roles}
					resources={resources}
					expandedResources={expandedResources}
					onToggleResource={(id) =>
						dispatch({ type: "TOGGLE_RESOURCE", resourceId: id })
					}
					onPermissionCycle={handlePermissionCycle}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4 w-full max-w-full overflow-hidden">
			{!hideControls && (
				<Card>
					<CardContent className="p-4">
						{controls}
						<BulkApplyBar
							selectedBatchRoles={selectedBatchRoles}
							resources={resources}
							onClearSelection={() => dispatch({ type: "CLEAR_BATCH_ROLES" })}
							onBulkSet={handleBulkSet}
						/>
						<RolePagination
							visibleRoleStart={visibleRoleStart}
							totalRoles={filteredRoles.length}
							pageSize={maxVisibleRoles}
							onChangeStart={(next) =>
								dispatch({
									type: "SET_VISIBLE_ROLE_START",
									visibleRoleStart: next,
								})
							}
						/>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>
							{viewMode === "compact"
								? "Compact Permission Overview"
								: "Permission Matrix"}
						</span>
						<MatrixLegend />
					</CardTitle>
				</CardHeader>
				<CardContent>
					{viewMode === "compact" ? (
						<CompactView
							visibleRoles={visibleRoles}
							resources={resources}
							roles={roles}
							selectedBatchRoles={selectedBatchRoles}
							onToggleBatchRole={(id) =>
								dispatch({ type: "TOGGLE_BATCH_ROLE", roleId: id })
							}
						/>
					) : (
						<div className="overflow-x-auto max-w-full">
							<div className="min-w-max">
								<table className="w-full border-collapse">
									<thead>
										<tr>
											<RolePicker
												visibleRoles={visibleRoles}
												selectedBatchRoles={selectedBatchRoles}
												onToggleBatchRole={(id) =>
													dispatch({
														type: "TOGGLE_BATCH_ROLE",
														roleId: id,
													})
												}
											/>
										</tr>
									</thead>
									<tbody>
										{resources.map((resource) => (
											<ResourceRow
												key={resource.id}
												resource={resource}
												visibleRoles={visibleRoles}
												roles={roles}
												onScopeChange={handleScopeChange}
											/>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
