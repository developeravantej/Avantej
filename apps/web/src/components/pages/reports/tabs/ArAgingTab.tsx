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

type ArRow = Awaited<
	ReturnType<typeof client.reports.listArAging>
>["rows"][number];

type BucketTotals = Awaited<
	ReturnType<typeof client.reports.listArAging>
>["bucketTotals"];

type Bucket = "current" | "0-30" | "31-60" | "61-90" | "90+";

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
	{ key: "current", label: "Current", tone: "#16a34a" },
	{ key: "0-30", label: "0–30 days", tone: "#ca8a04" },
	{ key: "31-60", label: "31–60 days", tone: "#ea580c" },
	{ key: "61-90", label: "61–90 days", tone: "#dc2626" },
	{ key: "90+", label: "90+ days", tone: "#991b1b" },
];

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

function BucketBadge({ bucket }: { bucket: Bucket }) {
	const tone = BUCKETS.find((b) => b.key === bucket)?.tone ?? "#737373";
	const label = BUCKETS.find((b) => b.key === bucket)?.label ?? bucket;
	return (
		<span
			className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
			style={{ background: `${tone}1a`, color: tone }}
		>
			{label}
		</span>
	);
}

function BucketSummary({ totals }: { totals: BucketTotals }) {
	const currencies = Object.keys(totals).sort();

	return (
		<div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
			{BUCKETS.map((b) => {
				const perCurrency = currencies
					.map((cur) => ({ cur, cell: totals[cur]?.[b.key] }))
					.filter((x) => x.cell && x.cell.count > 0);
				const count = perCurrency.reduce((s, x) => s + (x.cell?.count ?? 0), 0);
				return (
					<div
						key={b.key}
						className="rounded-2xl border px-3 py-2.5"
						style={{ background: "#fff", borderColor: "#e5e5e5" }}
					>
						<div className="flex items-center justify-between">
							<span
								className="text-[11px] font-bold uppercase tracking-wide"
								style={{ color: b.tone }}
							>
								{b.label}
							</span>
							<span
								className="text-xs font-semibold"
								style={{ color: "#737373" }}
							>
								{count}
							</span>
						</div>
						<div className="mt-1.5 space-y-0.5">
							{perCurrency.length === 0 ? (
								<p className="text-xs" style={{ color: "#a3a3a3" }}>
									—
								</p>
							) : (
								perCurrency.map((x) => (
									<p
										key={x.cur}
										className="font-mono text-xs tabular-nums"
										style={{ color: "#0a0a0a" }}
									>
										{fmtCents(x.cell?.outstandingCents ?? 0)}{" "}
										<span
											className="text-[10px] font-semibold"
											style={{ color: "#a3a3a3" }}
										>
											{x.cur}
										</span>
									</p>
								))
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function ArAgingTab({
	organizationId,
	from,
	to,
	taxBasis,
	canExport,
}: ReportTabProps) {
	const { scopeNodeId } = useScope();
	const [offset, setOffset] = useState(0);

	// AR is a point-in-time snapshot — from/to/taxBasis do not affect the query,
	// but scope changes still reset paging.
	useEffect(() => {
		setOffset(0);
	}, [scopeNodeId]);

	const baseInput = {
		organizationId,
		branchId: scopeNodeId ?? undefined,
		from,
		to,
		taxBasis,
	};

	const query = useQuery({
		...orpc.reports.listArAging.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportArAgingCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("ar-aging"), res.csv);
			if (res.truncated) {
				toast.warning(
					"Large export — only the first 50,000 rows were exported.",
				);
			} else {
				toast.success("Outstanding report exported");
			}
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Export failed"),
	});

	const rows = query.data?.rows ?? [];
	const total = query.data?.total ?? 0;
	const bucketTotals = query.data?.bucketTotals ?? {};

	const columns: ReportColumn<ArRow>[] = [
		{
			key: "customer",
			header: "Customer",
			render: (r) => r.customerName ?? "—",
		},
		{ key: "package", header: "Package", render: (r) => r.serviceName ?? "—" },
		{
			key: "purchase",
			header: "Purchase #",
			render: (r) =>
				r.purchaseNumber ? (
					<span className="font-mono text-xs">{r.purchaseNumber}</span>
				) : (
					"—"
				),
		},
		{
			key: "paid",
			header: "Paid",
			align: "right",
			render: (r) => (
				<MoneyCell cents={r.paidSoFarCents} currency={r.currency} />
			),
		},
		{
			key: "outstanding",
			header: "Outstanding",
			align: "right",
			render: (r) => (
				<MoneyCell cents={r.outstandingCents} currency={r.currency} emphasis />
			),
		},
		{
			key: "unpaid",
			header: "Unpaid",
			align: "right",
			render: (r) => r.unpaidCount,
		},
		{
			key: "oldest",
			header: "Oldest Due",
			render: (r) => fmtDate(r.oldestUnpaidDue),
		},
		{ key: "next", header: "Next Due", render: (r) => fmtDate(r.nextDueDate) },
		{
			key: "bucket",
			header: "Bucket",
			render: (r) => <BucketBadge bucket={r.bucket as Bucket} />,
		},
		{ key: "branch", header: "Branch", render: (r) => r.branchName ?? "—" },
	];

	return (
		<div>
			<p className="mb-2 text-xs" style={{ color: "#737373" }}>
				Snapshot as of today — date range does not apply. Outstanding always
				includes tax, so the tax basis toggle is ignored here.
			</p>
			<BucketSummary totals={bucketTotals} />
			<ReportTable
				columns={columns}
				rows={rows}
				rowKey={(r) => r.packageInstanceId}
				total={total}
				offset={offset}
				onOffsetChange={setOffset}
				isLoading={query.isLoading || query.isFetching}
				isError={query.isError}
				onRetry={() => query.refetch()}
				emptyMessage="No outstanding balances."
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
