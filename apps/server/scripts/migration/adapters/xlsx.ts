/**
 * Fidelity-safe .xlsx reader. Uses `cell.text` (the rendered value) so NRIC
 * numbers, phone numbers with leading +/0, and locale dates survive as the
 * strings the client actually sees — the #1 corruption risk if you route legacy
 * Malaysian data through CSV. One sheet → RawRow[] (all values trimmed text).
 */
import ExcelJS from "exceljs";
import type { RawRow } from "../core/canonical";

export async function readSheet(
	filePath: string,
	sheetName: string,
): Promise<RawRow[]> {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.readFile(filePath);
	const ws = wb.getWorksheet(sheetName);
	if (!ws) {
		const names = wb.worksheets.map((w) => w.name).join(", ");
		throw new Error(`Sheet "${sheetName}" not found. Available: ${names}`);
	}

	const headerCells = ws.getRow(1);
	const header: string[] = [];
	headerCells.eachCell({ includeEmpty: true }, (cell, col) => {
		header[col - 1] = String(cell.text ?? "").trim();
	});

	const rows: RawRow[] = [];
	ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber === 1) return;
		const obj: RawRow = {};
		let hasValue = false;
		header.forEach((h, i) => {
			if (!h) return;
			const text = String(row.getCell(i + 1).text ?? "").trim();
			obj[h] = text;
			if (text) hasValue = true;
		});
		if (hasValue) rows.push(obj);
	});

	return rows;
}
