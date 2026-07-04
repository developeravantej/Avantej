import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

type ExpiringCreditRow = Awaited<
	ReturnType<typeof client.reports.listExpiringCredits>
>["rows"][number];

function daysLeftColor(days: number): string {
	if (days <= 7) return "#b91c1c";
	if (days <= 30) return "#b45309";
	return "#0a0a0a";
}

const columns: ReportColumn<ExpiringCreditRow>[] = [
	{
		key: "customer",
		header: "Customer",
		render: (r) => r.customerName ?? "—",
	},
	{
		key: "service",
		header: "Service",
		render: (r) => r.serviceName ?? "—",
	},
	{
		key: "purchase",
		header: "Purchase #",
		render: (r) => r.purchaseNumber ?? "—",
	},
	{
		key: "creditsTotal",
		header: "Total",
		align: "right",
		render: (r) => r.creditsTotal.toLocaleString(),
	},
	{
		key: "creditsUsed",
		header: "Used",
		align: "right",
		render: (r) => r.creditsUsed.toLocaleString(),
	},
	{
		key: "creditsRemaining",
		header: "Remaining",
		align: "right",
		render: (r) => r.creditsRemaining.toLocaleString(),
	},
	{
		key: "remainingValue",
		header: "Remaining Value",
		align: "right",
		render: (r) =>
			r.remainingValueCents == null ? (
				"—"
			) : (
				<>
					{fmtCents(r.remainingValueCents)}{" "}
					<span className="text-xs" style={{ color: "#a3a3a3" }}>
						{r.currency}
					</span>
				</>
			),
	},
	{
		key: "expires",
		header: "Expires",
		render: (r) => fmtDate(r.expiresAt),
	},
	{
		key: "daysLeft",
		header: "Days Left",
		align: "right",
		render: (r) => (
			<span
				className="font-semibold"
				style={{ color: daysLeftColor(r.daysLeft) }}
			>
				{r.daysLeft.toLocaleString()}
			</span>
		),
	},
	{
		key: "frozenUntil",
		header: "Frozen Until",
		render: (r) => fmtDate(r.frozenUntil),
	},
	{
		key: "trainer",
		header: "Trainer",
		render: (r) => r.trainerName ?? "—",
	},
	{
		key: "branch",
		header: "Branch",
		render: (r) => r.branchName ?? "—",
	},
	{
		key: "paymentStatus",
		header: "Payment Status",
		render: (r) => r.paymentStatus,
	},
];

export function ExpiringCreditsTab({
	organizationId,
	from,
	to,
	taxBasis,
	canExport,
}: ReportTabProps) {
	const { scopeNodeId } = useScope();
	const [offset, setOffset] = useState(0);

	// from/to/taxBasis changes remount the tab (keyed by the index page);
	// scope changes don't, so reset pagination here.
	useEffect(() => {
		setOffset(0);
	}, [scopeNodeId]);

	const query = useQuery({
		...orpc.reports.listExpiringCredits.queryOptions({
			input: {
				organizationId,
				from,
				to,
				taxBasis,
				branchId: scopeNodeId ?? undefined,
				limit: REPORT_PAGE_SIZE,
				offset,
			},
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportCsv = useMutation({
		mutationFn: () =>
			client.reports.exportExpiringCreditsCsv({
				organizationId,
				from,
				to,
				taxBasis,
				branchId: scopeNodeId ?? undefined,
			}),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("expiring-credits"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large export — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("CSV exported");
			}
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Export failed");
		},
	});

	const rows = query.data?.rows ?? [];
	const total = query.data?.total ?? 0;

	return (
		<div>
			<p className="mb-3 text-xs" style={{ color: "#737373" }}>
				Date range filters by <span className="font-semibold">expiry date</span>{" "}
				— active packages with remaining credits that expire within the selected
				window.
			</p>
			<ReportTable
				columns={columns}
				rows={rows}
				rowKey={(r) => r.id}
				total={total}
				offset={offset}
				onOffsetChange={setOffset}
				isLoading={query.isFetching}
				isError={query.isError}
				onRetry={() => query.refetch()}
				emptyMessage="No packages expire in this window."
				toolbar={
					canExport ? (
						<ExportCsvButton
							onClick={() => exportCsv.mutate()}
							exporting={exportCsv.isPending}
						/>
					) : undefined
				}
			/>
		</div>
	);
}
