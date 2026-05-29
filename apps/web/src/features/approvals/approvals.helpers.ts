import type { PendingRow, PriorityLevel, DateGroup } from "./approvals.types";

export function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

export function formatPrice(cents: number | null): string {
	if (cents == null) return "—";
	return `RM ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function formatPriceShort(cents: number): string {
	const rm = cents / 100;
	return `RM ${rm.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Priority logic: packages over a certain age or high value = high priority
export function getPriority(row: PendingRow): PriorityLevel {
	const ageMs = Date.now() - new Date(row.createdAt).getTime();
	const ageDays = ageMs / (1000 * 60 * 60 * 24);
	if (ageDays > 3 || (row.totalPrice ?? 0) >= 50000) return "high";
	if (ageDays > 1 || (row.totalPrice ?? 0) >= 20000) return "med";
	return "low";
}

export function getDateGroup(row: PendingRow): DateGroup {
	const now = new Date();
	const created = new Date(row.createdAt);
	const ageMs = now.getTime() - created.getTime();
	const ageDays = ageMs / (1000 * 60 * 60 * 24);

	// Same calendar day
	if (
		created.getDate() === now.getDate() &&
		created.getMonth() === now.getMonth() &&
		created.getFullYear() === now.getFullYear()
	) {
		return "today";
	}
	if (ageDays < 2) return "yesterday";
	if (ageDays < 3) return "earlier";
	return "older";
}

export function formatAge(createdAt: string | Date): string {
	const ageMs = Date.now() - new Date(createdAt).getTime();
	const mins = Math.floor(ageMs / 60000);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	const remHrs = hrs - days * 24;
	return `${days}d ${remHrs}h ago`;
}

export function formatOverdue(createdAt: string | Date): string {
	const ageMs = Date.now() - new Date(createdAt).getTime();
	const hrs = Math.floor(ageMs / (1000 * 60 * 60));
	const days = Math.floor(hrs / 24);
	const remHrs = hrs - days * 24;
	return `${days}d ${remHrs}h overdue`;
}

export function getInitials(name: string | null): string {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase() ?? "")
		.join("");
}

export function formatToday(): string {
	return new Date().toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export function formatPreferredTime(t: { dayOfWeek: string; time: string }): string {
	const day = t.dayOfWeek.charAt(0).toUpperCase() + t.dayOfWeek.slice(1);
	// "09:00" → "9:00 AM" style
	const [hStr, mStr] = t.time.split(":");
	const h = parseInt(hStr ?? "0", 10);
	const m = mStr ?? "00";
	const suffix = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${day} ${h12}:${m} ${suffix}`;
}

export function downloadCsv(rows: PendingRow[]) {
	const headers = [
		"id",
		"customer_name",
		"customer_email",
		"service_name",
		"total_price_rm",
		"credits_total",
		"payment_method",
		"payment_status",
		"preferred_trainer",
		"created_at",
	];
	const escape = (v: unknown): string => {
		if (v == null) return "";
		const s = String(v);
		// CSV escape: wrap in quotes if contains comma, quote, or newline
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	};
	const lines = [
		headers.join(","),
		...rows.map((r) =>
			[
				r.id,
				r.customerName,
				r.customerEmail,
				r.serviceName,
				r.totalPrice == null ? "" : (r.totalPrice / 100).toFixed(2),
				r.creditsTotal,
				r.paymentMethod,
				r.paymentStatus,
				r.preferredTrainerName,
				new Date(r.createdAt).toISOString(),
			]
				.map(escape)
				.join(","),
		),
	];
	const blob = new Blob([lines.join("\n")], {
		type: "text/csv;charset=utf-8;",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const ts = new Date().toISOString().slice(0, 10);
	a.download = `pending-approvals-${ts}.csv`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
