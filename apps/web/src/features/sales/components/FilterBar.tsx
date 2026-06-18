import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_PILLS = [
	{ value: "", label: "All Status", dot: "bg-[#0a0a0a]" },
	{ value: "completed", label: "Paid", dot: "bg-blue-700" },
	{ value: "confirmed", label: "Partial", dot: "bg-amber-700" },
	{ value: "overdue", label: "Overdue", dot: "bg-red-700" },
	{ value: "cancelled", label: "Cancelled", dot: "bg-[#737373]" },
] as const;

export function FilterBar({
	search,
	status,
	branchId,
	from,
	to,
	onSearchChange,
	onStatusChange,
	onBranchChange,
	onFromChange,
	onToChange,
	onClear,
	nodeOptions,
}: {
	search: string;
	status: string;
	branchId: string;
	from: string;
	to: string;
	onSearchChange: (v: string) => void;
	onStatusChange: (v: string) => void;
	onBranchChange: (v: string) => void;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
	onClear: () => void;
	nodeOptions: Array<{ id: string; name: string }>;
}) {
	const hasFilters = !!(search || status || branchId || from || to);

	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e5e5e5] bg-white px-6 py-3">
			{/* Search */}
			<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
				<svg
					className="text-[#737373] flex-shrink-0"
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.35-4.35" />
				</svg>
				<input
					className="w-44 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
					placeholder="Search order ID or customer…"
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
				/>
			</div>

			{/* Status pills */}
			{STATUS_PILLS.map((pill) => (
				<button
					key={pill.value}
					type="button"
					onClick={() => onStatusChange(pill.value)}
					className={cn(
						"flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
						status === pill.value
							? "border-[#0a0a0a] bg-[#0a0a0a] text-white font-semibold"
							: "border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]",
					)}
				>
					<span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
					{pill.label}
				</button>
			))}

			<div className="mx-1 h-5 border-r border-[#e5e5e5]" />

			{/* Branch */}
			<Select
				value={branchId || "all"}
				onValueChange={(v) => onBranchChange(v === "all" ? "" : v)}
			>
				<SelectTrigger className="h-8 w-36 text-xs border-[#e5e5e5]">
					<SelectValue placeholder="All Branches" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Branches</SelectItem>
					{nodeOptions.map((node) => (
						<SelectItem key={node.id} value={node.id}>
							{node.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Date range */}
			<input
				type="date"
				className="h-8 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
				value={from}
				onChange={(e) => onFromChange(e.target.value)}
			/>
			<span className="text-xs text-[#737373]">→</span>
			<input
				type="date"
				className="h-8 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
				value={to}
				onChange={(e) => onToChange(e.target.value)}
			/>

			{/* Clear */}
			{hasFilters && (
				<button
					type="button"
					onClick={onClear}
					className="ml-auto text-xs text-[#737373] hover:text-[#0a0a0a]"
				>
					Clear filters
				</button>
			)}
		</div>
	);
}
