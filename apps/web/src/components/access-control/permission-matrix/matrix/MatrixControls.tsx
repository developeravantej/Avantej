import { Grid, List, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ROLE_GROUPS,
} from "./scope-style";
import type { RoleGroup, ViewMode } from "@/hooks/usePermissionMatrixState";

export interface MatrixControlsProps {
	variant: "mobile" | "desktop";
	searchQuery: string;
	onSearchChange: (value: string) => void;
	roleFilter: RoleGroup;
	onRoleFilterChange: (value: RoleGroup) => void;
	viewMode: ViewMode;
	onViewModeChange: (value: ViewMode) => void;
}

/** Search + role-group filter + view-mode toggle. Shared by mobile/desktop. */
export function MatrixControls({
	variant,
	searchQuery,
	onSearchChange,
	roleFilter,
	onRoleFilterChange,
	viewMode,
	onViewModeChange,
}: MatrixControlsProps) {
	const isMobile = variant === "mobile";

	return (
		<>
			<div className={isMobile ? "flex gap-2" : "flex items-center gap-4 flex-wrap"}>
				<div className={isMobile ? "relative flex-1" : "relative flex-1 max-w-md"}>
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
					<Input
						placeholder="Search roles..."
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						className="pl-10"
					/>
				</div>
				<Select
					value={roleFilter}
					onValueChange={(v) => onRoleFilterChange(v as RoleGroup)}
				>
					<SelectTrigger className={isMobile ? "w-32" : "w-40"}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(ROLE_GROUPS).map(([key, config]) => (
							<SelectItem key={key} value={key}>
								{config.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{!isMobile && (
					<div className="flex gap-2">
						<Button
							variant={viewMode === "matrix" ? "default" : "outline"}
							size="sm"
							onClick={() => onViewModeChange("matrix")}
						>
							<Grid className="w-4 h-4 mr-2" />
							Matrix
						</Button>
						<Button
							variant={viewMode === "compact" ? "default" : "outline"}
							size="sm"
							onClick={() => onViewModeChange("compact")}
						>
							<List className="w-4 h-4 mr-2" />
							Compact
						</Button>
					</div>
				)}
			</div>
			{isMobile && (
				<div className="flex gap-2">
					<Button
						variant={viewMode === "roles" ? "default" : "outline"}
						size="sm"
						onClick={() => onViewModeChange("roles")}
						className="flex-1"
					>
						<Users className="w-4 h-4 mr-2" />
						By Roles
					</Button>
					<Button
						variant={viewMode === "matrix" ? "default" : "outline"}
						size="sm"
						onClick={() => onViewModeChange("matrix")}
						className="flex-1"
					>
						<Grid className="w-4 h-4 mr-2" />
						Matrix
					</Button>
				</div>
			)}
		</>
	);
}
