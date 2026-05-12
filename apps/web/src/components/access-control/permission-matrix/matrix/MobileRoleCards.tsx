import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
	cycleScope,
	getPermissionScope,
	hasPermission,
} from "@/hooks/usePermissionMatrixState";
import type {
	PermissionResource,
	Role,
} from "@/components/access-control/permission-matrix/PermissionMatrix";
import {
	formatActionName,
	formatResourceName,
	getRoleGroupBadge,
	getScopeButtonStyle,
	getScopeIcon,
} from "./scope-style";

export interface MobileRoleCardsProps {
	filteredRoles: Role[];
	roles: Role[];
	resources: PermissionResource[];
	expandedResources: Set<string>;
	onToggleResource: (id: string) => void;
	onPermissionCycle: (
		roleId: string,
		resourceId: string,
		actionId: string,
	) => void;
}

export function MobileRoleCards({
	filteredRoles,
	roles,
	resources,
	expandedResources,
	onToggleResource,
	onPermissionCycle,
}: MobileRoleCardsProps) {
	return (
		<div className="space-y-3 max-w-full overflow-hidden">
			{filteredRoles.map((role) => {
				const groupBadge = getRoleGroupBadge(role);
				const isExpanded = expandedResources.has(role.id);
				return (
					<Card key={role.id} className="w-full">
						<Collapsible
							open={isExpanded}
							onOpenChange={() => onToggleResource(role.id)}
						>
							<CollapsibleTrigger asChild>
								<CardHeader className="cursor-pointer hover:bg-muted/50 pb-3">
									<CardTitle className="flex items-center justify-between text-base">
										<div className="flex items-center gap-2 min-w-0 flex-1">
											<div className="size-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
												<Users className="size-4 text-primary" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-medium">{role.name}</span>
													{groupBadge && (
														<Badge
															className={cn(
																"text-xs",
																groupBadge.config.color,
															)}
														>
															{groupBadge.config.label}
														</Badge>
													)}
												</div>
												<div className="text-xs text-muted-foreground text-left">
													{role.description}
												</div>
											</div>
										</div>
										{isExpanded ? (
											<ChevronDown className="size-4" />
										) : (
											<ChevronRight className="size-4" />
										)}
									</CardTitle>
								</CardHeader>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<CardContent className="pt-0">
									<div className="space-y-4">
										{resources.map((resource) => {
											const Icon = resource.icon;
											const rolePerms = role.permissions.filter(
												(p) => p.resourceId === resource.id,
											);
											return (
												<div key={resource.id} className="space-y-2">
													<div className="flex items-center gap-2 text-sm font-medium">
														{Icon && (
															<Icon className="size-4 text-primary" />
														)}
														<span>{formatResourceName(resource.name)}</span>
														<Badge variant="outline" className="text-xs">
															{rolePerms.length}/{resource.actions.length}
														</Badge>
													</div>
													<div className="space-y-2 pl-6">
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
																	className="flex items-center justify-between p-2 bg-muted/30 rounded border min-w-0"
																>
																	<div className="flex items-center gap-2 min-w-0 flex-1">
																		<Button
																			variant="ghost"
																			size="sm"
																			className={cn(
																				"size-6 p-0 rounded-full flex-shrink-0",
																				hasAccess
																					? getScopeButtonStyle(scope)
																					: "bg-brand-secondary-3 hover:bg-brand-secondary-3",
																			)}
																			onClick={() =>
																				onPermissionCycle(
																					role.id,
																					resource.id,
																					action.id,
																				)
																			}
																		>
																			{getScopeIcon(scope)}
																		</Button>
																		<div className="min-w-0 flex-1">
																			<div className="font-medium text-sm">
																				{formatActionName(action.name)}
																			</div>
																			<div className="text-xs text-muted-foreground">
																				{action.description}
																			</div>
																		</div>
																	</div>
																	{hasAccess && scope && (
																		<Badge
																			className="text-xs"
																			variant="outline"
																		>
																			{scope}
																		</Badge>
																	)}
																</div>
															);
														})}
													</div>
												</div>
											);
										})}
									</div>
								</CardContent>
							</CollapsibleContent>
						</Collapsible>
					</Card>
				);
			})}
		</div>
	);
}

/** Helper for consumers that want to keep the cycle logic inline. */
export const cycleScopeForMobile = cycleScope;
