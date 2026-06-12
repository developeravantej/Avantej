import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { Download, Plus } from "lucide-react";
import { z } from "zod";
import { type SalesRow } from "@/components/tables/sales/view/columns";
import { type PaymentRow } from "@/components/tables/payment/view/columns";
import { RefundsTab } from "@/components/refunds/refunds-tab";
import { useUserContext } from "@/hooks/useUserContext";
import { getPeriodDates, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import type { KpiSummary } from "@/features/sales/sales-view.types";
import { KpiStrip } from "@/features/sales/components/KpiStrip";
import { SalesTab } from "@/features/sales/components/SalesTab";
import { PaymentsTab } from "@/features/sales/components/PaymentsTab";
import { CancelledSalesTab } from "@/features/sales/components/CancelledSalesTab";
import {
	InstallmentsTab,
	type InstallmentStatusFilter,
} from "@/features/sales/components/InstallmentsTab";

// ─── Route search schema ───────────────────────────────────────────────────────

const salesSearchSchema = z.object({
	from: z.string().default(""),
	to: z.string().default(""),
	status: z.string().default(""),
	branchId: z.string().default(""),
	period: z.string().optional(),
	kpiPeriod: z.enum(["today", "week", "month"]).default("month"),
	refundStatus: z
		.enum(["all", "none", "pending", "partial", "processed"])
		.default("all"),
	tab: z
		.enum(["sales", "installments", "payments", "cancelled", "refunds"])
		.default("sales"),
	instStatus: z.enum(["due_soon", "overdue", "all"]).default("due_soon"),
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

	const {
		from,
		to,
		status,
		branchId,
		period,
		kpiPeriod,
		refundStatus,
		tab,
		instStatus,
		search,
	} = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	// Derive date filters from legacy `period` param (from Dashboard KPI card)
	const derivedFilters =
		period && !from && !to ? getPeriodDates(period as Period) : { from, to };

	// ── Handlers ────────────────────────────────────────────────────────────

	function handleFilterChange(
		updates: Partial<z.infer<typeof salesSearchSchema>>,
	) {
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
				instStatus: "due_soon",
				search: "",
			},
		});
	}

	function handleKpiPeriodChange(v: "today" | "week" | "month") {
		navigate({ search: (prev) => ({ ...prev, kpiPeriod: v }) });
	}

	function handleTabChange(v: string) {
		navigate({
			search: (prev) => ({
				...prev,
				tab: v as
					| "sales"
					| "installments"
					| "payments"
					| "cancelled"
					| "refunds",
			}),
		});
	}

	function handleInstStatusChange(v: InstallmentStatusFilter) {
		navigate({ search: (prev) => ({ ...prev, instStatus: v }) });
	}

	function handleRefundStatusChange(
		v: "all" | "none" | "pending" | "partial" | "processed",
	) {
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
				from: derivedFilters.from
					? `${derivedFilters.from}T00:00:00.000Z`
					: undefined,
				to: derivedFilters.to
					? `${derivedFilters.to}T23:59:59.999Z`
					: undefined,
				status: (["draft", "confirmed", "completed", "cancelled"].includes(
					status,
				)
					? status
					: undefined) as
					| "draft"
					| "confirmed"
					| "completed"
					| "cancelled"
					| undefined,
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
		...orpc.invoices.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const canSeeInstallments = hasPermission("service_management:read");

	const { data: dueSoonData } = useQuery({
		queryKey: ["sales-installments-due-soon-count", organizationId, branchId],
		queryFn: () =>
			client.installments.listUpcoming({
				organizationId: organizationId!,
				window: "due_soon",
				branchId: branchId || undefined,
				limit: 1,
				offset: 0,
			}),
		enabled: !!organizationId && canSeeInstallments,
		retry: false,
	});

	const {
		data: kpiData,
		isLoading: kpiLoading,
		isError: kpiIsError,
	} = useQuery({
		...orpc.salesOrders.kpiSummary.queryOptions({
			input: { organizationId: organizationId!, period: kpiPeriod },
		}),
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
		const row = item as typeof item & {
			createdByName?: string | null;
			firstItemDescription?: string | null;
		};
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
									...(canSeeInstallments
										? [
												{
													value: "installments",
													label: "Installments",
													count: dueSoonData?.total ?? null,
												},
											]
										: []),
									{
										value: "payments",
										label: "Payments",
										count: paymentsCount,
									},
									{ value: "cancelled", label: "Cancelled", count: null },
									...(hasPermission("refund_management:read")
										? [{ value: "refunds", label: "Refunds", count: null }]
										: []),
								].map((t) => (
									<button
										key={t.value}
										type="button"
										data-testid={`sales-tab-${t.value}`}
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
											<span
												className={cn(
													"ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
													tab === t.value
														? "bg-white/20"
														: "bg-[#f3f3f3] text-[#737373]",
												)}
											>
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
							{tab === "installments" && canSeeInstallments && (
								<InstallmentsTab
									organizationId={organizationId}
									status={instStatus}
									onStatusChange={handleInstStatusChange}
									branchId={branchId}
									onBranchChange={(v) => handleFilterChange({ branchId: v })}
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
							{tab === "refunds" &&
								organizationId &&
								hasPermission("refund_management:read") && (
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
