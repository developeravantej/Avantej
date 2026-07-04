import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

type CollectionsRow = Awaited<
	ReturnType<typeof client.reports.listCollections>
>["rows"][number];

function MoneyCell({
	cents,
	currency,
	emphasis,
}: {
	cents: number;
	currency: string;
	emphasis?: boolean;
}) {
	return (
		<span style={emphasis ? { fontWeight: 600, color: "#0a0a0a" } : undefined}>
			{fmtCents(cents)}{" "}
			<span className="text-[10px] font-semibold" style={{ color: "#a3a3a3" }}>
				{currency}
			</span>
		</span>
	);
}

function SourceBadge({ source }: { source: "payment" | "installment" }) {
	const palette =
		source === "payment"
			? { background: "#dcfce7", color: "#166534", label: "Payment" }
			: { background: "#e0e7ff", color: "#3730a3", label: "Installment" };
	return (
		<span
			className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
			style={{ background: palette.background, color: palette.color }}
		>
			{palette.label}
		</span>
	);
}

export function CollectionsTab({
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
		...orpc.reports.listCollections.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportCollectionsCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("collections"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large export — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("Collections report exported");
			}
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Export failed"),
	});

	const rows = query.data?.rows ?? [];
	const total = query.data?.total ?? 0;

	const columns: ReportColumn<CollectionsRow>[] = [
		{ key: "date", header: "Date", render: (r) => fmtDateTime(r.receivedAt) },
		{
			key: "source",
			header: "Source",
			render: (r) => <SourceBadge source={r.source} />,
		},
		{
			key: "reference",
			header: "Reference",
			render: (r) => <span className="font-mono text-xs">{r.reference}</span>,
		},
		{
			key: "customer",
			header: "Customer",
			render: (r) => r.customerName ?? "—",
		},
		{ key: "method", header: "Method", render: (r) => r.method ?? "—" },
		{
			key: "amount",
			header: "Amount",
			align: "right",
			render: (r) => <MoneyCell cents={r.amountCents} currency={r.currency} />,
		},
		{
			key: "tax",
			header: "Tax",
			align: "right",
			render: (r) => <MoneyCell cents={r.taxCents} currency={r.currency} />,
		},
		{
			key: "collected",
			header: "Collected",
			align: "right",
			render: (r) => (
				<MoneyCell cents={r.collectedCents} currency={r.currency} emphasis />
			),
		},
		{ key: "branch", header: "Branch", render: (r) => r.branchName ?? "—" },
	];

	return (
		<ReportTable
			columns={columns}
			rows={rows}
			rowKey={(r) => `${r.source}:${r.id}`}
			total={total}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={query.isLoading || query.isFetching}
			isError={query.isError}
			onRetry={() => query.refetch()}
			emptyMessage="No money received in this period."
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
