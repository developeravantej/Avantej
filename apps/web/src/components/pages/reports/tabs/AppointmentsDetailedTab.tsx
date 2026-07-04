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

interface AppointmentRow {
	id: string;
	// oRPC serializes Date columns to string over the wire; accept both so the
	// server AppointmentDetailRow (Date) assigns without an unsafe cast.
	startTime: string | Date;
	endTime: string | Date;
	bookingNumber: string | null;
	serviceName: string | null;
	coachName: string | null;
	staffCount: number;
	customerName: string | null;
	clientCount: number;
	status: string;
	creditsUsed: number;
	sessionTotalCents: number;
	currency: string;
	type: string;
	branchName: string | null;
	isComplimentary: boolean;
}

const STATUS_COLORS: Record<string, string> = {
	completed: "#15803d",
	cancelled: "#b91c1c",
	"no-show": "#b45309",
};

function StatusBadge({ status }: { status: string }) {
	const color = STATUS_COLORS[status] ?? "#737373";
	return (
		<span
			className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
			style={{ color, background: `${color}14` }}
		>
			{status}
		</span>
	);
}

const COLUMNS: ReportColumn<AppointmentRow>[] = [
	{
		key: "start",
		header: "Start",
		render: (row) => fmtDateTime(row.startTime),
	},
	{
		key: "end",
		header: "End",
		render: (row) => fmtDateTime(row.endTime),
	},
	{
		key: "booking",
		header: "Booking #",
		render: (row) => row.bookingNumber ?? "—",
	},
	{
		key: "service",
		header: "Service",
		render: (row) => row.serviceName ?? "—",
	},
	{
		key: "coach",
		header: "Coach",
		render: (row) => row.coachName ?? "—",
	},
	{
		key: "staffCount",
		header: "Staff",
		align: "right",
		render: (row) => row.staffCount.toLocaleString(),
	},
	{
		key: "customer",
		header: "Customer",
		render: (row) => row.customerName ?? "—",
	},
	{
		key: "clients",
		header: "Clients",
		align: "right",
		render: (row) => row.clientCount.toLocaleString(),
	},
	{
		key: "status",
		header: "Status",
		render: (row) => <StatusBadge status={row.status} />,
	},
	{
		key: "credits",
		header: "Credits",
		align: "right",
		render: (row) => row.creditsUsed.toLocaleString(),
	},
	{
		key: "sessionTotal",
		header: "Session Total",
		align: "right",
		render: (row) => (
			<>
				{fmtCents(row.sessionTotalCents)}{" "}
				<span className="text-[10px]" style={{ color: "#a3a3a3" }}>
					{row.currency}
				</span>
			</>
		),
	},
	{
		key: "branch",
		header: "Branch",
		render: (row) => row.branchName ?? "—",
	},
	{
		key: "type",
		header: "Type",
		render: (row) => <span className="capitalize">{row.type}</span>,
	},
	{
		key: "complimentary",
		header: "Complimentary",
		render: (row) => (row.isComplimentary ? "Yes" : "—"),
	},
];

/** Appointments detailed report — one appointment per row, all statuses. */
export function AppointmentsDetailedTab({
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
		...orpc.reports.listAppointmentsDetailed.queryOptions({
			input: { ...baseInput, limit: REPORT_PAGE_SIZE, offset },
		}),
		enabled: !!organizationId,
		placeholderData: (prev) => prev,
	});

	const exportMutation = useMutation({
		mutationFn: () => client.reports.exportAppointmentsDetailedCsv(baseInput),
		onSuccess: (res) => {
			downloadCsv(reportCsvFilename("appointments-detailed"), res.csv);
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

	const rows: AppointmentRow[] = query.data?.rows ?? [];

	return (
		<ReportTable
			columns={COLUMNS}
			rows={rows}
			rowKey={(row) => row.id}
			total={query.data?.total ?? 0}
			offset={offset}
			onOffsetChange={setOffset}
			isLoading={query.isFetching}
			isError={query.isError}
			onRetry={() => query.refetch()}
			emptyMessage="No appointments in this period."
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
