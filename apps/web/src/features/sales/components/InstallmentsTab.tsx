import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, SearchX } from "lucide-react";
import { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ErrorCard } from "@/features/sales/components/ErrorCard";

export type InstallmentStatusFilter = "due_soon" | "overdue" | "all";

type UpcomingInstallmentRow = Awaited<
	ReturnType<typeof client.installments.listUpcoming>
>["items"][number];

const STATUS_PILLS: { value: InstallmentStatusFilter; label: string }[] = [
	{ value: "due_soon", label: "Due Soon" },
	{ value: "overdue", label: "Overdue" },
	{ value: "all", label: "All Outstanding" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function deriveRowStatus(row: UpcomingInstallmentRow): {
	label: string;
	className: string;
} {
	if (row.isLocked) {
		return { label: "Locked", className: "bg-rose-50 text-rose-700" };
	}
	const due = new Date(row.dueDate).getTime();
	const now = Date.now();
	if (row.status === "overdue" || due < now) {
		return { label: "Overdue", className: "bg-amber-50 text-amber-700" };
	}
	if (due <= now + 14 * DAY_MS) {
		return { label: "Due soon", className: "bg-blue-50 text-blue-700" };
	}
	return { label: "Upcoming", className: "bg-emerald-50 text-emerald-700" };
}

function formatDueDate(value: Date | string): {
	date: string;
	relative: string;
} {
	const due = new Date(value);
	const diffDays = Math.ceil((due.getTime() - Date.now()) / DAY_MS);
	const relative =
		diffDays < 0
			? `${Math.abs(diffDays)}d overdue`
			: diffDays === 0
				? "due today"
				: `in ${diffDays}d`;
	return {
		date: due.toLocaleDateString("en-MY", {
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		relative,
	};
}

export interface InstallmentsTabProps {
	organizationId: string;
	status: InstallmentStatusFilter;
	onStatusChange: (v: InstallmentStatusFilter) => void;
	branchId: string;
	onBranchChange: (v: string) => void;
	nodeOptions: { id: string; name: string }[];
}

export function InstallmentsTab({
	organizationId,
	status,
	onStatusChange,
	branchId,
	onBranchChange,
	nodeOptions,
}: InstallmentsTabProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedSearch = useDebounce(searchQuery, 300);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: [
			"sales-installments-upcoming",
			organizationId,
			status,
			branchId,
			debouncedSearch,
		],
		queryFn: () =>
			client.installments.listUpcoming({
				organizationId,
				window: status,
				branchId: branchId || undefined,
				search: debouncedSearch || undefined,
				limit: 50,
				offset: 0,
			}),
		enabled: !!organizationId,
	});

	const rows = data?.items ?? [];
	const total = data?.total ?? 0;

	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<div className="flex flex-col">
			{/* Toolbar */}
			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e5e5] px-6 py-3">
				<div className="flex flex-wrap items-center gap-2">
					{/* Text search */}
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
							type="text"
							placeholder="Search customer or purchase #…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-52 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
						/>
					</div>

					{/* Status pills */}
					{STATUS_PILLS.map((p) => (
						<button
							key={p.value}
							type="button"
							data-testid={`installments-status-${p.value}`}
							onClick={() => onStatusChange(p.value)}
							className={cn(
								"h-9 rounded-xl px-3 text-[13px] font-medium transition",
								status === p.value
									? "bg-[#0a0a0a] text-white"
									: "border border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
							)}
						>
							{p.label}
						</button>
					))}

					{/* Branch filter */}
					<select
						value={branchId}
						onChange={(e) => onBranchChange(e.target.value)}
						data-testid="installments-branch-filter"
						className="h-9 w-44 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
					>
						<option value="">All Branches</option>
						{nodeOptions.map((n) => (
							<option key={n.id} value={n.id}>
								{n.name}
							</option>
						))}
					</select>
				</div>

				<Link
					to="/dashboard/packages/view"
					search={{ tab: "installments" }}
					className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					Manage Installments
				</Link>
			</div>

			{/* Body */}
			{isLoading ? (
				<PageLoader />
			) : rows.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
					<SearchX className="h-8 w-8 mb-3 opacity-30" />
					<p className="text-sm font-medium text-[#0a0a0a]">
						No upcoming installments
					</p>
					<p className="text-xs mt-1">
						{debouncedSearch || branchId
							? "No installments match your filters."
							: status === "due_soon"
								? "No installments are due in the next 14 days."
								: "No installments match this filter."}
					</p>
				</div>
			) : (
				<div className="overflow-auto">
					<table className="w-full" data-testid="sales-installments-table">
						<thead className="bg-[#f3f3f3]">
							<tr className="border-b border-[#e5e5e5]">
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Purchase #
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Customer
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Package
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Installment
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Due Date
								</th>
								<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Amount Due
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Status
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#e5e5e5]">
							{rows.map((row) => {
								const rowStatus = deriveRowStatus(row);
								const due = formatDueDate(row.dueDate);
								return (
									<tr
										key={row.id}
										className="transition-colors hover:bg-[#fafafa]"
									>
										<td className="px-4 py-3">
											<span className="font-mono tabular-nums text-[13px] font-medium text-[#0a0a0a]">
												{row.purchaseNumber ?? "—"}
											</span>
										</td>
										<td className="px-4 py-3">
											<span className="text-[13px] font-medium text-[#0a0a0a]">
												{row.clientName ?? "—"}
											</span>
										</td>
										<td className="px-4 py-3">
											<span className="text-sm text-[#0a0a0a]">
												{row.serviceName ?? "—"}
											</span>
										</td>
										<td className="px-4 py-3">
											<span className="font-mono tabular-nums text-sm text-[#0a0a0a]">
												#{row.installmentNumber} of {row.installmentsTotal}
											</span>
											<span className="ml-1.5 text-xs text-[#737373]">
												({row.installmentsPaid} paid)
											</span>
										</td>
										<td className="px-4 py-3">
											<div>
												<div className="text-sm text-[#0a0a0a]">{due.date}</div>
												<div className="font-mono tabular-nums text-[10px] text-[#737373]">
													{due.relative}
												</div>
											</div>
										</td>
										<td className="px-4 py-3 text-right">
											<span className="font-mono tabular-nums text-sm text-[#0a0a0a]">
												{formatPrice(row.amount + (row.taxAmount ?? 0), "MYR")}
											</span>
										</td>
										<td className="px-4 py-3">
											<span
												className={cn(
													"rounded-full px-2 py-0.5 text-[11px] font-semibold",
													rowStatus.className,
												)}
											>
												{rowStatus.label}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{total > rows.length && (
						<div className="border-t border-[#e5e5e5] px-6 py-3 text-xs text-[#737373]">
							Showing first {rows.length} of {total} — use{" "}
							<Link
								to="/dashboard/packages/view"
								search={{ tab: "installments" }}
								className="font-semibold text-[#0a0a0a] underline"
							>
								Manage Installments
							</Link>{" "}
							for the full list.
						</div>
					)}
				</div>
			)}
		</div>
	);
}
