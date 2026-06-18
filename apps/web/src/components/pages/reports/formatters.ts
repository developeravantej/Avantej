export function ytdDays(): number {
	const start = new Date(new Date().getFullYear(), 0, 1);
	return Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtMYR(cents: number): string {
	const rm = cents / 100;
	if (rm >= 1_000_000) return `RM ${(rm / 1_000_000).toFixed(1)}M`;
	if (rm >= 1_000) return `RM ${(rm / 1_000).toFixed(1)}k`;
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
		maximumFractionDigits: 0,
	}).format(rm);
}

export function fmtMYRFull(cents: number): string {
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
		maximumFractionDigits: 0,
	}).format(cents / 100);
}

export function deltaPct(current: number, prev: number): number | null {
	if (prev === 0) return null;
	return ((current - prev) / prev) * 100;
}

export function initials(name: string | null, fallback: string): string {
	if (!name) return fallback.slice(0, 2).toUpperCase();
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}
