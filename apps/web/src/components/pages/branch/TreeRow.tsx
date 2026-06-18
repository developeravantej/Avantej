import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";

import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { NodeWithStats } from "./types";

// ─── Tree Row ──────────────────────────────────────────────────────────────────

export function TreeRow({
	node,
	depth,
	isExpanded,
	hasChildren,
	isSelected,
	onToggle,
	onSelect,
}: {
	node: NodeWithStats;
	depth: number;
	isExpanded: boolean;
	hasChildren: boolean;
	isSelected: boolean;
	onToggle: () => void;
	onSelect: () => void;
}) {
	const isBranch = node.type === "branch";
	const isRoot = depth === 0;

	// Root node style (country-level)
	if (isRoot && !node.parentId) {
		return (
			<div
				role="button"
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect();
				}}
				className={cn(
					"flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 cursor-pointer transition-colors",
					isSelected
						? "bg-[#d6cdb1]/20 border border-[#d6cdb1]"
						: "bg-[#f3f3f3] hover:bg-[#e5e5e5]",
				)}
			>
				<div className="w-2 h-2 rounded-sm bg-[#737373]/60 shrink-0" />
				<p className="text-xs font-semibold text-[#737373] uppercase tracking-wider">
					{node.name}
				</p>
				{hasChildren && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggle();
						}}
						className="ml-auto text-[#737373]/60 hover:text-[#0a0a0a]"
					>
						{isExpanded ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronRight className="h-3.5 w-3.5" />
						)}
					</button>
				)}
			</div>
		);
	}

	// Branch (leaf) node
	if (isBranch) {
		const revenue =
			node.monthRevenueCents != null
				? formatPrice(node.monthRevenueCents, "MYR")
				: null;
		const members =
			node.membersCount != null ? `${node.membersCount} members` : null;

		return (
			<div className="relative py-1.5">
				{/* Horizontal connector tick */}
				<div
					className="absolute top-[1.35rem] bg-[#e5e5e5]"
					style={{ left: "-14px", width: "12px", height: "1px" }}
				/>
				<div
					role="button"
					tabIndex={0}
					onClick={onSelect}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onSelect();
					}}
					className={cn(
						"flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
						isSelected
							? "bg-white border-2 border-[#0a0a0a] shadow-sm"
							: "bg-white border border-[#e5e5e5] hover:bg-[#f3f3f3]",
					)}
				>
					<div
						className={cn(
							"w-2 h-2 rounded-full shrink-0",
							isSelected ? "bg-[#0a0a0a]" : "bg-[#737373]",
						)}
					/>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-semibold truncate text-[#0a0a0a]">
							{node.name}
						</p>
						{(revenue || members || node.stale) && (
							<p className="text-xs font-mono tabular-nums text-[#737373] truncate">
								{node.stale ? (
									<Loader2 className="h-3 w-3 animate-spin inline" />
								) : (
									[revenue, members].filter(Boolean).join(" · ")
								)}
							</p>
						)}
					</div>
				</div>
			</div>
		);
	}

	// Intermediate node (region, area, district, etc.)
	return (
		<div className="relative mb-2">
			{/* Horizontal connector tick */}
			<div
				className="absolute top-[0.875rem] bg-[#e5e5e5]"
				style={{ left: "-20px", width: "14px", height: "1px" }}
			/>
			<div
				role="button"
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect();
				}}
				className={cn(
					"flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
					isSelected
						? "bg-[#d6cdb1]/20 border border-[#d6cdb1]"
						: "bg-[#f3f3f3] hover:bg-[#e5e5e5]",
				)}
			>
				{hasChildren && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggle();
						}}
						className="text-[#737373] shrink-0"
					>
						{isExpanded ? (
							<ChevronDown className="h-3 w-3" />
						) : (
							<ChevronRight className="h-3 w-3" />
						)}
					</button>
				)}
				<span className="text-xs font-semibold flex-1 min-w-0 truncate text-[#0a0a0a]">
					{node.name}
				</span>
				<span className="text-xs font-medium capitalize text-[#737373] shrink-0">
					{node.type}
				</span>
			</div>
		</div>
	);
}
