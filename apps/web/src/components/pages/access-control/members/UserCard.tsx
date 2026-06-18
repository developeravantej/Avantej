import {
	Mail,
	Calendar,
	MoreVertical,
	Edit,
	Shield,
	Trash2,
	MoveRight,
	Undo2,
} from "lucide-react";
import { GhlSyncBadge } from "@/components/ghl-sync-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UserForAssignment, RoleResponse } from "./types";

interface UserCardProps {
	user: UserForAssignment;
	roles: RoleResponse[];
	canMoveBranch?: boolean;
	onEditRoles: () => void;
	onEditDetails: () => void;
	onMoveBranch?: () => void;
	onDeactivate: () => void;
	onSoftDelete: () => void;
	onRestore: () => void;
	onRetryGhlSync: () => void;
	onSelect?: (selected: boolean) => void;
	isSelected?: boolean;
	isLoading?: boolean;
	isRetryingGhlSync?: boolean;
}

// react-doctor-disable-next-line react-doctor/no-many-boolean-props -- TODO: refactor to discriminated union (mode: "view" | "edit" | "syncing") once role-editor backlog clears
export function UserCard({
	user,
	roles,
	canMoveBranch,
	onEditRoles,
	onEditDetails,
	onMoveBranch,
	onDeactivate,
	onSoftDelete,
	onRestore,
	onRetryGhlSync,
	onSelect,
	isSelected,
	isLoading: _isLoading,
	isRetryingGhlSync,
}: UserCardProps) {
	const userRoles = roles.filter((role) => user.roles.includes(role.id));
	const highestRole = userRoles.reduce(
		(highest, current) =>
			current.priority < highest.priority ? current : highest,
		userRoles[0],
	);

	const formatLastLogin = (dateString?: string) => {
		if (!dateString) return "Never";
		const date = new Date(dateString);
		const now = new Date();
		const diffDays = Math.floor(
			(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	};

	const getPriorityColor = (priority: number) => {
		switch (priority) {
			case 1:
				return "bg-rose-50 text-rose-600 border-rose-200";
			case 2:
				return "bg-amber-100 text-amber-800 border-amber-300";
			case 3:
				return "bg-primary/10 text-primary border-primary/30";
			default:
				return "bg-brand-secondary-3 text-brand-primary-1 border-brand-secondary-3";
		}
	};

	return (
		<Card
			className={cn(
				"transition-all duration-200 hover:shadow-md",
				!user.isActive && "opacity-60",
				isSelected && "ring-2 ring-primary ring-offset-2",
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
						<Avatar className="size-10">
							<AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
						</Avatar>
						<div className="space-y-1 flex-1">
							<div className="flex items-center gap-2">
								<CardTitle className="text-base">{user.name}</CardTitle>
								{user.isDeleted ? (
									<Badge
										variant="destructive"
										className="text-xs"
										data-testid="member-deleted-badge"
									>
										Deleted
									</Badge>
								) : (
									!user.isActive && (
										<Badge variant="secondary" className="text-xs">
											Inactive
										</Badge>
									)
								)}
							</div>
							<div className="flex items-center gap-1 text-sm text-[#737373]">
								<Mail className="size-3" />
								<span>{user.email}</span>
							</div>
							{user.department && (
								<div className="text-xs text-[#737373]">
									{user.department} Department
								</div>
							)}
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="size-8 p-0">
								<MoreVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem
								onClick={onEditRoles}
								className="cursor-pointer"
							>
								<Shield className="size-4 mr-2" />
								Edit Roles
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={onEditDetails}
								className="cursor-pointer"
							>
								<Edit className="size-4 mr-2" />
								Edit User
							</DropdownMenuItem>
							{canMoveBranch && onMoveBranch && (
								<DropdownMenuItem
									onClick={onMoveBranch}
									className="cursor-pointer"
									aria-label={`Move ${user.name} to a different branch`}
								>
									<MoveRight className="size-4 mr-2" />
									Move to branch
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={onDeactivate}
								className="cursor-pointer text-rose-600 focus:text-rose-600"
							>
								<Trash2 className="size-4 mr-2" />
								{user.isActive ? "Deactivate" : "Activate"} User
							</DropdownMenuItem>
							{user.isDeleted ? (
								<DropdownMenuItem
									onClick={onRestore}
									className="cursor-pointer"
									data-testid="member-restore-action"
								>
									<Undo2 className="size-4 mr-2" />
									Restore
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={onSoftDelete}
									className="cursor-pointer text-rose-600 focus:text-rose-600"
									data-testid="member-delete-action"
								>
									<Trash2 className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					{highestRole && (
						<Badge
							variant="outline"
							className={cn("text-xs", getPriorityColor(highestRole.priority))}
						>
							{highestRole.name}
						</Badge>
					)}
					{userRoles.length > 1 && (
						<Badge variant="secondary" className="text-xs">
							+{userRoles.length - 1} more
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<span className="text-[#737373]">Last Login</span>
						<div className="flex items-center gap-1">
							<Calendar className="size-3 text-[#737373]" />
							<span>{formatLastLogin(user.lastLogin)}</span>
						</div>
					</div>

					<div className="space-y-1">
						<span className="text-sm font-medium text-[#737373]">
							Assigned Roles
						</span>
						<div className="flex flex-wrap gap-1">
							{userRoles.map((role) => (
								<Badge key={role.id} variant="outline" className="text-xs">
									{role.name}
								</Badge>
							))}
							{userRoles.length === 0 && (
								<span className="text-xs text-[#737373]">
									No roles assigned
								</span>
							)}
						</div>
					</div>

					<div className="flex items-center justify-between text-sm pt-1">
						<span className="text-[#737373]">GHL Sync</span>
						<GhlSyncBadge
							ghlSync={user.ghlSync}
							onRetry={onRetryGhlSync}
							isRetrying={!!isRetryingGhlSync}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
