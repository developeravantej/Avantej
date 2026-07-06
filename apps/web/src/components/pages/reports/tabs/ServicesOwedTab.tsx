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

type ServicesOwedResult = Awaited<
	ReturnType<typeof client.reports.listServicesOwed>
>;
type ServiceOwedRow = ServicesOwedResult["rows"][number];

const columns: ReportColumn<ServiceOwedRow>[] = [
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
		key: "status",
		header: "Status",
		render: (r) => <span className="capitalize">{r.status}</span>,
	},
	{
		key: "creditsRemaining",
		header: "Credits Remaining",
		align: "right",
		render: (r) => r.creditsRemaining.toLocaleString(),
	},
	{
		key: "owedValue",
		header: "Owed Value",
		align: "right",
		render: (r) =>
			r.owedValueCents == null ? (
				"—"
			) : (
				<>
					{fmtCents(r.owedValueCents)}{" "}
					<span className="text-xs" style={{ color: "#a3a3a3" }}>
						{r.currency}
					</span>
				</>
			),
	},
	{
		key: "starts",
		header: "Starts",
		render: (r) => fmtDate(r.startsAt),
	},
	{
		key: "expires",
		header: "Expires",
		render: (r) => fmtDate(r.expiresAt),
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
];

export function ServicesOwedTab({
	organizationId,
	from,
	to,
	taxBasis,
	canExport,
}: ReportTabProps) {
	const { scopeNodeId } = useScope();
	const [offset, setOffset] = useState(0);

	// Scope changes don't remount the tab (only from/to/taxBasis do) —
	// reset pagination here.
	useEffect(() => {
		setOffset(0);
	}, [scopeNodeId]);

	// from/to are required by the shared input contract but this report is a
	// point-in-time snapshot — the server ignores them.
	const query = useQuery({
		...orpc.reports.listServicesOwed.queryOptions({
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
			client.reports.exportServicesOwedCsv({
				organizationId,
				from,
				to,
				taxBasis,
				branchId: scopeNodeId ?? undefined,
			}),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("services-owed"), res.csv);
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
	const totalsEntries = Object.entries(query.data?.totalsByCurrency ?? {}).sort(
		([a], [b]) => a.localeCompare(b),
	);

	return (
		<div>
			<p className="mb-3 text-xs" style={{ color: "#737373" }}>
				<span className="font-semibold">Snapshot as of today</span> — all active
				and frozen packages with undelivered credits. The date range filter does
				not apply to this report.
			</p>

			{totalsEntries.length > 0 && (
				<div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{totalsEntries.map(([currency, t]) => (
						<div
							key={currency}
							className="rounded-2xl border px-4 py-3"
							style={{ background: "#fff", borderColor: "#e5e5e5" }}
						>
							<p
								className="text-[11px] font-bold uppercase tracking-wider"
								style={{ color: "#737373" }}
							>
								Owed value ({currency})
							</p>
							<p
								className="mt-1 font-mono text-lg font-semibold tabular-nums"
								style={{ color: "#0a0a0a" }}
							>
								{fmtCents(t.owedValueCents)}{" "}
								<span
									className="text-xs font-normal"
									style={{ color: "#a3a3a3" }}
								>
									{currency}
								</span>
							</p>
							<p className="mt-0.5 text-xs" style={{ color: "#737373" }}>
								{t.packages.toLocaleString()} package
								{t.packages === 1 ? "" : "s"} ·{" "}
								{t.creditsRemaining.toLocaleString()} credits remaining
							</p>
						</div>
					))}
				</div>
			)}

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
				emptyMessage="No outstanding service delivery — no active or frozen packages with remaining credits."
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
