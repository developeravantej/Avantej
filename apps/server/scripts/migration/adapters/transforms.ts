/**
 * Reusable transform helpers for client manifests. Keep client-specific value
 * maps in the manifest; keep generic, format-level conversions here.
 */

/** "4,560.00" / "RM 4560" → integer cents. Returns null on empty/garbage. */
export function decimalToCents(raw: string | undefined): number | null {
	if (!raw) return null;
	const cleaned = raw.replace(/[^0-9.-]/g, "");
	if (cleaned === "" || cleaned === "-") return null;
	const n = Number(cleaned);
	if (Number.isNaN(n)) return null;
	return Math.round(n * 100);
}

/** Parse a date-ish string to a Date, or null. Avoids Excel locale ambiguity by
 *  accepting ISO and common D/M/Y; logs nothing — caller decides on null. */
export function parseDate(raw: string | undefined): Date | null {
	if (!raw) return null;
	const s = raw.trim();
	if (!s) return null;
	// ISO or ISO-ish (YYYY-MM-DD[ T]HH:mm) — trust directly.
	if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
		const d = new Date(s.replace(" ", "T"));
		return Number.isNaN(d.getTime()) ? null : d;
	}
	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize a phone to E.164-ish, preserving country prefix. Defaults to the
 *  given country calling code when the number is local (leading 0). */
export function normalizePhone(
	raw: string | undefined,
	defaultCc = "60",
): string | null {
	if (!raw) return null;
	let s = raw.replace(/[^\d+]/g, "");
	if (!s) return null;
	if (s.startsWith("+")) return s;
	if (s.startsWith("0")) return `+${defaultCc}${s.slice(1)}`;
	if (s.startsWith(defaultCc)) return `+${s}`;
	return `+${s}`;
}

/** Map a source value through a dictionary; falls back to `fallback`. */
export function mapValue<T extends string>(
	raw: string | undefined,
	dict: Record<string, T>,
	fallback: T,
): T {
	if (!raw) return fallback;
	return dict[raw.trim().toLowerCase()] ?? fallback;
}

/** Join non-empty parts into a single-line address. */
export function composeAddress(...parts: (string | undefined)[]): string {
	return parts
		.map((p) => p?.trim())
		.filter(Boolean)
		.join(", ");
}

/** First non-empty string, else undefined. */
export function firstOf(...vals: (string | undefined)[]): string | undefined {
	for (const v of vals) if (v?.trim()) return v.trim();
	return undefined;
}

/** Parse an integer, or null. */
export function toInt(raw: string | undefined): number | null {
	if (!raw) return null;
	const n = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
	return Number.isNaN(n) ? null : n;
}

/** "true"/"1"/"yes" → true (case-insensitive). */
export function toBool(raw: string | undefined): boolean {
	return ["true", "1", "yes", "y"].includes((raw ?? "").trim().toLowerCase());
}
