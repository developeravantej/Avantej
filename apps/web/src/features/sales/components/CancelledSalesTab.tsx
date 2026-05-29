import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronDown, ChevronUp, Download, SearchX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { REASON_CATEGORIES, formatCancellationTime } from "@/features/sales/sales-view.constants";
import type { CancelledSaleRow } from "@/features/sales/sales-view.types";
import { ErrorCard } from "@/features/sales/components/ErrorCard";
import { CancelledExpandedRow } from "@/features/sales/components/CancelledExpandedRow";
import {
	CancelledAvatar,
	CustomerTypeBadge,
	ReasonBadge,
	RefundStatusBadge,
} from "@/features/sales/components/SalesBadges";

export interface CancelledSalesTabProps {
	organizationId: string;
	from: string;
	to: string;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
	onClearDates: () => void;
}

export function CancelledSalesTab({ organizationId, from, to, onFromChange, onToChange, onClearDates }: CancelledSalesTabProps) {
	const [textSearch, setTextSearch] = useState("");
	const [reasonFilter, setReasonFilter] = useState("");
	const [showDateRange, setShowDateRange] = useState(!!(from || to));
	const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["cancelledSales", organizationId, from, to],
		queryFn: () =>
			client.cancelledSales.list({
				organizationId,
				from: from ? `${from}T00:00:00.000Z` : undefined,
				to: to ? `${to}T23:59:59.999Z` : undefined,
			}),
		enabled: !!organizationId,
	});

	const allRows = (Array.isArray(data) ? data : (data?.rows ?? [])) as CancelledSaleRow[];

	const rows = allRows.filter((r) => {
		const matchesText =
			!textSearch ||
			(r.salesOrderId ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.cancellationNumber ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.customerName ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.cancelledBy ?? "").toLowerCase().includes(textSearch.toLowerCase());
		const matchesReason = !reasonFilter || r.cancellationReasonCategory === reasonFilter;
		return matchesText && matchesReason;
	});

	const isFiltered = !!textSearch || !!reasonFilter;

	async function handleExportCsv() {
		setExporting(true);
		try {
			const result = await client.cancelledSales.exportCsv({
				organizationId,
				from: from ? `${from}T00:00:00.000Z` : undefined,
				to: to ? `${to}T23:59:59.999Z` : undefined,
			});
			const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `cancelled-sales-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			if (result.truncated) {
				toast.warning(
					`Export truncated — ${result.totalMatching} total matches. Narrow your date range for a complete export.`,
				);
			} else {
				toast.success("CSV exported successfully.");
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Export failed. Please try again.");
		} finally {
			setExporting(false);
		}
	}

	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<div className="flex flex-col">
			{/* Toolbar */}
			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e5e5] px-6 py-3">
				<div className="flex flex-wrap items-center gap-2">
					{/* Text search */}
					<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
						<svg className="text-[#737373] flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.35-4.35" />
						</svg>
						<input
							type="text"
							placeholder="Search sale ID, customer, staff…"
							value={textSearch}
							onChange={(e) => setTextSearch(e.target.value)}
							className="w-52 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
						/>
					</div>

					{/* Reason category */}
					<select
						value={reasonFilter}
						onChange={(e) => setReasonFilter(e.target.value)}
						className="h-9 w-44 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
					>
						{REASON_CATEGORIES.map((r) => (
							<option key={r.value} value={r.value}>{r.label}</option>
						))}
					</select>

					{/* Date range toggle */}
					<button
						type="button"
						className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#e5e5e5] bg-white text-[13px] font-medium text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] transition"
						onClick={() => setShowDateRange((v) => !v)}
					>
						<CalendarRange className="h-3.5 w-3.5" />
						Date range
						{(from || to) && (
							<span className="ml-1 rounded-full bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-bold text-white">
								Active
							</span>
						)}
					</button>

					{showDateRange && (
						<div className="flex items-center gap-2">
							<input
								type="date"
								value={from}
								onChange={(e) => onFromChange(e.target.value)}
								className="h-9 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
							/>
							<span className="text-sm text-[#737373]">–</span>
							<input
								type="date"
								value={to}
								onChange={(e) => onToChange(e.target.value)}
								className="h-9 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
							/>
							{(from || to) && (
								<button type="button" className="text-xs text-[#737373] hover:text-[#0a0a0a]" onClick={onClearDates}>
									Clear
								</button>
							)}
						</div>
					)}
				</div>

				<button
					type="button"
					onClick={handleExportCsv}
					disabled={exporting || allRows.length === 0}
					className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3] disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Download className="h-3.5 w-3.5" />
					{exporting ? "Exporting…" : "Export CSV"}
				</button>
			</div>

			{/* Body */}
			{isLoading ? (
				<PageLoader />
			) : rows.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
					<SearchX className="h-8 w-8 mb-3 opacity-30" />
					<p className="text-sm font-medium text-[#0a0a0a]">No cancelled sales</p>
					<p className="text-xs mt-1">
						{isFiltered
							? "No cancelled sales match your filters. Try clearing filters."
							: "Cancelled orders will appear here."}
					</p>
				</div>
			) : (
				<div className="overflow-auto">
					<table className="w-full" data-testid="cancelled-sales-table">
						<thead className="bg-[#f3f3f3]">
							<tr className="border-b border-[#e5e5e5]">
								<th className="w-10 px-4 py-3" />
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Sale ID</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Customer</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Cancelled At</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Cancelled By</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Reason</th>
								<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">Orig. Amount</th>
								<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">Refunded</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Refund Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#e5e5e5]">
							{rows.map((row) => {
								const isExpanded = expandedRowId === row.id;
								const isRepeatOffender = row.repeatOffenderCount >= 3;
								const isFraud = row.cancellationReasonCategory === "fraud_suspected";
								const ts = formatCancellationTime(row.cancellationDate);

								return (
									<>
										<tr
											key={row.id}
											onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
											className={[
												"cursor-pointer transition-colors hover:bg-[#fafafa]",
												isFraud ? "border-l-[3px] border-l-rose-500 bg-rose-50/30" : "",
											].filter(Boolean).join(" ")}
										>
											<td className="w-10 px-4 py-3 text-center text-[#737373]">
												{isExpanded ? (
													<ChevronUp className="mx-auto h-3.5 w-3.5" />
												) : (
													<ChevronDown className="mx-auto h-3.5 w-3.5" />
												)}
											</td>
											<td className="px-4 py-3">
												<span className="font-mono tabular-nums text-[13px] font-medium text-[#0a0a0a]">
													{row.cancellationNumber ?? row.salesOrderId ?? "—"}
												</span>
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<CancelledAvatar name={row.customerName} size="md" />
													<div>
														<div className="text-[13px] font-medium leading-tight text-[#0a0a0a]">
															{row.customerName ?? "—"}
														</div>
														<div className="mt-0.5 flex items-center gap-1.5">
															<CustomerTypeBadge type={row.customerType} />
															{isRepeatOffender && (
																<span className="text-rose-600 text-xs font-semibold">
																	· {row.repeatOffenderCount}rd cancel this month
																</span>
															)}
														</div>
													</div>
												</div>
											</td>
											<td className="px-4 py-3">
												{ts ? (
													<div>
														<div className="text-sm text-[#0a0a0a]">{ts.date}</div>
														<div className="font-mono tabular-nums text-[10px] text-[#737373]">{ts.time}</div>
													</div>
												) : (
													<span className="font-mono tabular-nums text-[#737373]">—</span>
												)}
											</td>
											<td className="px-4 py-3">
												{row.cancelledBy ? (
													<div className="flex items-center gap-1.5">
														<CancelledAvatar name={row.cancelledBy} size="sm" />
														<span className="text-sm text-[#0a0a0a]">{row.cancelledBy}</span>
													</div>
												) : (
													<span className="font-mono tabular-nums text-[#737373]">—</span>
												)}
											</td>
											<td className="px-4 py-3">
												<ReasonBadge category={row.cancellationReasonCategory} />
											</td>
											<td className="px-4 py-3 text-right">
												<span className="font-mono tabular-nums text-sm text-[#0a0a0a]">
													{formatPrice(row.cancelledAmount ?? 0, "MYR")}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												{isFraud ? (
													<span className="font-mono tabular-nums text-sm text-[#737373]">—</span>
												) : (
													<span className="font-mono tabular-nums text-sm text-[#0a0a0a]">
														{formatPrice(row.cancelledAmount ?? 0, "MYR")}
													</span>
												)}
											</td>
											<td className="px-4 py-3">
												<RefundStatusBadge row={row} />
											</td>
										</tr>
										{isExpanded && <CancelledExpandedRow key={`${row.id}-expanded`} row={row} />}
									</>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
