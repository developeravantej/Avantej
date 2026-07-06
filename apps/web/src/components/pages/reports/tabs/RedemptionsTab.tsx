import { useEffect, useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useScope } from "@/components/scope/ScopeProvider";
import { downloadCsv, reportCsvFilename } from "@/lib/download-csv";
import { client, orpc } from "@/utils/orpc";

import {
	ExportCsvButton,
	fmtCents,
	fmtDateTime,
	REPORT_PAGE_SIZE,
	ReportTable,
	type ReportColumn,
	type ReportTabProps,
} from "./report-tab-shared";

export function RedemptionsTab({
	organizationId,
	from,
	to,
	taxBasis,
	canExport,
}: ReportTabProps) {
	const { scopeNodeId } = useScope();
	const [offset, setOffset] = useState(0);

	useEffect(() => {
		setOffset(0);
	}, [from, to, scopeNodeId]);

	// taxBasis is N/A for redemptions (points are a pre-tax discount) but stays
	// in the shared input contract; the server ignores it for this report.
	const baseInput = {
		organizationId,
		branchId: scopeNodeId ?? undefined,
		from,
		to,
		taxBasis,
	};

	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.reports.listRedemptions.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const rows = data?.rows ?? [];
	type Row = (typeof rows)[number];

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportRedemptionsCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("redemptions"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large report — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("CSV exported");
			}
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Export failed"),
	});

	const columns: ReportColumn<Row>[] = [
		{
			key: "date",
			header: "Date",
			render: (r) => fmtDateTime(r.date),
		},
		{
			key: "customer",
			header: "Customer",
			render: (r) => r.customerName ?? r.customerUserId,
		},
		{
			key: "points",
			header: "Points",
			align: "right",
			render: (r) => r.pointsRedeemed.toLocaleString(),
		},
		{
			key: "value",
			header: "Value",
			align: "right",
			render: (r) => (
				<>
					{fmtCents(r.valueCents)}{" "}
					<span className="text-[10px]" style={{ color: "#a3a3a3" }}>
						{r.currency}
					</span>
				</>
			),
		},
		{
			key: "balanceAfter",
			header: "Balance After",
			align: "right",
			render: (r) => r.balanceAfter.toLocaleString(),
		},
		{
			key: "reason",
			header: "Reason",
			render: (r) => (
				<span
					className="inline-block max-w-[280px] truncate align-bottom"
					title={r.reason}
				>
					{r.reason}
				</span>
			),
		},
		{
			key: "source",
			header: "Source",
			render: (r) => r.sourceType ?? "—",
		},
		{
			key: "order",
			header: "Order #",
			render: (r) => r.salesOrderNumber ?? "—",
		},
		{
			key: "branch",
			header: "Branch",
			render: (r) => r.branchName ?? "—",
		},
	];

	return (
		<ReportTable
			columns={columns}
			rows={rows}
			rowKey={(r) => r.id}
			total={data?.total ?? 0}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={isLoading}
			isError={isError}
			onRetry={() => refetch()}
			emptyMessage="No credit-point redemptions in this period."
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
