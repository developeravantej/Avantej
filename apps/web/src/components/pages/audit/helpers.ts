// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatAbsoluteTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("en-MY", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function formatRelativeTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	const diffMs = Date.now() - d.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	if (diffSecs < 60) return "just now";
	const diffMins = Math.floor(diffSecs / 60);
	if (diffMins < 60)
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24)
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12)
		return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
	const diffYears = Math.floor(diffMonths / 12);
	return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
}
