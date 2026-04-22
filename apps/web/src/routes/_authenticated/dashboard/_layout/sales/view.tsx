import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Plus, ShoppingCart, TrendingUp, XCircle } from "lucide-react";
import { z } from "zod";
import { columns as salesColumns, type SalesRow } from "@/components/tables/sales/view/columns";
import SalesDataTable from "@/components/tables/sales/view/data-table";
import { FilterToolbar } from "@/components/tables/sales/view/filter-toolbar";
import { columns as paymentColumns, type PaymentRow } from "@/components/tables/payment/view/columns";
import PaymentDataTable from "@/components/tables/payment/view/data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { getPeriodDates, type Period } from "@/lib/period";
import { client } from "@/utils/orpc";

// ─── Route search schema ───────────────────────────────────────────────────────

const salesSearchSchema = z.object({
	from: z.string().default(""),
	to: z.string().default(""),
	status: z.string().default(""),
	branchId: z.string().default(""),
	page: z.number().int().min(1).default(1),
	period: z.string().optional(),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/view",
)({
	component: RouteComponent,
	validateSearch: salesSearchSchema,
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function LoadingSpinner() {
	return (
		<div className="flex min-h-96 items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
				<span className="sr-only">Loading...</span>
			</div>
		</div>
	);
}

function ErrorCard({ error, refetch }: { error: unknown; refetch: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-12">
			<p className="font-medium text-destructive text-lg">Failed to load data</p>
			<p className="mb-4 text-muted-foreground text-sm">
				{error instanceof Error ? error.message : "An unexpected error occurred"}
			</p>
			<Button variant="outline" onClick={refetch}>
				Try Again
			</Button>
		</div>
	);
}

interface SalesTabProps {
	data: SalesRow[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
	// Filter props
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

function SalesTab({
	data,
	total,
	page,
	onPageChange,
	isLoading,
	isError,
	error,
	refetch,
	from,
	to,
	status,
	branchId,
	onFromChange,
	onToChange,
	onStatusChange,
	onBranchChange,
	onClear,
}: SalesTabProps) {
	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	const totalRevenue = data
		.filter((row) => row.status !== "cancelled")
		.reduce((sum, row) => sum + (row.total_sales ?? 0), 0);
	const completedCount = data.filter((row) => row.status === "completed").length;
	const cancelledCount = data.filter((row) => row.status === "cancelled").length;

	return (
		<div className="flex h-full flex-col">
			{/* Stats cards */}
			<div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border/40 px-6 py-4 lg:grid-cols-4">
				<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Orders</p>
						<p className="mt-1 text-2xl font-bold">{isLoading ? "—" : total}</p>
					</div>
					<div className="rounded-lg bg-muted p-2">
						<ShoppingCart className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Revenue</p>
						<p className="mt-1 text-xl font-bold">{formatPrice(totalRevenue, "MYR")}</p>
					</div>
					<div className="rounded-lg bg-muted p-2">
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
						<p className="mt-1 text-2xl font-bold">{completedCount}</p>
					</div>
					<div className="rounded-lg bg-muted p-2">
						<CheckCircle2 className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cancelled</p>
						<p className="mt-1 text-2xl font-bold">{cancelledCount}</p>
					</div>
					<div className="rounded-lg bg-muted p-2">
						<XCircle className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
			</div>

			{/* Filter toolbar */}
			<FilterToolbar
				from={from}
				to={to}
				status={status}
				branchId={branchId}
				onFromChange={onFromChange}
				onToChange={onToChange}
				onStatusChange={onStatusChange}
				onBranchChange={onBranchChange}
				onClear={onClear}
			/>

			{/* Table */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{isLoading ? (
					<LoadingSpinner />
				) : (
					<SalesDataTable<SalesRow, unknown>
						columns={salesColumns}
						data={data}
						total={total}
						page={page}
						onPageChange={onPageChange}
						isLoading={isLoading}
					/>
				)}
			</div>
		</div>
	);
}

interface PaymentsTabProps {
	data: PaymentRow[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
}

function PaymentsTab({ data, isLoading, isError, error, refetch }: PaymentsTabProps) {
	if (isLoading) return <LoadingSpinner />;
	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<div className="h-full overflow-hidden">
			<PaymentDataTable<PaymentRow, unknown> columns={paymentColumns} data={data} />
		</div>
	);
}

// ─── Route component ───────────────────────────────────────────────────────────

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { from, to, status, branchId, page, period } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	// Derive filters from period param (e.g. when navigating from Dashboard KPI card)
	const derivedFilters =
		period && !from && !to
			? getPeriodDates(period as Period)
			: { from, to };

	// ── Handlers ────────────────────────────────────────────────────────────

	function handleFilterChange(updates: Partial<z.infer<typeof salesSearchSchema>>) {
		navigate({ search: (prev) => ({ ...prev, ...updates, page: 1 }) });
	}

	function handleClear() {
		navigate({ search: { from: "", to: "", status: "", branchId: "", period: undefined, page: 1 } });
	}

	function handlePageChange(newPage: number) {
		navigate({ search: (prev) => ({ ...prev, page: newPage }) });
	}

	// ── Queries ─────────────────────────────────────────────────────────────

	const {
		data: salesApiResponse,
		isLoading: salesLoading,
		isError: salesError,
		error: salesErrorObj,
		refetch: salesRefetch,
	} = useQuery({
		queryKey: ["salesOrders", organizationId, derivedFilters.from, derivedFilters.to, status, branchId, page],
		queryFn: () =>
			client.salesOrders.list({
				organizationId: organizationId!,
				from: derivedFilters.from ? `${derivedFilters.from}T00:00:00.000Z` : undefined,
				to: derivedFilters.to ? `${derivedFilters.to}T23:59:59.999Z` : undefined,
				status: (status || undefined) as any,
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

	// ── Data mapping ─────────────────────────────────────────────────────────

	const salesApiRows = salesApiResponse?.rows ?? [];
	const total = salesApiResponse?.total ?? 0;

	const salesData: SalesRow[] = salesApiRows.map((item) => ({
		id: item.id,
		date: item.date ? item.date.toISOString() : null,
		sales_order: item.salesOrderNumber,
		total_sales: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
		status: item.status,
		customerId: item.customerId ?? null,
	}));

	const paymentsData: PaymentRow[] = invoicesApiData.map((item) => ({
		date: item.date ? item.date.toISOString() : null,
		invoice: item.invoiceNumber,
		sales_order: item.salesOrderId ?? null,
		mode: item.paymentMode ?? null,
		total_paid: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
		e_invoice_status: item.eInvoiceStatus ?? null,
	}));

	const salesCount = salesLoading ? null : total;
	const paymentsCount = invoicesLoading ? null : paymentsData.length;

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div>
					<h1 className="text-xl font-semibold">Sales & Payments</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{salesCount !== null && paymentsCount !== null
							? `${salesCount} orders · ${paymentsCount} invoices`
							: "Loading..."}
					</p>
				</div>
				<Link to="/dashboard/sales/create">
					<Button size="sm">
						<Plus className="mr-2 h-4 w-4" />
						New Sale
					</Button>
				</Link>
			</div>

			{organizationId ? (
				<Tabs defaultValue="orders" className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="shrink-0 border-b border-border/40 px-6">
						<TabsList className="h-10 bg-transparent p-0">
							<TabsTrigger
								value="orders"
								className="rounded-none border-b-2 border-transparent px-4 pb-2 pt-0 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
							>
								Sales Orders
								{salesCount !== null && (
									<span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{salesCount}
									</span>
								)}
							</TabsTrigger>
							<TabsTrigger
								value="payments"
								className="rounded-none border-b-2 border-transparent px-4 pb-2 pt-0 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
							>
								Payments
								{paymentsCount !== null && (
									<span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{paymentsCount}
									</span>
								)}
							</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="orders" className="mt-0 min-h-0 flex-1 overflow-hidden">
						<SalesTab
							data={salesData}
							total={total}
							page={page}
							onPageChange={handlePageChange}
							isLoading={salesLoading}
							isError={salesError}
							error={salesErrorObj}
							refetch={salesRefetch}
							from={derivedFilters.from}
							to={derivedFilters.to}
							status={status}
							branchId={branchId}
							onFromChange={(v) => handleFilterChange({ from: v })}
							onToChange={(v) => handleFilterChange({ to: v })}
							onStatusChange={(v) => handleFilterChange({ status: v })}
							onBranchChange={(v) => handleFilterChange({ branchId: v })}
							onClear={handleClear}
						/>
					</TabsContent>
					<TabsContent value="payments" className="mt-0 min-h-0 flex-1 overflow-hidden">
						<PaymentsTab
							data={paymentsData}
							isLoading={invoicesLoading}
							isError={invoicesError}
							error={invoicesErrorObj}
							refetch={invoicesRefetch}
						/>
					</TabsContent>
				</Tabs>
			) : (
				<LoadingSpinner />
			)}
		</div>
	);
}
