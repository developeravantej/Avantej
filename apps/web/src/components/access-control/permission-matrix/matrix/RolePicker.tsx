import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Role } from "@/components/access-control/permission-matrix/PermissionMatrix";
import { getRoleGroupBadge } from "./scope-style";

export interface RolePickerProps {
	visibleRoles: Role[];
	selectedBatchRoles: Set<string>;
	onToggleBatchRole: (roleId: string) => void;
}

/** Column headers for the desktop matrix: role name + priority badge + batch checkbox. */
export function RolePicker({
	visibleRoles,
	selectedBatchRoles,
	onToggleBatchRole,
}: RolePickerProps) {
	return (
		<>
			<th className="text-left p-3 border-b font-medium sticky left-0 bg-background z-10 min-w-[80px]">
				Resource / Action
			</th>
			{visibleRoles.map((role) => {
				const groupBadge = getRoleGroupBadge(role);
				return (
					<th
						key={role.id}
						className="text-center p-3 border-b font-medium min-w-[80px]"
					>
						<div className="space-y-1">
							<div className="flex items-center justify-center gap-1 flex-wrap">
								<Checkbox
									checked={selectedBatchRoles.has(role.id)}
									onCheckedChange={() => onToggleBatchRole(role.id)}
									className="w-3 h-3"
								/>
								<span className="font-medium text-xs leading-tight">
									{role.name}
								</span>
							</div>
							{groupBadge && (
								<Badge className={cn("text-xs", groupBadge.config.color)}>
									{groupBadge.config.label}
								</Badge>
							)}
							<div className="text-xs text-muted-foreground leading-tight line-clamp-2">
								{role.description}
							</div>
						</div>
					</th>
				);
			})}
		</>
	);
}
