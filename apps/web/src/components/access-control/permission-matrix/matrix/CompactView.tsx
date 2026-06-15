import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
	getPermissionScope,
	hasPermission,
} from "@/hooks/usePermissionMatrixState";
import type {
	PermissionResource,
	Role,
} from "@/components/access-control/permission-matrix/permission-matrix.types";
import {
	formatActionName,
	formatResourceName,
	getRoleGroupBadge,
	getScopeIcon,
} from "./scope-style";

export interface CompactViewProps {
	visibleRoles: Role[];
	resources: PermissionResource[];
	roles: Role[];
	selectedBatchRoles: Set<string>;
	onToggleBatchRole: (roleId: string) => void;
}

export function CompactView({
	visibleRoles,
	resources,
	roles,
	selectedBatchRoles,
	onToggleBatchRole,
}: CompactViewProps) {
	return (
		<div className="space-y-4">
			{visibleRoles.map((role) => {
				const groupBadge = getRoleGroupBadge(role);
				const rolePerms = role.permissions.length;
				const total = resources.reduce((sum, r) => sum + r.actions.length, 0);
				const pct = total === 0 ? 0 : Math.round((rolePerms / total) * 100);
				return (
					<div key={role.id} className="border rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<div className="flex items-center gap-3">
								<Checkbox
									checked={selectedBatchRoles.has(role.id)}
									onCheckedChange={() => onToggleBatchRole(role.id)}
								/>
								<div>
									<div className="flex items-center gap-2">
										<span className="font-medium">{role.name}</span>
										{groupBadge && (
											<Badge className={cn("text-xs", groupBadge.config.color)}>
												{groupBadge.config.label}
											</Badge>
										)}
									</div>
									<div className="text-sm text-muted-foreground">
										{role.description}
									</div>
								</div>
							</div>
							<div className="text-right">
								<div className="text-sm font-medium">
									{rolePerms}/{total} permissions
								</div>
								<div className="text-xs text-muted-foreground">
									{pct}% access
								</div>
							</div>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{resources.map((resource) => {
								const Icon = resource.icon;
								const rps = role.permissions.filter(
									(p) => p.resourceId === resource.id,
								);
								return (
									<div key={resource.id} className="bg-muted/30 rounded p-3">
										<div className="flex items-center gap-2 mb-2">
											{Icon && <Icon className="size-4" />}
											<span className="font-medium text-sm">
												{formatResourceName(resource.name)}
											</span>
											<Badge variant="outline" className="text-xs">
												{rps.length}/{resource.actions.length}
											</Badge>
										</div>
										<div className="space-y-1">
											{resource.actions.map((action) => {
												const hasAccess = hasPermission(
													roles,
													role.id,
													resource.id,
													action.id,
												);
												const scope = getPermissionScope(
													roles,
													role.id,
													resource.id,
													action.id,
												);
												return (
													<div
														key={action.id}
														className="flex items-center justify-between text-xs"
													>
														<span
															className={cn(
																hasAccess
																	? "text-foreground"
																	: "text-muted-foreground",
															)}
														>
															{formatActionName(action.name)}
														</span>
														<div className="flex items-center gap-1">
															{hasAccess && scope && (
																<Badge
																	variant="outline"
																	className="text-[10px] px-1 py-0"
																>
																	{scope}
																</Badge>
															)}
															{getScopeIcon(scope)}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
