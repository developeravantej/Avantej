import React, { useState } from "react";
import {
	Shield,
	Users,
	Edit,
	Trash2,
	ChevronDown,
	ChevronRight,
	MoreVertical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
	Role,
	PermissionResource,
} from "../permission-matrix/permission-matrix.types";

const EMPTY_RESOURCES: PermissionResource[] = [];

interface RoleCardProps {
	role: Role;
	resources?: PermissionResource[];
	onEdit?: () => void;
	onDelete?: () => void;
	onDuplicate?: () => void;
	onAssignUsers?: () => void;
	onSelect?: (selected: boolean) => void;
	isSelected?: boolean;
	showDetails?: boolean;
	userCount?: number;
	className?: string;
}

interface RoleStatsProps {
	role: Role;
	resources?: PermissionResource[];
	userCount?: number;
}

function RoleStats({
	role,
	resources = EMPTY_RESOURCES,
	userCount = 0,
}: RoleStatsProps) {
	const getResourceStats = () => {
		const resourceStats = resources.flatMap((resource) => {
			const permissions = role.permissions.filter(
				(p) => p.resourceId === resource.id,
			);
			const totalActions = resource.actions.length;
			const permissionCount = Math.min(permissions.length, totalActions); // Cap at total actions
			if (permissionCount === 0) return [];
			return [
				{
					name: resource.name,
					icon: resource.icon,
					permissionCount,
					totalActions,
					permissions: permissions,
				},
			];
		});

		return resourceStats;
	};

	const getTotalPermissions = () => {
		return role.permissions.length;
	};

	const resourceStats = getResourceStats();

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-3">
				<div className="text-center p-3 bg-muted/30 rounded-lg">
					<div className="text-lg font-semibold">{getTotalPermissions()}</div>
					<div className="text-xs text-muted-foreground">Permissions</div>
				</div>
				<div className="text-center p-3 bg-muted/30 rounded-lg">
					<div className="text-lg font-semibold">{userCount}</div>
					<div className="text-xs text-muted-foreground">Users</div>
				</div>
			</div>

			{resourceStats.length > 0 && (
				<div className="space-y-2">
					<div className="text-sm font-medium text-muted-foreground">
						Resource Access
					</div>
					{resourceStats.map((stat) => {
						const Icon = stat.icon;
						const percentage = Math.min(
							100,
							Math.round((stat.permissionCount / stat.totalActions) * 100),
						);

						return (
							<div
								key={stat.name}
								className="flex items-center justify-between text-sm"
							>
								<div className="flex items-center gap-2">
									{Icon && <Icon className="size-4" />}
									<span>{stat.name}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">
										{stat.permissionCount}/{stat.totalActions}
									</span>
									<div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
										<div
											className="bg-primary h-2 rounded-full transition-all duration-200"
											style={{
												width: `${percentage}%`,
												maxWidth: "100%",
											}}
										/>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function RoleCard({
	role,
	resources = EMPTY_RESOURCES,
	onEdit,
	onDelete,
	onDuplicate,
	onAssignUsers,
	onSelect,
	isSelected = false,
	showDetails = false,
	userCount = 0,
	className,
}: RoleCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const getPriorityColor = (priority: number) => {
		switch (priority) {
			case 1:
				return "bg-red-100 text-red-800 border-red-300";
			case 2:
				return "bg-orange-100 text-orange-800 border-orange-300";
			case 3:
				return "bg-yellow-100 text-yellow-800 border-yellow-300";
			default:
				return "bg-brand-secondary-3 text-brand-primary-1 border-brand-secondary-3";
		}
	};

	const getPriorityLabel = (priority: number) => {
		switch (priority) {
			case 1:
				return "High";
			case 2:
				return "Medium";
			case 3:
				return "Low";
			default:
				return "Normal";
		}
	};

	const getTotalPermissions = () => {
		return role.permissions.length;
	};

	return (
		<Card
			className={cn(
				"w-full transition-all duration-200 hover:shadow-md",
				isSelected && "ring-2 ring-primary ring-offset-2",
				className,
			)}
		>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-start gap-3 flex-1">
						{onSelect && (
							<Checkbox
								checked={isSelected}
								onCheckedChange={onSelect}
								className="mt-1"
							/>
						)}
						<div className="flex items-center gap-3 flex-1">
							<div className="flex-shrink-0">
								<div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center">
									<Shield className="size-5 text-primary" />
								</div>
							</div>
							<div className="space-y-1 flex-1">
								<CardTitle className="text-base leading-tight">
									{role.name}
								</CardTitle>
								{role.description && (
									<p className="text-sm text-muted-foreground leading-tight">
										{role.description}
									</p>
								)}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-1">
						{showDetails && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsExpanded(!isExpanded)}
								className="size-8 p-0"
							>
								{isExpanded ? (
									<ChevronDown className="size-4" />
								) : (
									<ChevronRight className="size-4" />
								)}
							</Button>
						)}

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm" className="size-8 p-0">
									<MoreVertical className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								{onEdit && (
									<DropdownMenuItem onClick={onEdit} className="cursor-pointer">
										<Edit className="size-4 mr-2" />
										Edit Role
									</DropdownMenuItem>
								)}
								{onDuplicate && (
									<DropdownMenuItem
										onClick={onDuplicate}
										className="cursor-pointer"
									>
										<Shield className="size-4 mr-2" />
										Duplicate Role
									</DropdownMenuItem>
								)}
								{onAssignUsers && (
									<DropdownMenuItem
										onClick={onAssignUsers}
										className="cursor-pointer"
									>
										<Users className="size-4 mr-2" />
										Assign Users
									</DropdownMenuItem>
								)}
								{(onEdit || onDuplicate || onAssignUsers) && onDelete && (
									<DropdownMenuSeparator />
								)}
								{onDelete && (
									<DropdownMenuItem
										onClick={onDelete}
										className="cursor-pointer text-destructive focus:text-destructive"
									>
										<Trash2 className="size-4 mr-2" />
										Delete Role
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<Badge
						variant="outline"
						className={cn("text-xs", getPriorityColor(role.priority))}
					>
						{getPriorityLabel(role.priority)} Priority
					</Badge>
					<Badge variant="secondary" className="text-xs">
						{getTotalPermissions()} permissions
					</Badge>
					{userCount > 0 && (
						<Badge variant="outline" className="text-xs">
							<Users className="size-3 mr-1" />
							{userCount} users
						</Badge>
					)}
				</div>
			</CardHeader>

			{showDetails && (
				<Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
					<CollapsibleContent>
						<CardContent className="pt-0">
							<RoleStats
								role={role}
								resources={resources}
								userCount={userCount}
							/>
						</CardContent>
					</CollapsibleContent>
				</Collapsible>
			)}
		</Card>
	);
}
