export function getInitials(name: string | null | undefined): string {
	if (!name) return "??";
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(date: string | Date | null | undefined): string {
	if (!date) return "—";
	const diff = Date.now() - new Date(date).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

export function formatToday(): string {
	return new Date().toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function severityLabel(severity: string | undefined): string {
	if (severity === "danger") return "Error";
	if (severity === "warning") return "Warning";
	return "Info";
}

export function severityDotColor(severity: string | undefined): string {
	if (severity === "danger") return "bg-destructive";
	if (severity === "warning") return "bg-amber-500";
	return "bg-blue-500";
}
