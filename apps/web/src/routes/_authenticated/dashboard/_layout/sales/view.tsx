import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { Download, Plus } from "lucide-react";
import { useMemo } from "react";
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
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { getPeriodDates, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";

// ─── Route search schema ───────────────────────────────────────────────────────

const salesSearchSchema = z.object({
	from: z.string().default(""),
	to: z.string().default(""),
	status: z.string().default(""),
	branchId: z.string().default(""),
	page: z.number().int().min(1).default(1),
	period: z.string().optional(),
	kpiPeriod: z.enum(["today", "week", "month"]).default("month"),
	refundStatus: z.enum(["all", "none", "pending", "partial", "processed"]).default("all"),
	tab: z.enum(["sales", "payments"]).default("sales"),
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
	{ value: "cancelled", label: "Refunded", dot: "bg-[#737373]" },
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
	page: number;
	onPageChange: (page: number) => void;
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
	page,
	onPageChange,
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
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
			<div className="min-h-0 flex-1 overflow-hidden">
				{isLoading ? (
					<PageLoader />
				) : (
					<SalesDataTable<SalesRow, unknown>
						columns={salesColumns}
						data={data}
						total={total}
						page={page}
						onPageChange={onPageChange}
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
	const columns = useMemo(() => buildColumns(onSelectPayment), [onSelectPayment]);

	if (isLoading) return <PageLoader />;
	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<div className="h-full overflow-hidden">
			<PaymentDataTable<PaymentRow, unknown>
				columns={columns}
				data={data}
				emptyTitle="No payments found"
			/>
		</div>
	);
}

// ─── Route component ───────────────────────────────────────────────────────────

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === userContext.currentOrganizationId,
	);
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const branchNodes = allNodes.filter((n) => n.type === "branch");
	const nodeOptions = branchNodes.length > 0 ? branchNodes : allNodes;

	const { from, to, status, branchId, page, period, kpiPeriod, refundStatus, tab, search } =
		Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	// Derive date filters from legacy `period` param (from Dashboard KPI card)
	const derivedFilters =
		period && !from && !to
			? getPeriodDates(period as Period)
			: { from, to };

	// ── Handlers ────────────────────────────────────────────────────────────

	function handleFilterChange(updates: Partial<z.infer<typeof salesSearchSchema>>) {
		navigate({ search: (prev) => ({ ...prev, ...updates, page: 1 }) });
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
				page: 1,
				search: "",
			},
		});
	}

	function handlePageChange(newPage: number) {
		navigate({ search: (prev) => ({ ...prev, page: newPage }) });
	}

	function handleKpiPeriodChange(v: "today" | "week" | "month") {
		navigate({ search: (prev) => ({ ...prev, kpiPeriod: v }) });
	}

	function handleTabChange(v: string) {
		navigate({ search: (prev) => ({ ...prev, tab: v as "sales" | "payments" }) });
	}

	function handleRefundStatusChange(v: "all" | "none" | "pending" | "partial" | "processed") {
		navigate({ search: (prev) => ({ ...prev, refundStatus: v, page: 1 }) });
	}

	// ── Queries ─────────────────────────────────────────────────────────────

	const {
		data: salesApiResponse,
		isLoading: salesLoading,
		isError: salesError,
		error: salesErrorObj,
		refetch: salesRefetch,
	} = useQuery({
		queryKey: [
			"salesOrders",
			organizationId,
			derivedFilters.from,
			derivedFilters.to,
			status,
			branchId,
			refundStatus,
			page,
		],
		queryFn: () =>
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
				offset: (page - 1) * 50,
			}),
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

	const salesApiRows = salesApiResponse?.rows ?? [];
	const total = salesApiResponse?.total ?? 0;

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
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col gap-5">
			{/* ── Page header ─────────────────────────────────────────────────── */}
			<div className="flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						SALES &amp; PAYMENTS
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Sales &amp; Payments
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						{salesCount !== null ? `${salesCount} orders` : "All sales orders and payment status across branches."}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
					>
						<Download className="h-4 w-4" />
						Export CSV
					</button>
					<Link to="/dashboard/sales/create">
						<button
							type="button"
							className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
						>
							<Plus className="h-4 w-4" />
							New Sale
						</button>
					</Link>
				</div>
			</div>

			{/* ── Main card ───────────────────────────────────────────────────── */}
			<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden flex flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>

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
							page={page}
							onPageChange={handlePageChange}
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
				</>
			) : (
				<PageLoader />
			)}
			</div>
		</div>
	);
}
