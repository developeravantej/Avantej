// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	try {
		const d = new Date(value);
		return d.toISOString().slice(0, 10); // YYYY-MM-DD for mono display
	} catch {
		return "—";
	}
}

export function toDateInputValue(
	value: string | Date | null | undefined,
): string {
	if (!value) return "";
	try {
		const d = typeof value === "string" ? new Date(value) : value;
		return d.toISOString().slice(0, 10);
	} catch {
		return "";
	}
}
