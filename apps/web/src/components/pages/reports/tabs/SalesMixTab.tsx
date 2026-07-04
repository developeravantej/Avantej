import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useScope } from "@/components/scope/ScopeProvider";
import { downloadCsv, reportCsvFilename } from "@/lib/download-csv";
import { client, orpc } from "@/utils/orpc";

import {
	ExportCsvButton,
	fmtCents,
	REPORT_PAGE_SIZE,
	ReportTable,
	type ReportColumn,
	type ReportTabProps,
} from "./report-tab-shared";

type MixRow = Awaited<
	ReturnType<typeof client.reports.listSalesMix>
>["rows"][number];

const KIND_LABELS: Record<string, string> = {
	service: "Service",
	product: "Product",
	custom: "Custom",
};

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

export function SalesMixTab({
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
		...orpc.reports.listSalesMix.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportSalesMixCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("sales-mix"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large export — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("Sales mix exported");
			}
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Export failed"),
	});

	const rows = query.data?.rows ?? [];
	const total = query.data?.total ?? 0;

	const columns: ReportColumn<MixRow>[] = [
		{ key: "item", header: "Item", render: (r) => r.itemDescription },
		{
			key: "kind",
			header: "Kind",
			render: (r) => KIND_LABELS[r.kind] ?? r.kind,
		},
		{
			key: "units",
			header: "Units",
			align: "right",
			render: (r) => r.unitsSold,
		},
		{
			key: "orders",
			header: "Orders",
			align: "right",
			render: (r) => r.orderCount,
		},
		{
			key: "revenue",
			header: "Revenue",
			align: "right",
			render: (r) => <MoneyCell cents={r.grossCents} currency={r.currency} />,
		},
		{
			key: "share",
			header: "Share %",
			align: "right",
			render: (r) => `${r.shareOfRevenuePct.toFixed(1)}%`,
		},
		{
			key: "newOrders",
			header: "New",
			align: "right",
			render: (r) => r.newCustomerOrders,
		},
		{
			key: "returningOrders",
			header: "Returning",
			align: "right",
			render: (r) => r.returningCustomerOrders,
		},
	];

	return (
		<div>
			{query.data?.truncated && (
				<p className="mb-2 text-xs" style={{ color: "#b45309" }}>
					Aggregated from the first 50,000 sale lines in this period — narrow
					the date range for exact figures.
				</p>
			)}
			<ReportTable
				columns={columns}
				rows={rows}
				rowKey={(r) => r.itemKey}
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
		</div>
	);
}
