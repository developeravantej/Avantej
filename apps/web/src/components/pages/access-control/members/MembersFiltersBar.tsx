import { Search, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoleResponse } from "./types";

interface MembersFiltersBarProps {
	searchQuery: string;
	roleFilter: string;
	statusFilter: string;
	showDeleted: boolean;
	selectedCount: number;
	allSelected: boolean;
	someSelected: boolean;
	filteredUsersCount: number;
	roles: RoleResponse[];
	onSearchChange: (value: string) => void;
	onRoleFilterChange: (value: string) => void;
	onStatusFilterChange: (value: string) => void;
	onShowDeletedChange: (value: boolean) => void;
	onSelectAll: (selected: boolean) => void;
}

export function MembersFiltersBar({
	searchQuery,
	roleFilter,
	statusFilter,
	showDeleted,
	selectedCount,
	allSelected,
	someSelected,
	filteredUsersCount,
	roles,
	onSearchChange,
	onRoleFilterChange,
	onStatusFilterChange,
	onShowDeletedChange,
	onSelectAll,
}: MembersFiltersBarProps) {
	return (
		<Card>
			<CardContent className="py-4">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
					<div className="relative flex-1 max-w-md">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#737373] size-4" />
						<Input
							placeholder="Search users..."
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							className="pl-10"
						/>
					</div>

					<div className="flex gap-2">
						<Select value={roleFilter} onValueChange={onRoleFilterChange}>
							<SelectTrigger className="w-40">
								<SelectValue placeholder="Filter by role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Roles</SelectItem>
								<SelectItem value="none">No Roles</SelectItem>
								{roles.map((role) => (
									<SelectItem key={role.id} value={role.id}>
										{role.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={statusFilter} onValueChange={onStatusFilterChange}>
							<SelectTrigger className="w-32">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Status</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>

						<label
							htmlFor="members-show-deleted"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="members-show-deleted"
								checked={showDeleted}
								onCheckedChange={(v) => onShowDeletedChange(v === true)}
								data-testid="show-deleted-members-toggle"
							/>
							<span>Show deleted</span>
						</label>
					</div>

					{selectedCount > 0 && (
						<div className="flex items-center gap-2">
							<Badge variant="secondary">{selectedCount} selected</Badge>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										<MoreVertical className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuItem disabled title="Bulk actions coming soon">
										Bulk Assign Role
									</DropdownMenuItem>
									<DropdownMenuItem disabled title="Bulk actions coming soon">
										Bulk Remove Role
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										disabled
										title="Bulk actions coming soon"
										className="text-rose-600"
									>
										Deactivate Selected
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</div>

				{/* Bulk Selection */}
				{filteredUsersCount > 0 && (
					<div className="flex items-center gap-2 mt-4">
						<Checkbox
							checked={
								allSelected ? true : someSelected ? "indeterminate" : false
							}
							onCheckedChange={onSelectAll}
						/>
						<span className="text-sm text-[#737373]">
							{allSelected
								? "Deselect all"
								: someSelected
									? `${selectedCount} selected`
									: "Select all"}
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
