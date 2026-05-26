import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { CalendarRange, ChevronDown, ChevronUp, Download, Plus, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { columns as salesColumns, type SalesRow } from "@/components/tables/sales/view/columns";
import SalesDataTable from "@/components/tables/sales/view/data-table";
import { buildColumns, type PaymentRow } from "@/components/tables/payment/view/columns";
import PaymentDataTable from "@/components/tables/payment/view/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RefundsTab } from "@/components/refunds/refunds-tab";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { toast } from "sonner";
import { getPeriodDates, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";

// ─── Route search schema ───────────────────────────────────────────────────────

const salesSearchSchema = z.object({
	from: z.string().default(""),
	to: z.string().default(""),
	status: z.string().default(""),
	branchId: z.string().default(""),
	period: z.string().optional(),
	kpiPeriod: z.enum(["today", "week", "month"]).default("month"),
	refundStatus: z.enum(["all", "none", "pending", "partial", "processed"]).default("all"),
	tab: z.enum(["sales", "payments", "cancelled", "refunds"]).default("sales"),
	search: z.string().default(""),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/view",
)({
	beforeLoad: async () => {
		await requirePermission("sales:read");
	},
	component: RouteComponent,
	validateSearch: salesSearchSchema,
});

// ─── KPI types from backend ────────────────────────────────────────────────────

interface KpiSummary {
	totalSalesCents: number;
	totalRefundedCents: number;
	outstandingCents: number;
	salesCount: number;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ErrorCard({ error, refetch }: { error: unknown; refetch: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-12">
			<p className="font-medium text-rose-600 text-lg">Failed to load data</p>
			<p className="mb-4 text-[#737373] text-sm">
				{error instanceof Error ? error.message : "An unexpected error occurred"}
			</p>
			<button
				type="button"
				onClick={refetch}
				className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
			>
				Try Again
			</button>
		</div>
	);
}

// ─── Cancelled Sales helpers ──────────────────────────────────────────────────────

type LineItem = {
	id: string;
	description: string;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	taxRateBps: number | null;
	taxRateCode: string | null;
};

type CancelledSaleRow = {
	id: string;
	cancellationNumber?: string | null;
	salesOrderId?: string | null;
	customerName?: string | null;
	customerType: string;
	cancellationDate?: string | Date | null;
	cancelledBy?: string | null;
	cancelledAmount?: number | null;
	cancellationReason?: string | null;
	cancellationReasonCategory?: string | null;
	lineItems: LineItem[];
	repeatOffenderCount: number;
};

const REASON_CATEGORIES = [
	{ value: "", label: "All reasons" },
	{ value: "customer_changed_mind", label: "Customer changed mind" },
	{ value: "payment_failed", label: "Payment failed" },
	{ value: "wrong_item", label: "Wrong item" },
	{ value: "fraud_suspected", label: "Fraud suspected" },
	{ value: "system_error", label: "System error" },
	{ value: "other", label: "Other" },
];

const REASON_CATEGORY_LABELS: Record<string, string> = {
	customer_changed_mind: "Customer changed mind",
	payment_failed: "Payment failed",
	wrong_item: "Wrong item",
	fraud_suspected: "Fraud suspected",
	system_error: "System error",
	other: "Other",
};

const REASON_BADGE_CLASSES: Record<string, string> = {
	customer_changed_mind: "bg-amber-50 text-amber-700 border border-amber-200",
	payment_failed: "bg-rose-50 text-rose-600 border border-rose-200",
	wrong_item: "bg-blue-50 text-blue-700 border border-blue-200",
	fraud_suspected: "bg-red-50 text-red-700 border border-red-200",
	system_error: "bg-purple-50 text-purple-700 border border-purple-200",
	other: "bg-slate-100 text-slate-500 border border-[#e5e5e5]",
};

function formatCategoryLabel(raw: string | null | undefined): string {
	if (!raw) return "—";
	return REASON_CATEGORY_LABELS[raw] ?? raw;
}

function formatCancellationTime(value: string | Date | null | undefined): { date: string; time: string } | null {
	if (!value) return null;
	const d = new Date(value);
	return {
		date: d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }),
		time: d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false }),
	};
}

function cancelledInitials(name: string | null | undefined): string {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function CancelledAvatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" }) {
	const cls =
		size === "sm"
			? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[10px] font-bold text-[#404040]"
			: "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[11px] font-bold text-[#404040]";
	return <div className={cls}>{cancelledInitials(name)}</div>;
}

function CustomerTypeBadge({ type }: { type: string }) {
	if (type === "member") {
		return (
			<span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
				Member
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
			Walk-in
		</span>
	);
}

function ReasonBadge({ category }: { category: string | null | undefined }) {
	if (!category) return <span className="text-[#737373]">—</span>;
	const cls = REASON_BADGE_CLASSES[category] ?? "bg-muted/40 text-muted-foreground border border-border/50";
	return (
		<span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
			{formatCategoryLabel(category)}
		</span>
	);
}

function RefundStatusBadge({ row }: { row: CancelledSaleRow }) {
	const category = row.cancellationReasonCategory;
	if (category === "fraud_suspected") {
		return (
			<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
				None
			</span>
		);
	}
	if ((row.cancelledAmount ?? 0) > 0) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
				Processed
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
			None
		</span>
	);
}

function LineItemsTable({ items }: { items: LineItem[] }) {
	if (items.length === 0) {
		return <p className="text-xs text-muted-foreground italic">No line items recorded.</p>;
	}
	return (
		<div className="space-y-1.5 text-sm">
			{items.map((item) => (
				<div key={item.id} className="flex justify-between">
					<span>
						{item.description}
						{item.quantity > 1 && (
							<span className="ml-1 text-muted-foreground text-xs">× {item.quantity}</span>
						)}
					</span>
					<span className="font-mono tabular-nums">{formatPrice(item.totalPrice, "MYR")}</span>
				</div>
			))}
			<div className="flex justify-between border-t border-border/40 pt-2 mt-2 text-sm font-semibold">
				<span>Total</span>
				<span className="font-mono tabular-nums">
					{formatPrice(
						items.reduce((s, i) => s + i.totalPrice, 0),
						"MYR",
					)}
				</span>
			</div>
		</div>
	);
}

function CancelledExpandedRow({ row }: { row: CancelledSaleRow }) {
	const ts = formatCancellationTime(row.cancellationDate);
	return (
		<tr className="bg-[#fafafa]">
			<td colSpan={9} className="px-10 py-5 border-t border-[#e5e5e5]">
				<div className="grid grid-cols-3 gap-6">
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Cancellation Context
						</p>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-[#737373]">Cancelled at</span>
								<span className="text-[#0a0a0a]">{ts ? `${ts.date}, ${ts.time}` : "—"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">By staff</span>
								<span className="text-[#0a0a0a]">{row.cancelledBy ?? "—"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">Category</span>
								<span className="text-[#0a0a0a]">{formatCategoryLabel(row.cancellationReasonCategory)}</span>
							</div>
							{row.cancellationReason && (
								<div className="flex justify-between gap-4">
									<span className="text-[#737373] shrink-0">Reason</span>
									<span className="text-right text-[#0a0a0a]">{row.cancellationReason}</span>
								</div>
							)}
							<div className="flex justify-between">
								<span className="text-[#737373]">Order</span>
								<span className="font-mono tabular-nums text-xs text-[#0a0a0a]">{row.salesOrderId ?? "—"}</span>
							</div>
						</div>
					</div>
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Original Sale Items
						</p>
						<LineItemsTable items={row.lineItems} />
					</div>
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Refund Details
						</p>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-[#737373]">Refunded</span>
								<span className="font-mono tabular-nums text-[#0a0a0a]">
									{formatPrice(row.cancelledAmount ?? 0, "MYR")}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">Status</span>
								<RefundStatusBadge row={row} />
							</div>
						</div>
					</div>
				</div>
			</td>
		</tr>
	);
}

// ─── Cancelled tab ────────────────────────────────────────────────────────────

interface CancelledSalesTabProps {
	organizationId: string;
	from: string;
	to: string;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
	onClearDates: () => void;
}

function CancelledSalesTab({ organizationId, from, to, onFromChange, onToChange, onClearDates }: CancelledSalesTabProps) {
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

// ─── Period selector ───────────────────────────────────────────────────────────

const KPI_PERIODS = [
	{ value: "today", label: "Today" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
] as const;

function PeriodSelector({
	value,
	onChange,
}: {
	value: "today" | "week" | "month";
	onChange: (v: "today" | "week" | "month") => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{KPI_PERIODS.map((p) => (
				<button
					key={p.value}
					type="button"
					onClick={() => onChange(p.value)}
					className={cn(
						"rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
						value === p.value
							? "bg-[#0a0a0a] text-white font-semibold"
							: "border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]",
					)}
				>
					{p.label}
				</button>
			))}
		</div>
	);
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip({
	kpiSummary,
	kpiLoading,
	kpiPeriod,
	onPeriodChange,
}: {
	kpiSummary: KpiSummary | undefined;
	kpiLoading: boolean;
	kpiPeriod: "today" | "week" | "month";
	onPeriodChange: (v: "today" | "week" | "month") => void;
}) {
	const netCollectedCents =
		kpiSummary != null
			? kpiSummary.totalSalesCents - kpiSummary.totalRefundedCents
			: null;

	const tiles = [
		{
			label: kpiPeriod === "today" ? "Today's Revenue" : kpiPeriod === "week" ? "Week's Revenue" : "Month's Revenue",
			value: kpiSummary ? formatPrice(kpiSummary.totalSalesCents, "MYR") : null,
			sub: kpiSummary ? `${kpiSummary.salesCount} transactions` : null,
			accent: false as const,
		},
		{
			label: "Outstanding",
			value: kpiSummary ? formatPrice(kpiSummary.outstandingCents, "MYR") : null,
			sub: kpiSummary && kpiSummary.outstandingCents > 0 ? "partial / overdue" : "all clear",
			accent: kpiSummary != null && kpiSummary.outstandingCents > 0 ? ("red" as const) : (false as const),
		},
		{
			label: "Refunded",
			value: kpiSummary ? formatPrice(kpiSummary.totalRefundedCents, "MYR") : null,
			sub: null,
			accent: false as const,
		},
		{
			label: "Net Collected",
			value: netCollectedCents != null ? formatPrice(netCollectedCents, "MYR") : null,
			sub: "After refunds",
			accent: false as const,
		},
	];

	return (
		<div className="shrink-0 border-b border-[#e5e5e5] bg-white px-6 py-4" data-testid="sales-kpi-strip">
			<div className="mb-3 flex items-center justify-between">
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">Overview</p>
				<PeriodSelector value={kpiPeriod} onChange={onPeriodChange} />
			</div>
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{tiles.map((tile) => (
					<div
						key={tile.label}
						className={cn(
							"rounded-2xl border border-[#e5e5e5] bg-white p-4",
							tile.accent === "red" && "border-rose-200 bg-rose-50",
						)}
					>
						{kpiLoading ? (
							<div>
								<div className="h-3 w-24 animate-pulse rounded bg-[#e5e5e5]" />
								<div className="mt-3 h-6 w-28 animate-pulse rounded bg-[#e5e5e5]" />
								<div className="mt-2 h-3 w-20 animate-pulse rounded bg-[#e5e5e5]" />
							</div>
						) : (
							<>
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">{tile.label}</p>
								<p
									className={cn(
										"mt-1 font-mono tabular-nums text-2xl font-bold text-[#0a0a0a]",
										tile.accent === "red" && "text-rose-600",
									)}
								>
									{tile.value ?? "—"}
								</p>
								{tile.sub && (
									<p className="mt-1 text-xs text-[#737373]">{tile.sub}</p>
								)}
							</>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Status filter pills ──────────────────────────────────────────────────────

const STATUS_PILLS = [
	{ value: "", label: "All Status", dot: "bg-[#0a0a0a]" },
	{ value: "completed", label: "Paid", dot: "bg-blue-700" },
	{ value: "confirmed", label: "Partial", dot: "bg-amber-700" },
	{ value: "overdue", label: "Overdue", dot: "bg-red-700" },
	{ value: "cancelled", label: "Cancelled", dot: "bg-[#737373]" },
] as const;

function FilterBar({
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
			<Select value={branchId || "all"} onValueChange={(v) => onBranchChange(v === "all" ? "" : v)}>
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

// ─── Sales tab ────────────────────────────────────────────────────────────────

interface SalesTabProps {
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

function SalesTab({
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

// ─── Payments tab ─────────────────────────────────────────────────────────────

interface PaymentsTabProps {
	data: PaymentRow[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
	onSelectPayment: (paymentId: string) => void;
}

function PaymentsTab({ data, isLoading, isError, error, refetch, onSelectPayment }: PaymentsTabProps) {
	const columns = useMemo(() => buildColumns(), []);

	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<Skeleton name="sales-view" loading={isLoading} fallback={<PageLoader />}>
			<PaymentDataTable<PaymentRow, unknown>
				columns={columns}
				data={data}
				emptyTitle="No payments found"
			/>
		</Skeleton>
	);
}

// ─── Route component ───────────────────────────────────────────────────────────

function RouteComponent() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === userContext.currentOrganizationId,
	);
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const branchNodes = allNodes.filter((n) => n.type === "branch");
	const nodeOptions = branchNodes.length > 0 ? branchNodes : allNodes;

	const { from, to, status, branchId, period, kpiPeriod, refundStatus, tab, search } =
		Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	// Derive date filters from legacy `period` param (from Dashboard KPI card)
	const derivedFilters =
		period && !from && !to
			? getPeriodDates(period as Period)
			: { from, to };

	// ── Handlers ────────────────────────────────────────────────────────────

	function handleFilterChange(updates: Partial<z.infer<typeof salesSearchSchema>>) {
		navigate({ search: (prev) => ({ ...prev, ...updates }) });
	}

	function handleClear() {
		navigate({
			search: {
				from: "",
				to: "",
				status: "",
				branchId: "",
				period: undefined,
				kpiPeriod,
				refundStatus: "all",
				tab,
				search: "",
			},
		});
	}

	function handleKpiPeriodChange(v: "today" | "week" | "month") {
		navigate({ search: (prev) => ({ ...prev, kpiPeriod: v }) });
	}

	function handleTabChange(v: string) {
		navigate({ search: (prev) => ({ ...prev, tab: v as "sales" | "payments" | "cancelled" | "refunds" }) });
	}

	function handleRefundStatusChange(v: "all" | "none" | "pending" | "partial" | "processed") {
		navigate({ search: (prev) => ({ ...prev, refundStatus: v }) });
	}

	// ── Queries ─────────────────────────────────────────────────────────────

	const {
		data: salesInfiniteData,
		isLoading: salesLoading,
		isError: salesError,
		error: salesErrorObj,
		refetch: salesRefetch,
		fetchNextPage: salesFetchNextPage,
		hasNextPage: salesHasNextPage,
		isFetchingNextPage: salesIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: [
			"salesOrders",
			organizationId,
			derivedFilters.from,
			derivedFilters.to,
			status,
			branchId,
			refundStatus,
			search,
		],
		queryFn: ({ pageParam }) =>
			client.salesOrders.list({
				organizationId: organizationId!,
				from: derivedFilters.from ? `${derivedFilters.from}T00:00:00.000Z` : undefined,
				to: derivedFilters.to ? `${derivedFilters.to}T23:59:59.999Z` : undefined,
				status: (["draft", "confirmed", "completed", "cancelled"].includes(status)
					? status
					: undefined) as "draft" | "confirmed" | "completed" | "cancelled" | undefined,
				refundStatus:
					refundStatus !== "all"
						? (refundStatus as "none" | "pending" | "partial" | "processed")
						: undefined,
				branchId: branchId || undefined,
				limit: 50,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0);
			return loaded < lastPage.total ? loaded : undefined;
		},
		enabled: !!organizationId,
	});

	const {
		data: invoicesApiData = [],
		isLoading: invoicesLoading,
		isError: invoicesError,
		error: invoicesErrorObj,
		refetch: invoicesRefetch,
	} = useQuery({
		queryKey: ["invoices", organizationId],
		queryFn: () => client.invoices.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const {
		data: kpiData,
		isLoading: kpiLoading,
		isError: kpiIsError,
	} = useQuery<KpiSummary>({
		queryKey: ["salesOrders", "kpiSummary", organizationId, kpiPeriod],
		queryFn: async () => {
			return client.salesOrders.kpiSummary({
				organizationId: organizationId!,
				period: kpiPeriod,
			}) as unknown as Promise<KpiSummary>;
		},
		enabled: !!organizationId,
		retry: false,
	});

	if (kpiIsError) {
		console.warn(
			"[sales/view] salesOrders.kpiSummary unavailable — KPI strip will show blanks.",
		);
	}

	// ── Data mapping ─────────────────────────────────────────────────────────

	const salesApiRows = salesInfiniteData?.pages.flatMap((p) => p.rows) ?? [];
	const total = salesInfiniteData?.pages[0]?.total ?? 0;

	const nodeNameMap = new Map(allNodes.map((n) => [n.id, n.name]));

	const salesData: SalesRow[] = salesApiRows.map((item) => {
		const row = item as typeof item & { createdByName?: string | null; firstItemDescription?: string | null };
		return {
			id: item.id,
			date: item.date ? item.date.toISOString() : null,
			sales_order: item.salesOrderNumber,
			total_sales: item.totalAmount,
			customer_name: item.customerName,
			service_name: row.firstItemDescription ?? null,
			branch_name: nodeNameMap.get(item.branchId) ?? null,
			created_by: row.createdByName ?? item.createdBy,
			status: item.status,
			refund_status: item.refundStatus ?? null,
			customerId: item.customerId ?? null,
		};
	});

	const paymentsData: PaymentRow[] = invoicesApiData.map((item) => {
		const row = item as typeof item & { createdByName?: string | null };
		return {
			date: item.date ? item.date.toISOString() : null,
			invoice: item.invoiceNumber,
			sales_order: item.salesOrderId ?? null,
			payment_id: item.paymentId ?? null,
			mode: item.paymentMode ?? null,
			total_paid: item.totalAmount,
			customer_name: item.customerName,
			created_by: row.createdByName ?? item.createdBy,
			e_invoice_status: item.eInvoiceStatus ?? null,
		};
	});

	const salesCount = salesLoading ? null : total;
	const paymentsCount = invoicesLoading ? null : paymentsData.length;

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Sales</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Orders</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
					>
						<Download className="h-3.5 w-3.5" />
						Export CSV
					</button>
					<div className="mx-1 h-6 w-px bg-[#e5e5e5]" />
					<Link to="/dashboard/sales/create">
						<button
							type="button"
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
						>
							<Plus className="h-3.5 w-3.5" />
							New Sale
						</button>
					</Link>
				</div>
			</header>
			<div className="flex flex-col gap-5 px-6 py-6">

			{/* ── Main card ───────────────────────────────────────────────────── */}
			<div className="border border-[#e5e5e5] bg-white flex flex-col">

			{/* ── KPI strip — always visible ──────────────────────────────────── */}
			<KpiStrip
				kpiSummary={kpiIsError ? undefined : kpiData}
				kpiLoading={kpiLoading}
				kpiPeriod={kpiPeriod}
				onPeriodChange={handleKpiPeriodChange}
			/>

			{/* ── Pill tabs ────────────────────────────────────────────────────── */}
			{organizationId ? (
				<>
					<div className="flex shrink-0 items-center gap-2 border-b border-[#e5e5e5] px-6 py-3">
						{[
							{ value: "sales", label: "Sales Orders", count: salesCount },
							{ value: "payments", label: "Payments", count: paymentsCount },
							{ value: "cancelled", label: "Cancelled", count: null },
							...(hasPermission("refund_management:read")
								? [{ value: "refunds", label: "Refunds", count: null }]
								: []),
						].map((t) => (
							<button
								key={t.value}
								type="button"
								onClick={() => handleTabChange(t.value)}
								className={cn(
									"rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
									tab === t.value
										? "bg-[#0a0a0a] text-white font-semibold"
										: "border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] font-medium",
								)}
							>
								{t.label}
								{t.count !== null && (
									<span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
										tab === t.value ? "bg-white/20" : "bg-[#f3f3f3] text-[#737373]"
									)}>
										{t.count}
									</span>
								)}
							</button>
						))}
					</div>

					{tab === "sales" && (
						<SalesTab
							data={salesData}
							total={total}
							hasNextPage={salesHasNextPage ?? false}
							isFetchingNextPage={salesIsFetchingNextPage}
							onLoadMore={salesFetchNextPage}
							isLoading={salesLoading}
							isError={salesError}
							error={salesErrorObj}
							refetch={salesRefetch}
							search={search}
							from={derivedFilters.from}
							to={derivedFilters.to}
							status={status}
							branchId={branchId}
							refundStatus={refundStatus}
							onSearchChange={(v) => handleFilterChange({ search: v })}
							onFromChange={(v) => handleFilterChange({ from: v })}
							onToChange={(v) => handleFilterChange({ to: v })}
							onStatusChange={(v) => handleFilterChange({ status: v })}
							onBranchChange={(v) => handleFilterChange({ branchId: v })}
							onRefundStatusChange={handleRefundStatusChange}
							onClear={handleClear}
							nodeOptions={nodeOptions}
						/>
					)}
					{tab === "payments" && (
						<PaymentsTab
							data={paymentsData}
							isLoading={invoicesLoading}
							isError={invoicesError}
							error={invoicesErrorObj}
							refetch={invoicesRefetch}
							onSelectPayment={(id) => {
								// No-op: history dialog lives in payment/view.tsx; sales page is list-only
								console.info("[sales/payments] payment selected:", id);
							}}
						/>
					)}
					{tab === "cancelled" && organizationId && (
						<CancelledSalesTab
							organizationId={organizationId}
							from={derivedFilters.from}
							to={derivedFilters.to}
							onFromChange={(v) => handleFilterChange({ from: v })}
							onToChange={(v) => handleFilterChange({ to: v })}
							onClearDates={() => handleFilterChange({ from: "", to: "" })}
						/>
					)}
					{tab === "refunds" && organizationId && hasPermission("refund_management:read") && (
						<RefundsTab organizationId={organizationId} />
					)}
				</>
			) : (
				<PageLoader />
			)}
			</div>
		</div>
		</div>
	);
}
