import type { MemberRole } from "./types";

export const ROLE_GROUPS: Array<{
	role: MemberRole;
	label: string;
	pluralLabel: string;
}> = [
	{ role: "admin", label: "Admin", pluralLabel: "Admins" },
	{ role: "trainer", label: "Trainer", pluralLabel: "Trainers" },
	{ role: "staff", label: "Staff", pluralLabel: "Staff" },
	{ role: "client", label: "Client", pluralLabel: "Clients" },
];

// Role badge styles matching V2 design tokens
export const ROLE_BADGE_STYLES: Record<MemberRole, string> = {
	admin: "bg-[#0a0a0a] text-white border-transparent",
	trainer: "bg-[#f3f3f3] text-[#0a0a0a] border-[#edede4]",
	staff: "bg-white text-[#0a0a0a] border-[#0a0a0a]",
	client: "bg-[#f3f3f3] text-[#0a0a0a] border-[#edede4]",
};

export const STATUS_BADGE_STYLES: Record<string, string> = {
	active: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
	suspended: "bg-[#fef2f2] text-[#991b1b] border-[#fecaca]",
};
