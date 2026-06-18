import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useUserContext } from "@/hooks/useUserContext";

interface FilterToolbarProps {
	from: string;
	to: string;
	status: string;
	branchId: string;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
	onStatusChange: (v: string) => void;
	onBranchChange: (v: string) => void;
	onClear: () => void;
}

export function FilterToolbar({
	from,
	to,
	status,
	branchId,
	onFromChange,
	onToChange,
	onStatusChange,
	onBranchChange,
	onClear,
}: FilterToolbarProps) {
	const { data: userContext } = useUserContext();
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === userContext.currentOrganizationId,
	);
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const branchNodes = allNodes.filter((n) => n.type === "branch");
	// Fall back to all nodes if no branch-typed nodes exist
	const nodeOptions = branchNodes.length > 0 ? branchNodes : allNodes;

	const hasFilters = !!(from || to || status || branchId);

	return (
		<div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-border/40 px-6 py-3">
			{/* From date */}
			<div className="flex flex-col gap-1">
				<label
					htmlFor="sales-filter-from"
					className="text-xs font-medium text-muted-foreground"
				>
					From
				</label>
				<Input
					id="sales-filter-from"
					type="date"
					value={from}
					onChange={(e) => onFromChange(e.target.value)}
					className="h-8 w-36 text-sm"
				/>
			</div>

			{/* To date */}
			<div className="flex flex-col gap-1">
				<label
					htmlFor="sales-filter-to"
					className="text-xs font-medium text-muted-foreground"
				>
					To
				</label>
				<Input
					id="sales-filter-to"
					type="date"
					value={to}
					onChange={(e) => onToChange(e.target.value)}
					className="h-8 w-36 text-sm"
				/>
			</div>

			{/* Status */}
			<div className="flex flex-col gap-1">
				<label
					htmlFor="sales-filter-status"
					className="text-xs font-medium text-muted-foreground"
				>
					Status
				</label>
				<Select
					value={status || "all"}
					onValueChange={(v) => onStatusChange(v === "all" ? "" : v)}
				>
					<SelectTrigger id="sales-filter-status" className="h-8 w-36 text-sm">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="draft">Draft</SelectItem>
						<SelectItem value="confirmed">Confirmed</SelectItem>
						<SelectItem value="completed">Completed</SelectItem>
						<SelectItem value="cancelled">Cancelled</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Branch */}
			{nodeOptions.length > 0 && (
				<div className="flex flex-col gap-1">
					<label
						htmlFor="sales-filter-branch"
						className="text-xs font-medium text-muted-foreground"
					>
						Branch
					</label>
					<Select
						value={branchId || "all"}
						onValueChange={(v) => onBranchChange(v === "all" ? "" : v)}
					>
						<SelectTrigger
							id="sales-filter-branch"
							className="h-8 w-40 text-sm"
						>
							<SelectValue placeholder="All branches" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All branches</SelectItem>
							{nodeOptions.map((node) => (
								<SelectItem key={node.id} value={node.id}>
									{node.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{/* Clear */}
			{hasFilters && (
				<Button
					variant="outline"
					size="sm"
					onClick={onClear}
					className="h-8 self-end"
				>
					Clear filters
				</Button>
			)}
		</div>
	);
}
