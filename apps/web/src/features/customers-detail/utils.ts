// ─── Formatting helpers ────────────────────────────────────────────────────────

export function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

export function formatDateTime(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

export function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

// ─── Badge variant helpers ─────────────────────────────────────────────────────

export function memberStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "active":
			return "default";
		case "inactive":
			return "secondary";
		default:
			return "outline";
	}
}

export function appointmentStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "confirmed":
			return "default";
		case "completed":
			return "secondary";
		case "pending":
			return "outline";
		case "cancelled":
		case "no-show":
			return "destructive";
		default:
			return "outline";
	}
}

export function paymentStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "succeeded":
			return "default";
		case "pending":
			return "secondary";
		case "failed":
			return "destructive";
		default:
			return "outline";
	}
}
