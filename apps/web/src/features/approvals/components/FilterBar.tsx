import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalStatus, PriorityLevel } from "../approvals.types";

export function FilterBar({
	search,
	onSearch,
	priorityFilter,
	onPriority,
	scope,
	onScope,
	counts,
	approvalStatus,
	onApprovalStatus,
	onExport,
	exportDisabled,
}: {
	search: string;
	onSearch: (v: string) => void;
	priorityFilter: "all" | PriorityLevel;
	onPriority: (v: "all" | PriorityLevel) => void;
	scope: "all" | "assignable_to_me";
	onScope: (v: "all" | "assignable_to_me") => void;
	counts: { all: number; high: number; med: number; low: number };
	approvalStatus: ApprovalStatus;
	onApprovalStatus: (v: ApprovalStatus) => void;
	onExport: () => void;
	exportDisabled: boolean;
}) {
	const priorityOptions: Array<{ key: "all" | PriorityLevel; label: string }> =
		[
			{ key: "all", label: "All" },
			{ key: "high", label: "High" },
			{ key: "med", label: "Med" },
			{ key: "low", label: "Low" },
		];

	const statusOptions: Array<{
		key: ApprovalStatus;
		label: string;
		color: string;
		activeColor: string;
	}> = [
		{
			key: "awaiting_payment",
			label: "Awaiting payment",
			color: "text-orange-600",
			activeColor: "bg-orange-500 text-white",
		},
		{
			key: "pending",
			label: "Pending",
			color: "text-amber-600",
			activeColor: "bg-amber-500 text-white",
		},
		{
			key: "approved",
			label: "Approved",
			color: "text-emerald-600",
			activeColor: "bg-emerald-500 text-white",
		},
		{
			key: "rejected",
			label: "Rejected",
			color: "text-red-600",
			activeColor: "bg-red-500 text-white",
		},
	];

	return (
		<div className="mt-6 flex flex-wrap items-center gap-3">
			{/* Search */}
			<div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
				<Search size={14} className="shrink-0 text-muted-foreground" />
				<input
					type="text"
					value={search}
					onChange={(e) => onSearch(e.target.value)}
					placeholder="Search customer, package…"
					className="flex-1 bg-transparent text-sm text-[#0a0a0a] outline-none placeholder:text-[#a3a3a3]"
				/>
			</div>

			{/* Status pills */}
			<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-white p-1">
				{statusOptions.map((opt) => (
					<button
						key={opt.key}
						type="button"
						onClick={() => onApprovalStatus(opt.key)}
						className={cn(
							"rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
							approvalStatus === opt.key
								? opt.activeColor
								: `${opt.color} hover:opacity-80`,
						)}
					>
						{opt.label}
					</button>
				))}
			</div>

			{/* Priority pills */}
			<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-white p-1">
				{priorityOptions.map((opt) => (
					<button
						key={opt.key}
						type="button"
						onClick={() => onPriority(opt.key)}
						className={cn(
							"rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
							priorityFilter === opt.key
								? "bg-[#0a0a0a] text-white"
								: "text-muted-foreground hover:text-[#0a0a0a]",
						)}
					>
						{opt.label}
						{opt.key !== "all" && (
							<span
								className={cn(
									"ml-1",
									priorityFilter === opt.key ? "opacity-70" : "text-[#a3a3a3]",
								)}
							>
								{counts[opt.key]}
							</span>
						)}
						{opt.key === "all" && (
							<span
								className={cn(
									"ml-1",
									priorityFilter === "all" ? "opacity-70" : "text-[#a3a3a3]",
								)}
							>
								{counts.all}
							</span>
						)}
					</button>
				))}
			</div>

			{/* Scope toggle (folded into filter bar) */}
			<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-white p-1">
				<button
					type="button"
					onClick={() => onScope("all")}
					className={cn(
						"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
						scope === "all"
							? "bg-[#0a0a0a] text-white"
							: "text-muted-foreground hover:text-[#0a0a0a]",
					)}
				>
					All branches
				</button>
				<button
					type="button"
					onClick={() => onScope("assignable_to_me")}
					className={cn(
						"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
						scope === "assignable_to_me"
							? "bg-[#0a0a0a] text-white"
							: "text-muted-foreground hover:text-[#0a0a0a]",
					)}
				>
					Assignable to me
				</button>
			</div>

			{/* Export queue */}
			<button
				type="button"
				onClick={onExport}
				disabled={exportDisabled}
				className="flex items-center gap-1.5 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 text-xs font-medium transition-colors hover:bg-[#f3f3f3] disabled:opacity-40"
			>
				Export queue
			</button>
		</div>
	);
}
