import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CsvParams } from "@/components/pages/reports/types";
import {
	buildCsv,
	triggerCsvDownload,
} from "@/components/pages/reports/export-csv";

// ---------------------------------------------------------------------------
// jspdf / jspdf-autotable mocks (export-pdf.ts dynamic-imports BOTH — the
// reports export still uses jsPDF even though the print-documents jsPDF path
// was deleted; verified against apps/web package.json deps).
// ---------------------------------------------------------------------------

const { jsPDFCtor, docSpies, autoTableMock } = vi.hoisted(() => {
	const docSpies = {
		setFontSize: vi.fn(),
		setFont: vi.fn(),
		setTextColor: vi.fn(),
		text: vi.fn(),
		save: vi.fn(),
		lastAutoTable: undefined as { finalY: number } | undefined,
	};
	// Must be `function` (not arrow) so `new jsPDF(...)` works; a constructor
	// returning an object substitutes that object for `this`.
	const jsPDFCtor = vi.fn(function jsPDFMock() {
		return docSpies;
	});
	type AutoTableOpts = {
		startY?: number;
		head?: string[][];
		body?: string[][];
		didDrawPage?: (data: { cursor?: { y: number } }) => void;
	};
	// autoTable stamps lastAutoTable the way the real lib does, so export-pdf's
	// cursor arithmetic keeps working.
	const autoTableMock = vi.fn((doc: typeof docSpies, opts: AutoTableOpts) => {
		doc.lastAutoTable = { finalY: (opts.startY ?? 0) + 50 };
	});
	return { jsPDFCtor, docSpies, autoTableMock };
});

vi.mock("jspdf", () => ({ jsPDF: jsPDFCtor }));
vi.mock("jspdf-autotable", () => ({ default: autoTableMock }));

import { downloadPdf } from "@/components/pages/reports/export-pdf";

// ---------------------------------------------------------------------------
// Fixtures — money values are integer cents.
// ---------------------------------------------------------------------------

function makeParams(over: Partial<CsvParams> = {}): CsvParams {
	return {
		window: "30D",
		kpis: {
			totalSales: 123456, // cents → RM 1234.56
			previousPeriodSales: 99900, // cents → RM 999.00
			activeMembersCount: 42,
			completedAppointments: 10,
			totalAppointments: 12,
			from: "2026-06-01T00:00:00.000Z",
			to: "2026-06-30T23:59:59.999Z",
			revenueByBranch: [
				// Branch name with comma + quotes — must be CSV-escaped.
				{ branchName: 'Kota Kinabalu, "HQ"', totalRevenue: 50050 },
				{ branchName: "Penang", totalRevenue: 73406 },
			],
		},
		series: [
			{ date: "2026-06-01", revenueCents: 10001 },
			{ date: "2026-06-02", revenueCents: 250 },
		],
		topTrainers: [
			{
				staffId: "staff-1",
				staffName: "Ahmad, Firdaus", // comma → must be quoted
				appointmentsCompleted: 7,
				totalCommission: 12345,
			},
		],
		...over,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	docSpies.lastAutoTable = undefined;
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

describe("reports export-csv — buildCsv", () => {
	it("renders money from integer cents with 2 decimals", () => {
		const csv = buildCsv(makeParams());
		expect(csv).toContain("Total Revenue (RM),1234.56");
		expect(csv).toContain("Prev Period Revenue (RM),999.00");
		// Series rows: 10001 cents → 100.01; 250 cents → 2.50.
		expect(csv).toContain("2026-06-01,100.01");
		expect(csv).toContain("2026-06-02,2.50");
		// Trainer commission: 12345 cents → 123.45.
		expect(csv).toContain("123.45");
	});

	it("escapes commas and doubles embedded quotes per RFC 4180", () => {
		const csv = buildCsv(makeParams());
		// 'Kota Kinabalu, "HQ"' → quoted cell with "" doubling.
		expect(csv).toContain('"Kota Kinabalu, ""HQ""",500.50');
		// Trainer name with a comma is quoted.
		expect(csv).toContain('"Ahmad, Firdaus",7,123.45');
		// No naked (unquoted) branch cell leaked a raw comma into the row.
		expect(csv).not.toContain('\nKota Kinabalu, "HQ",');
	});

	it("sorts revenue-by-branch descending by revenue", () => {
		const csv = buildCsv(makeParams());
		const penangIdx = csv.indexOf("Penang");
		const kkIdx = csv.indexOf("Kota Kinabalu");
		// Penang (73406) outranks KK (50050).
		expect(penangIdx).toBeGreaterThan(-1);
		expect(kkIdx).toBeGreaterThan(-1);
		expect(penangIdx).toBeLessThan(kkIdx);
	});

	it("emits (no data) placeholders when kpis/series/trainers are empty", () => {
		const csv = buildCsv(
			makeParams({ kpis: null, series: [], topTrainers: [] }),
		);
		expect(csv).toContain("(no data)");
		expect(csv).toContain("## KPIs");
		expect(csv).toContain("## Revenue Series");
		expect(csv).toContain("## Top Trainers");
	});

	it("triggerCsvDownload names the file by window + date", () => {
		globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
		globalThis.URL.revokeObjectURL = vi.fn();
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		const createElement = document.createElement.bind(document);
		let anchor: HTMLAnchorElement | undefined;
		const createSpy = vi
			.spyOn(document, "createElement")
			.mockImplementation((tag: string) => {
				const el = createElement(tag);
				if (tag === "a") anchor = el as HTMLAnchorElement;
				return el;
			});

		triggerCsvDownload("a,b\n1,2", "90D");

		expect(anchor?.download).toMatch(
			/^avantej-report-90D-\d{4}-\d{2}-\d{2}\.csv$/,
		);
		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();

		clickSpy.mockRestore();
		createSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe("reports export-pdf — downloadPdf", () => {
	it("builds the four report tables and saves with the windowed filename", async () => {
		await downloadPdf(makeParams());

		expect(jsPDFCtor).toHaveBeenCalledWith({
			orientation: "portrait",
			unit: "pt",
			format: "a4",
		});
		// KPIs, Revenue by Branch, Top Trainers, Revenue Series.
		expect(autoTableMock).toHaveBeenCalledTimes(4);
		expect(docSpies.save).toHaveBeenCalledTimes(1);
		expect(docSpies.save.mock.calls[0][0]).toMatch(
			/^avantej-report-30D-\d{4}-\d{2}-\d{2}\.pdf$/,
		);
	});

	it("passes cent-derived RM strings into the table bodies", async () => {
		await downloadPdf(makeParams());

		const [kpiCall, branchCall, trainerCall, seriesCall] =
			autoTableMock.mock.calls.map((c) => c[1]);

		expect(kpiCall.head).toEqual([["Metric", "Value"]]);
		expect(kpiCall.body).toContainEqual(["Total Revenue (RM)", "1234.56"]);
		expect(kpiCall.body).toContainEqual(["Prev Period Revenue (RM)", "999.00"]);

		expect(branchCall.head).toEqual([["Branch", "Revenue (RM)"]]);
		// Sorted desc: Penang first.
		expect(branchCall.body?.[0]).toEqual(["Penang", "734.06"]);
		expect(branchCall.body?.[1]).toEqual(['Kota Kinabalu, "HQ"', "500.50"]);

		expect(trainerCall.head).toEqual([["Name", "Sessions", "Commission (RM)"]]);
		expect(trainerCall.body).toContainEqual(["Ahmad, Firdaus", "7", "123.45"]);

		expect(seriesCall.head).toEqual([["Date", "Revenue (RM)"]]);
		expect(seriesCall.body).toContainEqual(["2026-06-01", "100.01"]);
		expect(seriesCall.body).toContainEqual(["2026-06-02", "2.50"]);
	});

	it("skips the series table when the series is empty and renders (no data) rows", async () => {
		await downloadPdf(makeParams({ kpis: null, series: [], topTrainers: [] }));

		// KPIs + branch + trainers only — no 4th (series) table.
		expect(autoTableMock).toHaveBeenCalledTimes(3);
		const bodies = autoTableMock.mock.calls.map((c) => c[1].body);
		for (const body of bodies) {
			expect(body?.[0]?.[0]).toBe("(no data)");
		}
		expect(docSpies.save).toHaveBeenCalledTimes(1);
	});
});
