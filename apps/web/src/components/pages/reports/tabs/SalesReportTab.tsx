import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useScope } from "@/components/scope/ScopeProvider";
import { downloadCsv, reportCsvFilename } from "@/lib/download-csv";
import { client, orpc } from "@/utils/orpc";

import {
	ExportCsvButton,
	fmtCents,
	fmtDate,
	REPORT_PAGE_SIZE,
	ReportTable,
	type ReportColumn,
	type ReportTabProps,
} from "./report-tab-shared";

type SalesRow = Awaited<
	ReturnType<typeof client.reports.listSales>
>["rows"][number];

function MoneyCell({ cents, currency }: { cents: number; currency: string }) {
	return (
		<span>
			{fmtCents(cents)}{" "}
			<span className="text-[10px] font-semibold" style={{ color: "#a3a3a3" }}>
				{currency}
			</span>
		</span>
	);
}

function RowBadge({ label, tone }: { label: string; tone: "amber" | "red" }) {
	const palette =
		tone === "amber"
			? { background: "#fef3c7", color: "#92400e" }
			: { background: "#fee2e2", color: "#991b1b" };
	return (
		<span
			className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
			style={palette}
		>
			{label}
		</span>
	);
}

export function SalesReportTab({
	organizationId,
	from,
	to,
	taxBasis,
	canExport,
}: ReportTabProps) {
	const { scopeNodeId } = useScope();
	const [offset, setOffset] = useState(0);

	// Reset paging when the filter window or scope changes.
	useEffect(() => {
		setOffset(0);
	}, [from, to, taxBasis, scopeNodeId]);

	const baseInput = {
		organizationId,
		branchId: scopeNodeId ?? undefined,
		from,
		to,
		taxBasis,
	};

	const query = useQuery({
		...orpc.reports.listSales.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportSalesCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("sales"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large export — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("Sales report exported");
			}
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Export failed"),
	});

	const rows = query.data?.rows ?? [];
	const total = query.data?.total ?? 0;

	const columns: ReportColumn<SalesRow>[] = [
		{ key: "date", header: "Date", render: (r) => fmtDate(r.orderDate) },
		{
			key: "order",
			header: "Order #",
			render: (r) => (
				<span className="font-mono text-xs">{r.salesOrderNumber}</span>
			),
		},
		{
			key: "customer",
			header: "Customer",
			render: (r) => (
				<span className="inline-flex items-center gap-1.5">
					{r.customerName}
					{r.isComplimentary && <RowBadge label="Comp" tone="amber" />}
					{r.refundStatus !== "none" && (
						<RowBadge label={`Refund: ${r.refundStatus}`} tone="red" />
					)}
				</span>
			),
		},
		{ key: "item", header: "Item", render: (r) => r.itemDescription },
		{ key: "qty", header: "Qty", align: "right", render: (r) => r.quantity },
		{
			key: "lineTotal",
			header: "Line Total",
			align: "right",
			render: (r) => (
				<MoneyCell cents={r.lineTotalCents} currency={r.currency} />
			),
		},
		{
			key: "tax",
			header: "Tax",
			align: "right",
			render: (r) => <MoneyCell cents={r.taxCents} currency={r.currency} />,
		},
		{ key: "branch", header: "Branch", render: (r) => r.branchName ?? "—" },
		{ key: "soldBy", header: "Sold By", render: (r) => r.soldByName ?? "—" },
		{
			key: "leadSource",
			header: "Lead Source",
			render: (r) => r.leadSourceName ?? "—",
		},
	];

	return (
		<ReportTable
			columns={columns}
			rows={rows}
			rowKey={(r) => r.itemId}
			total={total}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={query.isLoading || query.isFetching}
			isError={query.isError}
			onRetry={() => query.refetch()}
			emptyMessage="No sales in this period."
			toolbar={
				canExport ? (
					<ExportCsvButton
						onClick={() => exportMutation.mutate()}
						exporting={exportMutation.isPending}
					/>
				) : undefined
			}
		/>
	);
}
