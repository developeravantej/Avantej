// ─── Helpers ─────────────────────────────────────────────────────────────────

export function firstOfMonthIso(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function todayEndIso(): string {
	const now = new Date();
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		23,
		59,
		59,
		999,
	).toISOString();
}

export function formatRelativeDate(
	date: Date | string | null | undefined,
): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	const diff = Date.now() - d.getTime();
	const days = Math.floor(diff / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

export function formatAbsoluteDate(
	date: Date | string | null | undefined,
): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Role label helper (mirrors liability-tab.tsx) ──────────────────────────

export function roleTypeLabel(roleType: string): string {
	const labels: Record<string, string> = {
		trainer: "Trainer",
		sales: "Sales",
		marketing: "Marketing",
		referrer: "Referral",
		delivery_legacy: "Delivery (legacy)",
	};
	return labels[roleType] ?? roleType;
}
