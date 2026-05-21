import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { ScheduleReportDialog } from "@/components/reports/schedule-report-dialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/reports/view",
)({
	beforeLoad: async () => {
		await requirePermission("reports:read");
	},
	component: ReportsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type WindowKey = "7D" | "30D" | "90D" | "YTD";

const WINDOW_LABELS: WindowKey[] = ["7D", "30D", "90D", "YTD"];

// Map window to the period enum expected by getDashboardKpis
const WINDOW_TO_PERIOD: Record<
	WindowKey,
	"today" | "this_week" | "this_month" | "this_year"
> = {
	"7D": "this_week",
	"30D": "this_month",
	"90D": "this_month",
	YTD: "this_year",
};

// Map window to days for getRevenueSeries (max 90 in the API)
const WINDOW_TO_DAYS: Record<WindowKey, 7 | 30 | 90> = {
	"7D": 7,
	"30D": 30,
	"90D": 90,
	YTD: 90, // resolved dynamically below via ytdDays()
};

function ytdDays(): number {
	const start = new Date(new Date().getFullYear(), 0, 1);
	return Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMYR(cents: number): string {
	const rm = cents / 100;
	if (rm >= 1_000_000) return `RM ${(rm / 1_000_000).toFixed(1)}M`;
	if (rm >= 1_000) return `RM ${(rm / 1_000).toFixed(1)}k`;
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
		maximumFractionDigits: 0,
	}).format(rm);
}

function fmtMYRFull(cents: number): string {
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
		maximumFractionDigits: 0,
	}).format(cents / 100);
}

function deltaPct(current: number, prev: number): number | null {
	if (prev === 0) return null;
	return ((current - prev) / prev) * 100;
}

function initials(name: string | null, fallback: string): string {
	if (!name) return fallback.slice(0, 2).toUpperCase();
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/** Quote a cell value if it contains commas, double-quotes, or newlines. */
function csvCell(value: string | number): string {
	const s = String(value);
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function csvRow(...cells: (string | number)[]): string {
	return cells.map(csvCell).join(",");
}

interface CsvParams {
	window: WindowKey;
	kpis: {
		totalSales: number;
		previousPeriodSales: number;
		activeMembersCount: number;
		completedAppointments: number;
		totalAppointments: number;
		from: Date | string;
		to: Date | string;
		revenueByBranch: { branchName: string | null; totalRevenue: number }[];
	} | null | undefined;
	series: { date: string; revenueCents: number }[];
	topTrainers: {
		staffId: string;
		staffName: string | null;
		appointmentsCompleted: number;
		totalCommission: number;
	}[];
}

function buildCsv({ window: win, kpis, series, topTrainers }: CsvParams): string {
	const lines: string[] = [];
	const generatedAt = new Date().toISOString();
	const fromDate = kpis ? new Date(kpis.from).toLocaleDateString("en-MY") : "—";
	const toDate = kpis ? new Date(kpis.to).toLocaleDateString("en-MY") : "—";

	lines.push(csvCell("# Avantej Performance Report"));
	lines.push(csvRow("# Generated:", generatedAt));
	lines.push(csvRow("# Window:", win));
	lines.push(csvRow("# Period:", `${fromDate} – ${toDate}`));
	lines.push("");

	// KPIs section
	lines.push(csvCell("## KPIs"));
	lines.push(csvRow("Metric", "Value"));
	if (kpis) {
		lines.push(csvRow("Total Revenue (RM)", (kpis.totalSales / 100).toFixed(2)));
		lines.push(csvRow("Prev Period Revenue (RM)", (kpis.previousPeriodSales / 100).toFixed(2)));
		lines.push(csvRow("Active Members", kpis.activeMembersCount));
		lines.push(csvRow("Completed Appointments", kpis.completedAppointments));
		lines.push(csvRow("Total Appointments", kpis.totalAppointments));
	} else {
		lines.push(csvRow("(no data)", ""));
	}
	lines.push("");

	// Revenue series section
	lines.push(csvCell("## Revenue Series"));
	lines.push(csvRow("Date", "Revenue (RM)"));
	if (series.length > 0) {
		for (const p of series) {
			lines.push(csvRow(p.date, (p.revenueCents / 100).toFixed(2)));
		}
	} else {
		lines.push(csvRow("(no data)", ""));
	}
	lines.push("");

	// Revenue by branch section
	lines.push(csvCell("## Revenue by Branch"));
	lines.push(csvRow("Branch", "Revenue (RM)"));
	if (kpis && kpis.revenueByBranch.length > 0) {
		for (const b of [...kpis.revenueByBranch].sort(
			(a, z) => z.totalRevenue - a.totalRevenue,
		)) {
			lines.push(csvRow(b.branchName ?? "Unknown", (b.totalRevenue / 100).toFixed(2)));
		}
	} else {
		lines.push(csvRow("(no data)", ""));
	}
	lines.push("");

	// Top trainers section
	lines.push(csvCell("## Top Trainers"));
	lines.push(csvRow("Name", "Sessions", "Commission (RM)"));
	if (topTrainers.length > 0) {
		for (const t of topTrainers) {
			lines.push(
				csvRow(
					t.staffName ?? t.staffId,
					t.appointmentsCompleted,
					(t.totalCommission / 100).toFixed(2),
				),
			);
		}
	} else {
		lines.push(csvRow("(no data)", "", ""));
	}

	return lines.join("\n");
}

function triggerCsvDownload(csv: string, window: WindowKey): void {
	const date = new Date().toISOString().slice(0, 10);
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `avantej-report-${window}-${date}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

async function downloadPdf(params: CsvParams): Promise<void> {
	// Dynamic import keeps jspdf out of the initial bundle.
	const { jsPDF } = await import("jspdf");
	const autoTable = (await import("jspdf-autotable")).default;

	const { window: win, kpis, series, topTrainers } = params;
	const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
	const generatedAt = new Date().toLocaleString("en-MY");
	const fromDate = kpis ? new Date(kpis.from).toLocaleDateString("en-MY") : "—";
	const toDate = kpis ? new Date(kpis.to).toLocaleDateString("en-MY") : "—";

	// Header
	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text("Avantej Performance Report", 40, 50);
	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(115);
	doc.text(`Generated: ${generatedAt}`, 40, 70);
	doc.text(`Window: ${win}`, 40, 84);
	doc.text(`Period: ${fromDate} – ${toDate}`, 40, 98);
	doc.setTextColor(0);

	let cursorY = 120;

	// KPIs table
	autoTable(doc, {
		startY: cursorY,
		head: [["Metric", "Value"]],
		body: kpis
			? [
					["Total Revenue (RM)", (kpis.totalSales / 100).toFixed(2)],
					[
						"Prev Period Revenue (RM)",
						(kpis.previousPeriodSales / 100).toFixed(2),
					],
					["Active Members", String(kpis.activeMembersCount)],
					["Completed Appointments", String(kpis.completedAppointments)],
					["Total Appointments", String(kpis.totalAppointments)],
				]
			: [["(no data)", ""]],
		theme: "striped",
		headStyles: { fillColor: [10, 10, 10] },
		styles: { fontSize: 10 },
		didDrawPage: (data) => {
			cursorY = data.cursor?.y ?? cursorY;
		},
	});
	cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } })
		.lastAutoTable!.finalY + 20;

	// Revenue by branch
	const branchRows =
		kpis && kpis.revenueByBranch.length > 0
			? [...kpis.revenueByBranch]
					.sort((a, z) => z.totalRevenue - a.totalRevenue)
					.map((b) => [b.branchName ?? "Unknown", (b.totalRevenue / 100).toFixed(2)])
			: [["(no data)", ""]];

	doc.setFontSize(12);
	doc.setFont("helvetica", "bold");
	doc.text("Revenue by Branch", 40, cursorY);
	cursorY += 8;
	autoTable(doc, {
		startY: cursorY,
		head: [["Branch", "Revenue (RM)"]],
		body: branchRows,
		theme: "striped",
		headStyles: { fillColor: [10, 10, 10] },
		styles: { fontSize: 10 },
	});
	cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } })
		.lastAutoTable!.finalY + 20;

	// Top trainers
	const trainerRows =
		topTrainers.length > 0
			? topTrainers.map((t) => [
					t.staffName ?? t.staffId,
					String(t.appointmentsCompleted),
					(t.totalCommission / 100).toFixed(2),
				])
			: [["(no data)", "", ""]];

	doc.setFontSize(12);
	doc.setFont("helvetica", "bold");
	doc.text("Top Trainers", 40, cursorY);
	cursorY += 8;
	autoTable(doc, {
		startY: cursorY,
		head: [["Name", "Sessions", "Commission (RM)"]],
		body: trainerRows,
		theme: "striped",
		headStyles: { fillColor: [10, 10, 10] },
		styles: { fontSize: 10 },
	});
	cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } })
		.lastAutoTable!.finalY + 20;

	// Revenue series (truncated to keep PDF compact for long windows)
	if (series.length > 0) {
		const seriesRows = series.map((p) => [
			p.date,
			(p.revenueCents / 100).toFixed(2),
		]);
		doc.setFontSize(12);
		doc.setFont("helvetica", "bold");
		doc.text("Revenue Series", 40, cursorY);
		cursorY += 8;
		autoTable(doc, {
			startY: cursorY,
			head: [["Date", "Revenue (RM)"]],
			body: seriesRows,
			theme: "striped",
			headStyles: { fillColor: [10, 10, 10] },
			styles: { fontSize: 9 },
		});
	}

	const date = new Date().toISOString().slice(0, 10);
	doc.save(`avantej-report-${win}-${date}.pdf`);
}

// ─── SVG Sparkline helper ─────────────────────────────────────────────────────

/**
 * Converts an array of numbers into SVG polyline points within the given
 * viewBox dimensions. Returns both the stroke path and the filled area polygon.
 */
function buildSparklinePaths(
	values: number[],
	w = 80,
	h = 24,
	padY = 2,
): { line: string; area: string } {
	if (values.length < 2)
		return { line: `0,${h / 2} ${w},${h / 2}`, area: "" };

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;

	const pts = values.map((v, i) => {
		const x = (i / (values.length - 1)) * w;
		const y = padY + ((1 - (v - min) / range) * (h - padY * 2));
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});

	const line = pts.join(" ");
	const first = pts[0];
	const last = pts[pts.length - 1];
	const lastX = last.split(",")[0];
	const area = `${first} ${pts.slice(1).join(" ")} ${lastX},${h} 0,${h}`;
	return { line, area };
}

// ─── Area chart helper for revenue trend ─────────────────────────────────────

function buildAreaChart(
	values: number[],
	w = 640,
	h = 160,
	padY = 8,
): { line: string; area: string } {
	if (values.length < 2) return { line: "", area: "" };

	const min = 0;
	const max = Math.max(...values, 1);

	const pts = values.map((v, i) => {
		const x = 18 + (i / (values.length - 1)) * (w - 36);
		const y = padY + ((1 - (v - min) / (max - min)) * (h - padY * 2));
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});

	const line = pts.join(" ");
	const lastX = pts[pts.length - 1].split(",")[0];
	const area = `${pts[0]} ${pts.slice(1).join(" ")} ${lastX},${h} 18,${h}`;
	return { line, area };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KpiTileProps {
	label: string;
	value: string;
	delta: number | null; // percentage points or null
	deltaLabel?: string; // override label e.g. "pp" for percentage points
	sparkValues: number[];
	strokeColor: string;
	fillColor: string;
	stub?: boolean; // shows "—" with a stub notice
	noSparkline?: boolean; // hides the sparkline entirely (no synthetic data)
}

function KpiTile({
	label,
	value,
	delta,
	deltaLabel = "%",
	sparkValues,
	strokeColor,
	fillColor,
	stub = false,
	noSparkline = false,
}: KpiTileProps) {
	const { line, area } = buildSparklinePaths(sparkValues);

	const hasDelta = delta !== null;
	const isPositive = delta !== null && delta >= 0;
	const absD = delta !== null ? Math.abs(delta).toFixed(1) : "—";

	return (
		<div
			className="rounded-2xl border p-5"
			style={{ background: "#fff", borderColor: "#e5e5e5" }}
		>
			<p
				className="mb-2 text-[10px] font-bold uppercase tracking-widest"
				style={{ color: "#737373" }}
			>
				{label}
			</p>
			<p
				className="font-mono text-2xl font-bold tabular-nums"
				style={{ color: "#0a0a0a" }}
			>
				{stub ? "—" : value}
			</p>
			<div className="mt-1 flex items-center gap-1.5">
				{stub ? (
					<span
						className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
						style={{ background: "#f5f0e8", color: "#78644a" }}
					>
						No data
					</span>
				) : hasDelta ? (
					<>
						<span
							className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
							style={{
								background: isPositive ? "#dcfce7" : "#fee2e2",
								color: isPositive ? "#15803d" : "#b91c1c",
							}}
						>
							{isPositive ? "▲" : "▼"} {absD}
							{deltaLabel}
						</span>
						<span className="text-[11px]" style={{ color: "#737373" }}>
							vs prev
						</span>
					</>
				) : (
					<span className="text-[11px]" style={{ color: "#a3a3a3" }}>
						vs prev
					</span>
				)}
			</div>
			{noSparkline ? (
				<p className="mt-3 font-mono text-[20px] font-bold" style={{ color: "#a3a3a3" }}>
					—
				</p>
			) : (
				<svg viewBox="0 0 80 24" className="mt-3 w-full" height="24">
					{area && (
						<polygon
							points={area}
							fill={fillColor}
							fillOpacity="0.10"
						/>
					)}
					<polyline
						points={line}
						fill="none"
						stroke={strokeColor}
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</div>
	);
}

// Download icon SVG
function DownloadIcon() {
	return (
		<svg
			className="size-3.5"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M8 2v9M4 8l4 3 4-3" />
			<path d="M2 13h12" />
		</svg>
	);
}

// Calendar icon
function CalIcon() {
	return (
		<svg
			className="size-3.5"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
		>
			<rect x="2" y="3" width="12" height="11" rx="2" />
			<path d="M5 1v3M11 1v3M2 7h12" />
		</svg>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ReportsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const [window, setWindow] = useState<WindowKey>("30D");

	const period = WINDOW_TO_PERIOD[window];
	// For YTD, compute true days since Jan 1; API caps at 90 so clamp there.
	const seriesDays: 7 | 30 | 90 =
		window === "YTD"
			? (Math.min(ytdDays(), 90) as 7 | 30 | 90)
			: WINDOW_TO_DAYS[window];

	// ── KPIs ──
	const {
		data: kpis,
		isLoading: kpisLoading,
		isError: kpisError,
		refetch: refetchKpis,
	} = useQuery({
		queryKey: ["reports.kpis", organizationId, period],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.analytics.getDashboardKpis({ organizationId, period });
		},
		enabled: !!organizationId,
	});

	// ── Revenue series ──
	const {
		data: series = [],
		isLoading: seriesLoading,
	} = useQuery({
		queryKey: ["reports.series", organizationId, seriesDays],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getRevenueSeries({
				organizationId,
				days: seriesDays,
			});
		},
		enabled: !!organizationId,
	});

	// ── Member count series ──
	const { data: memberSeries = [] } = useQuery({
		queryKey: ["reports.memberSeries", organizationId, seriesDays],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getMemberCountSeries({
				organizationId,
				days: seriesDays,
			});
		},
		enabled: !!organizationId,
	});

	// ── Churn series ──
	const { data: churnSeries = [] } = useQuery({
		queryKey: ["reports.churnSeries", organizationId, seriesDays],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getChurnSeries({
				organizationId,
				days: seriesDays,
			});
		},
		enabled: !!organizationId,
	});

	// ── LTV series ──
	const { data: ltvSeries = [] } = useQuery({
		queryKey: ["reports.ltvSeries", organizationId, seriesDays],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getLtvSeries({
				organizationId,
				days: seriesDays,
			});
		},
		enabled: !!organizationId,
	});

	// ── Class fill rate series ──
	const { data: fillSeries = [] } = useQuery({
		queryKey: ["reports.fillSeries", organizationId, seriesDays],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getClassFillRateSeries({
				organizationId,
				days: seriesDays,
			});
		},
		enabled: !!organizationId,
	});

	// ── Staff performance ──
	const {
		data: staff = [],
		isLoading: staffLoading,
		isError: staffError,
	} = useQuery({
		queryKey: ["reports.staff", organizationId, period],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getStaffPerformance({ organizationId, period });
		},
		enabled: !!organizationId,
	});

	// ── Derived values ──
	const revenueDelta = useMemo(
		() =>
			kpis
				? deltaPct(kpis.totalSales, kpis.previousPeriodSales)
				: null,
		[kpis],
	);

	const seriesValues = useMemo(
		() => series.map((p) => p.revenueCents),
		[series],
	);

	// Member count series
	const memberSeriesValues = useMemo(
		() => memberSeries.map((p) => p.activeMembers),
		[memberSeries],
	);
	const memberLatest = memberSeriesValues[memberSeriesValues.length - 1] ?? kpis?.activeMembersCount ?? 0;
	const memberFirst = memberSeriesValues[0] ?? 0;
	const memberDelta = useMemo(
		() => deltaPct(memberLatest, memberFirst),
		[memberLatest, memberFirst],
	);

	// Churn series
	const churnSeriesValues = useMemo(
		() => churnSeries.map((p) => p.churnPct),
		[churnSeries],
	);
	const churnLatest = churnSeriesValues[churnSeriesValues.length - 1] ?? kpis?.churnRatePct ?? 0;
	const churnFirst = churnSeriesValues[0] ?? 0;
	// For churn, lower is better — so delta sign is inverted for badge colour
	// but we still compute first-to-last numerically (positive = churn rose = bad)
	const churnDelta = useMemo(
		() => deltaPct(churnLatest, churnFirst),
		[churnLatest, churnFirst],
	);

	// LTV series
	const ltvSeriesValues = useMemo(
		() => ltvSeries.map((p) => p.avgLtvCents),
		[ltvSeries],
	);
	const ltvLatest = ltvSeriesValues[ltvSeriesValues.length - 1] ?? kpis?.avgLtvCents ?? 0;
	const ltvFirst = ltvSeriesValues[0] ?? 0;
	const ltvDelta = useMemo(
		() => deltaPct(ltvLatest, ltvFirst),
		[ltvLatest, ltvFirst],
	);

	// Fill rate series
	const fillSeriesValues = useMemo(
		() => fillSeries.map((p) => p.fillRatePct),
		[fillSeries],
	);
	const fillLatest = fillSeriesValues[fillSeriesValues.length - 1] ?? kpis?.classFillRatePct ?? 0;
	const fillFirst = fillSeriesValues[0] ?? 0;
	const fillDelta = useMemo(
		() => deltaPct(fillLatest, fillFirst),
		[fillLatest, fillFirst],
	);

	// Build month labels for series x-axis
	const seriesLabels = useMemo(() => {
		if (series.length === 0) return [];
		// Show at most 12 evenly-spaced labels
		const step = Math.max(1, Math.floor(series.length / 12));
		return series
			.filter((_, i) => i % step === 0 || i === series.length - 1)
			.map((p) => {
				const d = new Date(p.date);
				return {
					label: d.toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
					x: 18 + (series.indexOf(p) / Math.max(series.length - 1, 1)) * (640 - 36),
				};
			});
	}, [series]);

	// Revenue chart paths
	const { line: chartLine, area: chartArea } = useMemo(
		() => buildAreaChart(seriesValues),
		[seriesValues],
	);

	// Revenue max for y-axis labels
	const revenueMax = useMemo(
		() => Math.max(...seriesValues, 1),
		[seriesValues],
	);

	// Top services from revenueByBranch — used as a proxy for service breakdown
	const topBranches = useMemo(() => {
		if (!kpis) return [];
		const sorted = [...kpis.revenueByBranch].sort(
			(a, b) => b.totalRevenue - a.totalRevenue,
		);
		const total = sorted.reduce((s, r) => s + r.totalRevenue, 0) || 1;
		return sorted.slice(0, 5).map((r) => ({
			name: r.branchName ?? "Unknown",
			revenue: r.totalRevenue,
			pct: Math.round((r.totalRevenue / total) * 100),
		}));
	}, [kpis]);

	// Top trainers sorted by commission desc (max 4)
	const topTrainers = useMemo(
		() =>
			[...staff]
				.sort((a, b) => b.totalCommission - a.totalCommission)
				.slice(0, 4),
		[staff],
	);

	// ── CSV export ──
	const isExportLoading = kpisLoading || seriesLoading || staffLoading;

	const handleExportCsv = useCallback(() => {
		try {
			const csv = buildCsv({ window, kpis, series, topTrainers });
			triggerCsvDownload(csv, window);
			toast.success("Report downloaded as CSV");
		} catch {
			toast.error("Failed to generate CSV");
		}
	}, [window, kpis, series, topTrainers]);

	const handleExportPdf = useCallback(async () => {
		try {
			await downloadPdf({ window, kpis, series, topTrainers });
			toast.success("Report downloaded as PDF");
		} catch (error) {
			console.error("PDF export error:", error);
			toast.error("Failed to generate PDF");
		}
	}, [window, kpis, series, topTrainers]);

	const [scheduleOpen, setScheduleOpen] = useState(false);

	// Avatar accent palette (cycles)
	const AVATAR_COLORS = [
		{ bg: "#fef3c7", text: "#b45309" },
		{ bg: "#dbeafe", text: "#1d4ed8" },
		{ bg: "#dcfce7", text: "#15803d" },
		{ bg: "#fee2e2", text: "#b91c1c" },
	];

	if (!organizationId) {
		return (
			<div className="space-y-4" style={{ color: "#0a0a0a" }}>
				<h1 className="text-2xl font-extrabold tracking-tight">
					Performance Report
				</h1>
				<p style={{ color: "#737373" }}>No organisation selected.</p>
			</div>
		);
	}

	const isLoading = kpisLoading || seriesLoading;

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] px-7 py-8">
			<div className="space-y-6" style={{ color: "#0a0a0a" }}>
				{/* ── Page header ── */}
			<div className="flex flex-wrap items-center gap-3">
				<div>
					<h1 className="text-[22px] font-extrabold tracking-tight">
						Performance Report
					</h1>
					<p className="mt-0.5 text-sm" style={{ color: "#737373" }}>
						{kpis
							? `${new Date(kpis.from).toLocaleDateString("en-MY", { month: "short", day: "numeric" })} – ${new Date(kpis.to).toLocaleDateString("en-MY", { month: "short", day: "numeric", year: "numeric" })}`
							: "Loading…"}
					</p>
				</div>

				<div className="ml-auto flex flex-wrap items-center gap-2">
					{/* Period switcher */}
					<div
						className="flex items-center gap-0.5 rounded-xl border p-1"
						style={{ borderColor: "#e5e5e5", background: "#fff" }}
					>
						{WINDOW_LABELS.map((w) => (
							<button
								key={w}
								type="button"
								onClick={() => setWindow(w)}
								className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
								style={
									window === w
										? { background: "#0a0a0a", color: "#fff" }
										: { color: "#737373" }
								}
							>
								{w}
							</button>
						))}
					</div>

					{/* Export buttons */}
					<button
						type="button"
						disabled={isExportLoading}
						onClick={handleExportPdf}
						className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
						style={{ borderColor: "#e5e5e5", background: "#fff", color: "#0a0a0a" }}
						title="Export as PDF"
					>
						<DownloadIcon /> PDF
					</button>
					<button
						type="button"
						disabled={isExportLoading}
						onClick={handleExportCsv}
						className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
						style={{ borderColor: "#e5e5e5", background: "#fff", color: "#0a0a0a" }}
						title="Export as CSV"
					>
						<DownloadIcon /> CSV
					</button>
					<button
						type="button"
						onClick={() => setScheduleOpen(true)}
						className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition hover:opacity-80"
						style={{ background: "#0a0a0a", color: "#fff" }}
						title="Schedule recurring email report"
					>
						<CalIcon /> Schedule Email
					</button>
				</div>
			</div>

			{/* ── Error state ── */}
			{kpisError && (
				<StatusCallout
					variant="error"
					title="Couldn't load KPIs"
					onRetry={() => refetchKpis()}
				/>
			)}

			{/* ── Loading state ── */}
			{isLoading && !kpis && <PageLoader />}

			{/* ── KPI tiles ── */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
				{/* 1. MRR / Total Revenue — real data */}
				<KpiTile
					label="Revenue"
					value={kpis ? fmtMYR(kpis.totalSales) : "—"}
					delta={kpis ? revenueDelta : null}
					sparkValues={seriesValues.length > 0 ? seriesValues : [0, 0]}
					strokeColor="#15803d"
					fillColor="#15803d"
				/>

				{/* 2. Active Members — real count + time-series */}
				<KpiTile
					label="Active Members"
					value={memberLatest > 0 ? memberLatest.toLocaleString() : kpis ? kpis.activeMembersCount.toLocaleString() : "—"}
					delta={memberSeriesValues.length >= 2 ? memberDelta : null}
					sparkValues={memberSeriesValues.length > 1 ? memberSeriesValues : [0, 0]}
					strokeColor="#2563eb"
					fillColor="#2563eb"
				/>

				{/* 3. Churn Rate — real time-series */}
				<KpiTile
					label="Churn Rate"
					value={churnSeries.length > 0 ? `${churnLatest.toFixed(1)}%` : kpis ? `${kpis.churnRatePct.toFixed(1)}%` : "—"}
					delta={churnSeriesValues.length >= 2 ? churnDelta : null}
					deltaLabel="pp"
					sparkValues={churnSeriesValues.length > 1 ? churnSeriesValues : [0, 0]}
					strokeColor="#dc2626"
					fillColor="#dc2626"
				/>

				{/* 4. Avg Member LTV — real time-series */}
				<KpiTile
					label="Avg Member LTV"
					value={ltvSeries.length > 0 ? fmtMYR(ltvLatest) : kpis ? fmtMYR(kpis.avgLtvCents) : "—"}
					delta={ltvSeriesValues.length >= 2 ? ltvDelta : null}
					sparkValues={ltvSeriesValues.length > 1 ? ltvSeriesValues : [0, 0]}
					strokeColor="#7c3aed"
					fillColor="#7c3aed"
				/>

				{/* 5. Class Fill Rate — real time-series */}
				<KpiTile
					label="Class Fill Rate"
					value={fillSeries.length > 0 ? `${fillLatest.toFixed(1)}%` : kpis ? `${kpis.classFillRatePct.toFixed(1)}%` : "—"}
					delta={fillSeriesValues.length >= 2 ? fillDelta : null}
					deltaLabel="pp"
					sparkValues={fillSeriesValues.length > 1 ? fillSeriesValues : [0, 0]}
					strokeColor="#d97706"
					fillColor="#d97706"
				/>

				{/* NPS removed — see apps/web/src/_future/nps-reports.md */}
			</div>

			{/* ── Revenue chart + right column ── */}
			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
				{/* Revenue trend area chart */}
				<div
					className="rounded-2xl border p-6"
					style={{ background: "#fff", borderColor: "#e5e5e5" }}
				>
					<div className="mb-5 flex items-center justify-between">
						<div>
							<p className="text-[15px] font-bold">Revenue Trend</p>
							<p className="mt-0.5 text-xs" style={{ color: "#737373" }}>
								Last {seriesDays} days
							</p>
						</div>
						<div className="flex items-center gap-4">
							<span className="flex items-center gap-1.5 text-xs" style={{ color: "#737373" }}>
								<span
									className="inline-block size-2.5 rounded-full"
									style={{ background: "#0a0a0a" }}
								/>
								Actual
							</span>
						</div>
					</div>

					{seriesLoading ? (
						<div
							className="h-[200px] w-full rounded-xl"
							style={{ background: "#f3f3f3" }}
						/>
					) : (
						<svg viewBox="0 0 680 180" className="w-full" height="200">
							{/* Grid lines */}
							<line x1="0" y1="160" x2="680" y2="160" stroke="#e5e5e5" strokeWidth="1" />
							<line x1="0" y1="120" x2="680" y2="120" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 3" />
							<line x1="0" y1="80" x2="680" y2="80" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 3" />
							<line x1="0" y1="40" x2="680" y2="40" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 3" />

							{/* Y-axis labels */}
							<text x="2" y="163" fontSize="9" fill="#a3a3a3">0</text>
							<text x="2" y="123" fontSize="9" fill="#a3a3a3">
								{fmtMYR(Math.round(revenueMax * 0.33))}
							</text>
							<text x="2" y="83" fontSize="9" fill="#a3a3a3">
								{fmtMYR(Math.round(revenueMax * 0.67))}
							</text>
							<text x="2" y="43" fontSize="9" fill="#a3a3a3">
								{fmtMYR(revenueMax)}
							</text>

							{/* X-axis date labels */}
							{seriesLabels.map(({ label, x }, i) => (
								<text
									key={i}
									x={x}
									y="175"
									fontSize="9"
									fill="#a3a3a3"
									textAnchor="middle"
								>
									{label}
								</text>
							))}

							{/* Area fill */}
							{chartArea && (
								<polygon
									points={chartArea}
									fill="#0a0a0a"
									fillOpacity="0.06"
								/>
							)}

							{/* Area line */}
							{chartLine && (
								<polyline
									points={chartLine}
									fill="none"
									stroke="#0a0a0a"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							)}

							{/* Latest point dot */}
							{seriesValues.length > 0 && (() => {
								const lastX = 18 + (640 - 36);
								const lastVal = seriesValues[seriesValues.length - 1] ?? 0;
								const maxV = Math.max(...seriesValues, 1);
								const lastY = 8 + (1 - lastVal / maxV) * (160 - 16);
								return (
									<>
										<circle cx={lastX} cy={lastY} r="4" fill="#0a0a0a" />
										<circle cx={lastX} cy={lastY} r="7" fill="#0a0a0a" fillOpacity="0.12" />
										<line
											x1={lastX} y1={lastY}
											x2={lastX} y2="160"
											stroke="#0a0a0a"
											strokeWidth="1"
											strokeDasharray="3 2"
											opacity="0.2"
										/>
									</>
								);
							})()}
						</svg>
					)}

					{/* Summary strip */}
					<div
						className="mt-4 flex flex-wrap items-center gap-6 border-t pt-4"
						style={{ borderColor: "#e5e5e5" }}
					>
						<div>
							<p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#737373" }}>
								This period
							</p>
							<p className="mt-1 font-mono text-[15px] font-bold tabular-nums">
								{kpis ? fmtMYRFull(kpis.totalSales) : "—"}
							</p>
						</div>
						<div>
							<p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#737373" }}>
								Prev period
							</p>
							<p className="mt-1 font-mono text-[15px] font-bold tabular-nums">
								{kpis ? fmtMYRFull(kpis.previousPeriodSales) : "—"}
							</p>
						</div>
						<div>
							<p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#737373" }}>
								Appointments
							</p>
							<p className="mt-1 font-mono text-[15px] font-bold tabular-nums">
								{kpis ? `${kpis.completedAppointments} / ${kpis.totalAppointments}` : "—"}
							</p>
						</div>
					</div>
				</div>

				{/* Right column */}
				<div className="flex flex-col gap-5">
					{/* Top Branches (revenue breakdown) */}
					<div
						className="flex-1 rounded-2xl border p-5"
						style={{ background: "#fff", borderColor: "#e5e5e5" }}
					>
						<p className="mb-4 text-[14px] font-bold">Revenue by Branch</p>
						{kpisLoading ? (
							<div className="space-y-3">
								{[1, 2, 3].map((i) => (
									<div key={i} className="h-6 rounded" style={{ background: "#f3f3f3" }} />
								))}
							</div>
						) : topBranches.length === 0 ? (
							<p className="text-xs" style={{ color: "#a3a3a3" }}>
								No revenue data for this period.
							</p>
						) : (
							<div className="space-y-3">
								{topBranches.map((b) => (
									<div key={b.name}>
										<div className="mb-1.5 flex justify-between text-[12px]">
											<span className="font-medium truncate max-w-[140px]">{b.name}</span>
											<span className="font-mono font-semibold tabular-nums">
												{fmtMYR(b.revenue)}
											</span>
										</div>
										<div
											className="h-1.5 overflow-hidden rounded-full"
											style={{ background: "#e5e5e5" }}
										>
											<div
												className="h-full rounded-full transition-all"
												style={{ width: `${b.pct}%`, background: "#0a0a0a" }}
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Top Trainers */}
					<div
						className="flex-1 rounded-2xl border p-5"
						style={{ background: "#fff", borderColor: "#e5e5e5" }}
					>
						<p className="mb-4 text-[14px] font-bold">Top Trainers</p>
						{staffLoading ? (
							<div className="space-y-3">
								{[1, 2, 3].map((i) => (
									<div key={i} className="h-8 rounded" style={{ background: "#f3f3f3" }} />
								))}
							</div>
						) : staffError ? (
							<p className="text-xs" style={{ color: "#b91c1c" }}>
								Failed to load staff data.
							</p>
						) : topTrainers.length === 0 ? (
							<p className="text-xs" style={{ color: "#a3a3a3" }}>
								No completed appointments in this period.
							</p>
						) : (
							<div className="space-y-3">
								{topTrainers.map((t, idx) => {
									const colors = AVATAR_COLORS[idx % AVATAR_COLORS.length];
									const name = t.staffName ?? t.staffId;
									const ini = initials(t.staffName, t.staffId);
									return (
										<div key={t.staffId} className="flex items-center gap-3">
											<div
												className="size-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
												style={{
													background: colors.bg,
													color: colors.text,
												}}
											>
												{ini}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-[13px] font-semibold">
													{name}
												</p>
												<p className="text-[11px]" style={{ color: "#737373" }}>
													{t.appointmentsCompleted} appts
													{/* fill rate + NPS: stub — no API */}
												</p>
											</div>
											<span className="font-mono text-[12px] font-bold tabular-nums">
												{fmtMYR(t.totalCommission)}
											</span>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</div>
			</div>

			{organizationId && (
				<ScheduleReportDialog
					open={scheduleOpen}
					onOpenChange={setScheduleOpen}
					organizationId={organizationId}
					currentWindow={window}
				/>
			)}
		</div>
	);
}
