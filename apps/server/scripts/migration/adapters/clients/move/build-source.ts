/**
 * Build MOVE's consolidated source.xlsx from the 3 raw files in ~/Downloads.
 *
 * The migration engine (engine/run.ts) reads ONE workbook with sheets named per
 * the manifest (location/staff/product/client/appointment). MOVE ships 2 CSVs +
 * 1 XLSX, so this prep step merges them — original headers preserved, the
 * manifest does all column→canonical mapping. PII (staff emails/phones) lives in
 * the generated workbook → data/ is gitignored.
 *
 * Adds ONE derived column: staff.home_branch_code = the branch_code of the FIRST
 * branch listed in access_branch_name (name→code join), so the staff loader can
 * resolve hierarchy scope via the location crosswalk.
 *
 * Usage:  bun run scripts/migration/adapters/clients/move/build-source.ts
 */
import ExcelJS from "exceljs";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSheet } from "../../xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimal RFC4180 CSV parser (handles quoted fields w/ commas + CRLF). */
function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let cur: string[] = [];
	let field = "";
	let inQ = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQ) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else inQ = false;
			} else field += c;
		} else if (c === '"') inQ = true;
		else if (c === ",") {
			cur.push(field);
			field = "";
		} else if (c === "\r") {
			/* skip */
		} else if (c === "\n") {
			cur.push(field);
			rows.push(cur);
			cur = [];
			field = "";
		} else field += c;
	}
	if (field.length || cur.length) {
		cur.push(field);
		rows.push(cur);
	}
	const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
	if (nonEmpty.length === 0) return [];
	const header = nonEmpty[0]!.map((h) => h.trim());
	return nonEmpty.slice(1).map((r) => {
		const o: Record<string, string> = {};
		header.forEach((h, idx) => {
			o[h] = (r[idx] ?? "").trim();
		});
		return o;
	});
}

function readCsv(path: string): Record<string, string>[] {
	return parseCsv(readFileSync(path, "utf8"));
}

function addSheet(
	wb: ExcelJS.Workbook,
	name: string,
	headers: string[],
	rows: Record<string, string>[],
): void {
	const ws = wb.addWorksheet(name);
	ws.addRow(headers);
	for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? ""));
}

async function main(): Promise<void> {
	const dl = join(homedir(), "Downloads");
	const branches = readCsv(join(dl, "Location-Branch.csv"));
	const staff = readCsv(join(dl, "Staff.csv"));
	const offerings = await readSheet(
		join(dl, "Offering-Service.xlsx"),
		"Sheet11",
	);

	if (!branches.length || !staff.length || !offerings.length) {
		throw new Error(
			`empty source: branches=${branches.length} staff=${staff.length} offerings=${offerings.length}`,
		);
	}

	// branch_name (UPPER) → branch_code
	const nameToCode = new Map<string, string>();
	for (const b of branches) {
		const name = (b.branch_name ?? "").trim().toUpperCase();
		const code = (b.branch_code ?? "").trim();
		if (name && code) nameToCode.set(name, code);
	}

	// derive home_branch_code from the FIRST branch in access_branch_name
	let unresolved = 0;
	for (const s of staff) {
		const first = (s.access_branch_name ?? "")
			.split(",")[0]!
			.trim()
			.toUpperCase();
		const code = first ? (nameToCode.get(first) ?? "") : "";
		s.home_branch_code = code;
		if (first && !code) unresolved++;
	}

	const wb = new ExcelJS.Workbook();
	addSheet(wb, "location", Object.keys(branches[0]!), branches);
	addSheet(wb, "staff", Object.keys(staff[0]!), staff);
	addSheet(wb, "product", Object.keys(offerings[0]!), offerings);
	addSheet(wb, "client", ["external_client_id"], []); // empty (no client data)
	addSheet(wb, "appointment", ["appointment_id"], []); // empty (no appt data)

	const outDir = join(__dirname, "data");
	mkdirSync(outDir, { recursive: true });
	const out = join(outDir, "source.xlsx");
	await wb.xlsx.writeFile(out);

	console.log(`✅ wrote ${out}`);
	console.log(
		`   location=${branches.length}  staff=${staff.length}  product=${offerings.length}`,
	);
	console.log(`   staff home_branch unresolved: ${unresolved}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("build-source failed:", e);
		process.exit(1);
	});
