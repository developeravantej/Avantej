import { useNavigate } from "@tanstack/react-router";
import { columns as salesColumns, type SalesRow } from "@/components/tables/sales/view/columns";
import SalesDataTable from "@/components/tables/sales/view/data-table";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ErrorCard } from "@/features/sales/components/ErrorCard";
import { FilterBar } from "@/features/sales/components/FilterBar";

export interface SalesTabProps {
	data: SalesRow[];
	total: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
	search: string;
	from: string;
	to: string;
	status: string;
	branchId: string;
	refundStatus: "all" | "none" | "pending" | "partial" | "processed";
	onSearchChange: (v: string) => void;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
	onStatusChange: (v: string) => void;
	onBranchChange: (v: string) => void;
	onRefundStatusChange: (v: "all" | "none" | "pending" | "partial" | "processed") => void;
	onClear: () => void;
	nodeOptions: Array<{ id: string; name: string }>;
}

export function SalesTab({
	data,
	total,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	isLoading,
	isError,
	error,
	refetch,
	search,
	from,
	to,
	status,
	branchId,
	refundStatus,
	onSearchChange,
	onFromChange,
	onToChange,
	onStatusChange,
	onBranchChange,
	onRefundStatusChange,
	onClear,
	nodeOptions,
}: SalesTabProps) {
	const navigate = useNavigate();
	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<div className="flex flex-col">
			{/* Filter bar */}
			<FilterBar
				search={search}
				status={status}
				branchId={branchId}
				from={from}
				to={to}
				onSearchChange={onSearchChange}
				onStatusChange={onStatusChange}
				onBranchChange={onBranchChange}
				onFromChange={onFromChange}
				onToChange={onToChange}
				onClear={onClear}
				nodeOptions={nodeOptions}
			/>

			{/* Refund status filter row */}
			<div className="flex shrink-0 items-center gap-2 border-b border-[#e5e5e5] bg-white px-6 py-2">
				<span className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">Refund status:</span>
				{(["all", "none", "pending", "partial", "processed"] as const).map((v) => (
					<button
						key={v}
						type="button"
						onClick={() => onRefundStatusChange(v)}
						className={cn(
							"rounded-full border px-3 py-0.5 text-[13px] font-medium transition-colors",
							refundStatus === v
								? "border-[#0a0a0a] bg-[#0a0a0a] text-white font-semibold"
								: "border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]",
						)}
					>
						{v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
					</button>
				))}
			</div>

			{/* Table */}
			<div>
				{isLoading ? (
					<PageLoader />
				) : (
					<SalesDataTable<SalesRow, unknown>
						columns={salesColumns}
						data={data}
						total={total}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						onLoadMore={onLoadMore}
						isLoading={isLoading}
						emptyTitle="No sales found"
						emptyAction={{ label: "New Sale", onClick: () => navigate({ to: "/dashboard/sales/create" }) }}
					/>
				)}
			</div>
		</div>
	);
}
