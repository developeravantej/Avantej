import type { CsvParams } from "./types";

export async function downloadPdf(params: CsvParams): Promise<void> {
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
	cursorY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!
			.finalY + 20;

	// Revenue by branch
	const branchRows =
		kpis && kpis.revenueByBranch.length > 0
			? [...kpis.revenueByBranch]
					.sort((a, z) => z.totalRevenue - a.totalRevenue)
					.map((b) => [
						b.branchName ?? "Unknown",
						(b.totalRevenue / 100).toFixed(2),
					])
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
	cursorY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!
			.finalY + 20;

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
	cursorY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!
			.finalY + 20;

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
