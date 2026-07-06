/**
 * Shared browser CSV download helper (WS2).
 * Server-built CSV string → Blob → anchor click. Appends the anchor to the
 * DOM before clicking (Safari compatibility), then cleans up.
 */
export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** `avantej-<slug>-YYYY-MM-DD.csv` */
export function reportCsvFilename(slug: string): string {
	const date = new Date().toISOString().slice(0, 10);
	return `avantej-${slug}-${date}.csv`;
}
