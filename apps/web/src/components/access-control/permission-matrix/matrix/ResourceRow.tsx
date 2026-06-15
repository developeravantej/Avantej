import React from "react";
import type {
	PermissionResource,
	Role,
} from "@/components/access-control/permission-matrix/permission-matrix.types";
import {
	getPermissionScope,
	hasPermission,
	type PermissionScope,
} from "@/hooks/usePermissionMatrixState";
import { ActionCell } from "./ActionCell";
import { formatActionName, formatResourceName } from "./scope-style";

export interface ResourceRowProps {
	resource: PermissionResource;
	visibleRoles: Role[];
	roles: Role[];
	onScopeChange: (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope: PermissionScope | null,
	) => void;
}

/**
 * One resource's block in the desktop matrix — the resource description row
 * followed by one row per action. Each action row contains one `<ActionCell>`
 * per visible role.
 */
export function ResourceRow({
	resource,
	visibleRoles,
	roles,
	onScopeChange,
}: ResourceRowProps) {
	const Icon = resource.icon;

	return (
		<React.Fragment>
			<tr className="border-b bg-muted/50">
				<td className="p-3 font-medium sticky left-0 bg-muted/50 z-10">
					<div className="flex items-center gap-2">
						{Icon && <Icon className="size-4 flex-shrink-0" />}
						<span className="text-sm font-medium">
							{formatResourceName(resource.name)}
						</span>
					</div>
				</td>
				<td
					colSpan={visibleRoles.length}
					className="p-3 text-sm text-muted-foreground"
				>
					{resource.description}
				</td>
			</tr>
			{resource.actions.map((action) => (
				<tr
					key={`${resource.id}-${action.id}`}
					className="border-b hover:bg-muted/30"
				>
					<td className="p-3 sticky left-0 bg-background z-10">
						<div className="pl-6">
							<div className="font-medium text-sm">
								{formatActionName(action.name)}
							</div>
							<div className="text-xs text-muted-foreground line-clamp-2">
								{action.description}
							</div>
						</div>
					</td>
					{visibleRoles.map((role) => (
						<td key={role.id} className="p-3 text-center">
							<ActionCell
								roleId={role.id}
								resourceId={resource.id}
								actionId={action.id}
								hasAccess={hasPermission(
									roles,
									role.id,
									resource.id,
									action.id,
								)}
								scope={getPermissionScope(
									roles,
									role.id,
									resource.id,
									action.id,
								)}
								onScopeChange={onScopeChange}
							/>
						</td>
					))}
				</tr>
			))}
		</React.Fragment>
	);
}
