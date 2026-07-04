import type { ReactNode } from "react";

import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";

// ---------------------------------------------------------------------------
// Shared contract every WS2 report tab receives from ReportsIndexPage.
// from/to are full ISO datetime bounds (already converted from yyyy-mm-dd).
// Tabs read scope via useScope() themselves, matching the page convention.
// ---------------------------------------------------------------------------

export type ReportTaxBasis = "pre_tax" | "tax_inclusive";

export interface ReportTabProps {
	organizationId: string;
	from: string;
	to: string;
	taxBasis: ReportTaxBasis;
	canExport: boolean;
}

export const REPORT_PAGE_SIZE = 50;

/** cents → "1,234.56" (currency label rendered separately per row). */
export function fmtCents(cents: number): string {
	return (cents / 100).toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export function fmtDate(iso: string | Date | null | undefined): string {
	if (!iso) return "—";
	const d = typeof iso === "string" ? new Date(iso) : iso;
	return d.toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
	if (!iso) return "—";
	const d = typeof iso === "string" ? new Date(iso) : iso;
	return d.toLocaleString("en-MY", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// ---------------------------------------------------------------------------
// Generic report table shell — plain sticky-header table + pagination +
// export button, styled to match the tenant dashboard (#e5e5e5 borders,
// #f3f3f3 canvas). Tabs supply columns + row renderer.
// ---------------------------------------------------------------------------

export interface ReportColumn<Row> {
	key: string;
	header: string;
	align?: "left" | "right";
	render: (row: Row) => ReactNode;
}

export function ReportTable<Row>({
	columns,
	rows,
	rowKey,
	total,
	offset,
	onOffsetChange,
	isLoading,
	isError,
	onRetry,
	emptyMessage,
	toolbar,
}: {
	columns: ReportColumn<Row>[];
	rows: Row[];
	rowKey: (row: Row, index: number) => string;
	total: number;
	offset: number;
	onOffsetChange: (offset: number) => void;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	emptyMessage: string;
	/** Right-aligned toolbar area (export button, extra filters). */
	toolbar?: ReactNode;
}) {
	const page = Math.floor(offset / REPORT_PAGE_SIZE) + 1;
	const pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));

	if (isError) {
		return (
			<StatusCallout
				variant="error"
				title="Couldn't load this report"
				onRetry={onRetry}
			/>
		);
	}

	return (
		<div
			className="rounded-2xl border"
			style={{ background: "#fff", borderColor: "#e5e5e5" }}
		>
			{(toolbar || total > 0) && (
				<div
					className="flex flex-wrap items-center gap-2 border-b px-4 py-3"
					style={{ borderColor: "#e5e5e5" }}
				>
					<p className="text-xs font-semibold" style={{ color: "#737373" }}>
						{total.toLocaleString()} row{total === 1 ? "" : "s"}
					</p>
					<div className="ml-auto flex items-center gap-2">{toolbar}</div>
				</div>
			)}

			{isLoading && rows.length === 0 ? (
				<div className="py-12">
					<PageLoader />
				</div>
			) : rows.length === 0 ? (
				<p
					className="px-4 py-12 text-center text-sm"
					style={{ color: "#a3a3a3" }}
				>
					{emptyMessage}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr
								className="border-b text-left"
								style={{ borderColor: "#e5e5e5" }}
							>
								{columns.map((col) => (
									<th
										key={col.key}
										className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider ${
											col.align === "right" ? "text-right" : "text-left"
										}`}
										style={{ color: "#737373" }}
									>
										{col.header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, i) => (
								<tr
									key={rowKey(row, i)}
									className="border-b last:border-b-0 hover:bg-[#fafafa]"
									style={{ borderColor: "#f0f0f0" }}
								>
									{columns.map((col) => (
										<td
											key={col.key}
											className={`whitespace-nowrap px-4 py-2.5 ${
												col.align === "right"
													? "text-right font-mono tabular-nums"
													: "text-left"
											}`}
										>
											{col.render(row)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{pageCount > 1 && (
				<div
					className="flex items-center justify-between border-t px-4 py-3"
					style={{ borderColor: "#e5e5e5" }}
				>
					<button
						type="button"
						disabled={offset === 0 || isLoading}
						onClick={() =>
							onOffsetChange(Math.max(0, offset - REPORT_PAGE_SIZE))
						}
						className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
						style={{ borderColor: "#e5e5e5", color: "#0a0a0a" }}
					>
						Previous
					</button>
					<p className="text-xs" style={{ color: "#737373" }}>
						Page {page} of {pageCount}
					</p>
					<button
						type="button"
						disabled={offset + REPORT_PAGE_SIZE >= total || isLoading}
						onClick={() => onOffsetChange(offset + REPORT_PAGE_SIZE)}
						className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
						style={{ borderColor: "#e5e5e5", color: "#0a0a0a" }}
					>
						Next
					</button>
				</div>
			)}
		</div>
	);
}

/** Standard export button for report toolbars. */
export function ExportCsvButton({
	onClick,
	disabled,
	exporting,
}: {
	onClick: () => void;
	disabled?: boolean;
	exporting?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || exporting}
			className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
			style={{ borderColor: "#e5e5e5", background: "#fff", color: "#0a0a0a" }}
		>
			{exporting ? "Exporting…" : "Export CSV"}
		</button>
	);
}
