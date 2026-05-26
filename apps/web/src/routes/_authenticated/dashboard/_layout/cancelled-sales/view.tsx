import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { CalendarRange, ChevronDown, ChevronUp, Download, SearchX } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import { toast } from "sonner";

// ─── Route ───────────────────────────────────────────────────────────────────

const searchSchema = z.object({
	from: z.string().default(""),
	to: z.string().default(""),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/cancelled-sales/view",
)({
	beforeLoad: async () => {
		await requirePermission("sales:read");
	},
	component: RouteComponent,
	validateSearch: searchSchema,
});

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Reason badge colours mapping to design tokens
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

// ─── Avatar ───────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined): string {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" }) {
	const cls =
		size === "sm"
			? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[10px] font-bold text-[#404040]"
			: "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[11px] font-bold text-[#404040]";
	return <div className={cls}>{initials(name)}</div>;
}

// ─── CustomerType Badge ───────────────────────────────────────────────────────

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

// ─── Reason Badge ─────────────────────────────────────────────────────────────

function ReasonBadge({ category }: { category: string | null | undefined }) {
	if (!category) return <span className="text-[#737373]">—</span>;
	const cls = REASON_BADGE_CLASSES[category] ?? "bg-muted/40 text-muted-foreground border border-border/50";
	return (
		<span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
			{formatCategoryLabel(category)}
		</span>
	);
}

// ─── Refund Status Badge ──────────────────────────────────────────────────────
// V1 shows a Refund Status column. We derive a synthetic status from available data:
// If cancelledAmount > 0 we assume "Processed"; this column is a best-effort display.
// The API does not currently return a refundStatus field — hidden-function flag noted below.

function RefundStatusBadge({ row }: { row: CancelledSaleRow }) {
	// Heuristic: fraud_suspected → None; otherwise assume Processed when amount > 0
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

// ─── Line Items Sub-table ─────────────────────────────────────────────────────

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

// ─── Expanded Row ─────────────────────────────────────────────────────────────

function ExpandedRow({ row }: { row: CancelledSaleRow }) {
	const ts = formatCancellationTime(row.cancellationDate);
	return (
		<tr className="bg-[#fafafa]">
			<td colSpan={9} className="px-10 py-5 border-t border-[#e5e5e5]">
				<div className="grid grid-cols-3 gap-6">
					{/* Column 1 — Cancellation context */}
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

					{/* Column 2 — Original sale items */}
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Original Sale Items
						</p>
						<LineItemsTable items={row.lineItems} />
					</div>

					{/* Column 3 — Refund details */}
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

// ─── Route component ──────────────────────────────────────────────────────────

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { from, to } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Client-side search (sale ID / customer / staff)
	const [textSearch, setTextSearch] = useState("");
	// Client-side reason category filter
	const [reasonFilter, setReasonFilter] = useState("");
	// Date range picker visibility
	const [showDateRange, setShowDateRange] = useState(!!(from || to));
	// Row expansion state
	const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
	// CSV export loading
	const [exporting, setExporting] = useState(false);

	function handleFromChange(v: string) {
		navigate({ search: (prev) => ({ ...prev, from: v }) });
	}
	function handleToChange(v: string) {
		navigate({ search: (prev) => ({ ...prev, to: v }) });
	}
	function handleClearDates() {
		navigate({ search: { from: "", to: "" } });
		setShowDateRange(false);
	}

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["cancelledSales", organizationId, from, to],
		queryFn: () =>
			client.cancelledSales.list({
				organizationId: organizationId!,
				from: from ? `${from}T00:00:00.000Z` : undefined,
				to: to ? `${to}T23:59:59.999Z` : undefined,
			}),
		enabled: !!organizationId,
	});

	const allRows = (Array.isArray(data) ? data : (data?.rows ?? [])) as CancelledSaleRow[];

	// Client-side filtering
	const rows = allRows.filter((r) => {
		const matchesText =
			!textSearch ||
			(r.salesOrderId ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.cancellationNumber ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.customerName ?? "").toLowerCase().includes(textSearch.toLowerCase()) ||
			(r.cancelledBy ?? "").toLowerCase().includes(textSearch.toLowerCase());
		const matchesReason =
			!reasonFilter || r.cancellationReasonCategory === reasonFilter;
		return matchesText && matchesReason;
	});

	// Summary stats
	const totalVoided = allRows.reduce((s, r) => s + (r.cancelledAmount ?? 0), 0);
	const isFiltered = !!textSearch || !!reasonFilter;

	// ── CSV Export ────────────────────────────────────────────────────────

	async function handleExportCsv() {
		if (!organizationId) return;
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

	// ── Render ────────────────────────────────────────────────────────────

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Sales</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Cancelled</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
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
			</header>
			<div className="flex flex-col gap-5 px-6 py-6">

			{/* ── Table card ── */}
			<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden flex flex-col">
				{/* Toolbar */}
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e5e5] px-6 py-3">
					{/* Left controls */}
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

						{/* Reason category dropdown */}
						<select
							value={reasonFilter}
							onChange={(e) => setReasonFilter(e.target.value)}
							className="h-9 w-44 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
						>
							{REASON_CATEGORIES.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>

						{/* Refund state dropdown — display only; API does not yet expose refundStatus */}
						{/* STUB: wire to real refundStatus filter once API exposes it */}
						<select
							className="h-9 w-40 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#737373] focus:outline-none cursor-not-allowed opacity-50"
							disabled
						>
							<option>All refund states</option>
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

						{/* Inline date inputs */}
						{showDateRange && (
							<div className="flex items-center gap-2">
								<input
									type="date"
									value={from}
									onChange={(e) => handleFromChange(e.target.value)}
									className="h-9 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
								/>
								<span className="text-sm text-[#737373]">–</span>
								<input
									type="date"
									value={to}
									onChange={(e) => handleToChange(e.target.value)}
									className="h-9 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none"
								/>
								{(from || to) && (
									<button type="button" className="text-xs text-[#737373] hover:text-[#0a0a0a]" onClick={handleClearDates}>
										Clear
									</button>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Body */}
				{!organizationId || isLoading ? (
					<PageLoader />
				) : isError ? (
					<div className="p-6">
						<StatusCallout variant="error" onRetry={() => refetch()}>
							{error instanceof Error ? error.message : "Failed to load cancelled sales."}
						</StatusCallout>
					</div>
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
												]
													.filter(Boolean)
													.join(" ")}
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
														<Avatar name={row.customerName} size="md" />
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
															<Avatar name={row.cancelledBy} size="sm" />
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

												{/* Refunded — same as amount for now; API does not expose separate refundedAmount */}
												{/* STUB: wire to real refundedAmount once API exposes it */}
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

											{isExpanded && <ExpandedRow key={`${row.id}-expanded`} row={row} />}
										</>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
		</div>
	);
}
