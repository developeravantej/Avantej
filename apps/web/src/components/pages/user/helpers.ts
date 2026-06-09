import type { MemberRow } from "./types";

export function getInitials(name: string | null, email: string | null): string {
	const display = name || email || "?";
	return display
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function getDisplayName(member: MemberRow): string {
	if (member.name && member.name !== "Unknown") return member.name;
	if (member.email && member.email !== "No email") return member.email;
	return "Unknown";
}

export function formatJoined(joinedAt: Date | null): string {
	if (!joinedAt) return "";
	const d = new Date(joinedAt);
	return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
