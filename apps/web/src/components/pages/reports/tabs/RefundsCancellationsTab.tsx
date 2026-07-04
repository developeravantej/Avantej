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

const KIND_STYLES: Record<
	string,
	{ color: string; background: string; label: string }
> = {
	cancelled: { color: "#b91c1c", background: "#fef2f2", label: "Cancelled" },
	refund: { color: "#b45309", background: "#fffbeb", label: "Refund" },
	both: { color: "#7c3aed", background: "#f5f3ff", label: "Both" },
};

function KindBadge({ kind }: { kind: string }) {
	const s = KIND_STYLES[kind] ?? KIND_STYLES.cancelled;
	return (
		<span
			className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
			style={{ color: s.color, background: s.background }}
		>
			{s.label}
		</span>
	);
}

function Money({ cents, currency }: { cents: number; currency: string }) {
	return (
		<>
			{fmtCents(cents)}{" "}
			<span className="text-[10px]" style={{ color: "#a3a3a3" }}>
				{currency}
			</span>
		</>
	);
}

export function RefundsCancellationsTab({
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
	}, [from, to, taxBasis, scopeNodeId]);

	const baseInput = {
		organizationId,
		branchId: scopeNodeId ?? undefined,
		from,
		to,
		taxBasis,
	};

	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.reports.listRefundsCancellations.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const rows = data?.rows ?? [];
	type Row = (typeof rows)[number];

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportRefundsCancellationsCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("refunds-cancellations"), res.csv);
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
			render: (r) => fmtDateTime(r.eventDate),
		},
		{
			key: "kind",
			header: "Kind",
			render: (r) => <KindBadge kind={r.kind} />,
		},
		{
			key: "order",
			header: "Order #",
			render: (r) => r.salesOrderNumber,
		},
		{
			key: "cancellation",
			header: "Cancellation #",
			render: (r) => r.cancellationNumber ?? "—",
		},
		{
			key: "customer",
			header: "Customer",
			render: (r) => r.customerName,
		},
		{
			key: "originalTotal",
			header: "Original Total",
			align: "right",
			render: (r) => (
				<Money cents={r.originalTotalCents} currency={r.currency} />
			),
		},
		{
			key: "cancelledAmt",
			header: "Cancelled Amt",
			align: "right",
			render: (r) => (
				<Money cents={r.cancelledAmountCents} currency={r.currency} />
			),
		},
		{
			key: "refundedAmt",
			header: "Refunded Amt",
			align: "right",
			render: (r) => (
				<Money cents={r.refundedAmountCents} currency={r.currency} />
			),
		},
		{
			key: "refundStatus",
			header: "Refund Status",
			render: (r) => (r.refundStatus === "none" ? "—" : r.refundStatus),
		},
		{
			key: "reason",
			header: "Reason",
			render: (r) => {
				const category = r.reasonCategory
					? r.reasonCategory.replace(/_/g, " ")
					: null;
				const text = category
					? r.reason
						? `${category} — ${r.reason}`
						: category
					: (r.reason ?? "—");
				return (
					<span
						className="inline-block max-w-[240px] truncate align-bottom"
						title={r.reason ?? undefined}
					>
						{text}
					</span>
				);
			},
		},
		{
			key: "cancelledBy",
			header: "Cancelled By",
			render: (r) => r.cancelledByName ?? "—",
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
			rowKey={(r) => r.salesOrderId}
			total={data?.total ?? 0}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={isLoading}
			isError={isError}
			onRetry={() => refetch()}
			emptyMessage="No refunds or cancellations in this period."
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
