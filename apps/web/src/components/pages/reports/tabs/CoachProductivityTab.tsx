import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

interface CommissionByCurrency {
	currency: string;
	cents: number;
}

interface CoachRow {
	staffId: string;
	staffName: string | null;
	tierName: string | null;
	completed: number;
	noShows: number;
	noShowPct: number;
	cancelled: number;
	upcoming: number;
	distinctClients: number;
	creditsConsumed: number;
	/** Per-currency commission — never summed across currencies (WS1). */
	commissionByCurrency: CommissionByCurrency[];
	currency: string;
}

/** No-show rate colour bands: >20% red, >10% amber, else neutral. */
function noShowPctColor(pct: number): string {
	if (pct > 20) return "#b91c1c";
	if (pct > 10) return "#b45309";
	return "#0a0a0a";
}

const COLUMNS: ReportColumn<CoachRow>[] = [
	{
		key: "coach",
		header: "Coach",
		render: (row) => (
			<span className="font-medium">{row.staffName ?? "—"}</span>
		),
	},
	{
		key: "tier",
		header: "Tier",
		render: (row) => row.tierName ?? "—",
	},
	{
		key: "completed",
		header: "Completed",
		align: "right",
		render: (row) => row.completed.toLocaleString(),
	},
	{
		key: "noShows",
		header: "No-Shows",
		align: "right",
		render: (row) => row.noShows.toLocaleString(),
	},
	{
		key: "noShowPct",
		header: "No-Show %",
		align: "right",
		render: (row) => (
			<span
				style={{
					color: noShowPctColor(row.noShowPct),
					fontWeight: row.noShowPct > 10 ? 700 : 400,
				}}
			>
				{row.noShowPct.toFixed(1)}%
			</span>
		),
	},
	{
		key: "cancelled",
		header: "Cancelled",
		align: "right",
		render: (row) => row.cancelled.toLocaleString(),
	},
	{
		key: "upcoming",
		header: "Upcoming",
		align: "right",
		render: (row) => row.upcoming.toLocaleString(),
	},
	{
		key: "distinctClients",
		header: "Distinct Clients",
		align: "right",
		render: (row) => row.distinctClients.toLocaleString(),
	},
	{
		key: "creditsConsumed",
		header: "Credits",
		align: "right",
		render: (row) => row.creditsConsumed.toLocaleString(),
	},
	{
		key: "commission",
		header: "Commission",
		align: "right",
		render: (row) =>
			row.commissionByCurrency.length === 0 ? (
				<span style={{ color: "#a3a3a3" }}>—</span>
			) : (
				<div className="flex flex-col items-end gap-0.5">
					{row.commissionByCurrency.map((c) => (
						<span key={c.currency}>
							{fmtCents(c.cents)}{" "}
							<span className="text-[10px]" style={{ color: "#a3a3a3" }}>
								{c.currency}
							</span>
						</span>
					))}
				</div>
			),
	},
];

/** Coach productivity report — one coach per row, sorted by Completed. */
export function CoachProductivityTab({
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

	const baseInput = {
		organizationId,
		branchId: scopeNodeId ?? undefined,
		from,
		to,
		taxBasis,
	};

	const query = useQuery({
		...orpc.reports.listCoachProductivity.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportCoachProductivityCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("coach-productivity"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Export truncated — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("CSV exported.");
			}
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Export failed."),
	});

	const rows = (query.data?.rows ?? []) as CoachRow[];

	return (
		<ReportTable
			columns={COLUMNS}
			rows={rows}
			rowKey={(row) => row.staffId}
			total={query.data?.total ?? 0}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={query.isFetching}
			isError={query.isError}
			onRetry={() => query.refetch()}
			emptyMessage="No coach activity in this period."
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
