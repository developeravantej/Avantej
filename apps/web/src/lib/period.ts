export type Period = "today" | "this_week" | "this_month" | "this_year";

function toYMD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function getPeriodDates(period: Period): { from: string; to: string } {
	const now = new Date();

	if (period === "today") {
		const today = toYMD(now);
		return { from: today, to: today };
	}

	if (period === "this_week") {
		// Monday to Sunday of current week
		const day = now.getDay(); // 0 = Sun, 1 = Mon, ...
		const diffToMonday = day === 0 ? -6 : 1 - day;
		const monday = new Date(now);
		monday.setDate(now.getDate() + diffToMonday);
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		return { from: toYMD(monday), to: toYMD(sunday) };
	}

	if (period === "this_month") {
		const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
		const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return { from: toYMD(firstDay), to: toYMD(lastDay) };
	}

	// this_year
	const firstDay = new Date(now.getFullYear(), 0, 1);
	const lastDay = new Date(now.getFullYear(), 11, 31);
	return { from: toYMD(firstDay), to: toYMD(lastDay) };
}
