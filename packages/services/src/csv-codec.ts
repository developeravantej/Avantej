/**
 * Unified CSV codec — WS2/WS7 (MOVE parity program).
 *
 * Zero imports: pure string ops, safe in Cloudflare Workers AND the browser.
 * Consolidates the divergent per-feature CSV helpers (cancelled-sales,
 * audit-log, installments, commission liability, web reports, approvals).
 * New code must use this codec; legacy helpers migrate in WS7.
 *
 * Money is NOT formatted here — cents→display formatting stays at call
 * sites because some exports intentionally emit raw-cents columns.
 */

export type CsvCell = string | number | boolean | Date | null | undefined;

export interface CsvOptions {
	/**
	 * 'minimal' (default): RFC-4180 quote-when-needed on /[",\n\r]/ —
	 * strict superset of the legacy services-side helpers (adds the
	 * missing CR check). 'always': unconditionally quote every cell
	 * (byte-compat mode for exportLiabilityCsv).
	 */
	quoting?: "minimal" | "always";
	/** Default '\n' — every existing impl uses LF. */
	newline?: "\n" | "\r\n";
	/** Default false (audit-log/liability/reports emit no trailing newline). */
	trailingNewline?: boolean;
	/**
	 * Verbatim preamble lines emitted above the header (each escaped as a
	 * single cell), for the '#'-comment report style.
	 */
	preamble?: string[];
}

const NEEDS_QUOTING = /[",\n\r]/;

/**
 * Coerce + escape one cell.
 * null/undefined → '' ; Date → toISOString() ; boolean → 'true'/'false' ;
 * number → String(n) (no locale, no money math).
 */
export function csvEscape(
	value: CsvCell,
	quoting: "minimal" | "always" = "minimal",
): string {
	let str: string;
	if (value === null || value === undefined) {
		str = "";
	} else if (value instanceof Date) {
		str = value.toISOString();
	} else if (typeof value === "boolean") {
		str = value ? "true" : "false";
	} else {
		str = String(value);
	}
	if (quoting === "always" || NEEDS_QUOTING.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** One CSV line (no newline appended). */
export function csvRow(
	cells: readonly CsvCell[],
	opts?: Pick<CsvOptions, "quoting">,
): string {
	return cells.map((c) => csvEscape(c, opts?.quoting)).join(",");
}

/** Rows-only fragment, for chunked/streaming accumulators. */
export function appendCsvRows(
	rows: readonly (readonly CsvCell[])[],
	opts?: Pick<CsvOptions, "quoting" | "newline">,
): string {
	const nl = opts?.newline ?? "\n";
	return rows.map((r) => csvRow(r, opts)).join(nl);
}

/**
 * Full CSV document.
 * `headers: null` skips the header row (for section-style composers).
 */
export function buildCsv(
	headers: readonly string[] | null,
	rows: readonly (readonly CsvCell[])[],
	opts?: CsvOptions,
): string {
	const nl = opts?.newline ?? "\n";
	const lines: string[] = [];
	if (opts?.preamble) {
		for (const line of opts.preamble) {
			lines.push(csvEscape(line, opts.quoting));
		}
	}
	if (headers) {
		lines.push(csvRow(headers, opts));
	}
	for (const row of rows) {
		lines.push(csvRow(row, opts));
	}
	let out = lines.join(nl);
	if (opts?.trailingNewline && out.length > 0) out += nl;
	return out;
}

// ---------------------------------------------------------------------------
// Parse (WS6 — CSV import). RFC-4180: quoted fields with embedded commas /
// newlines / doubled-quote escapes, CRLF or LF. Import-safe.
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into a matrix of trimmed string cells. Rows that are entirely
 * empty are dropped. Pure — no imports, Workers + browser safe.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let cur: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			cur.push(field);
			field = "";
		} else if (c === "\r") {
			// skip — handled by the \n case
		} else if (c === "\n") {
			cur.push(field);
			rows.push(cur);
			cur = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field.length || cur.length) {
		cur.push(field);
		rows.push(cur);
	}
	return rows
		.map((r) => r.map((c) => c.trim()))
		.filter((r) => r.some((c) => c !== ""));
}

export interface ParsedCsvTable {
	header: string[];
	/** Each row as a header→cell record (missing cells → ""). */
	rows: Record<string, string>[];
}

/**
 * Parse CSV into a header + row-objects table. The first non-empty row is the
 * header. Returns an empty table when there is no data.
 */
export function parseCsvTable(text: string): ParsedCsvTable {
	const matrix = parseCsv(text);
	if (matrix.length === 0) return { header: [], rows: [] };
	const header = matrix[0]!;
	const rows = matrix.slice(1).map((r) => {
		const o: Record<string, string> = {};
		header.forEach((h, i) => {
			o[h] = r[i] ?? "";
		});
		return o;
	});
	return { header, rows };
}
