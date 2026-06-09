import type { CsvParams, WindowKey } from "./types";

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

export function buildCsv({
	window: win,
	kpis,
	series,
	topTrainers,
}: CsvParams): string {
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
		lines.push(
			csvRow("Total Revenue (RM)", (kpis.totalSales / 100).toFixed(2)),
		);
		lines.push(
			csvRow(
				"Prev Period Revenue (RM)",
				(kpis.previousPeriodSales / 100).toFixed(2),
			),
		);
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
			lines.push(
				csvRow(b.branchName ?? "Unknown", (b.totalRevenue / 100).toFixed(2)),
			);
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

export function triggerCsvDownload(csv: string, window: WindowKey): void {
	const date = new Date().toISOString().slice(0, 10);
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `avantej-report-${window}-${date}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}
