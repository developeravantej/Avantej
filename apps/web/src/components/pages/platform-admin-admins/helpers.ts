import type { AdminRole } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<AdminRole, string> = {
	super_admin: "Super Admin",
	support: "Support",
	billing: "Billing",
};

export const ROLE_VARIANTS: Record<
	AdminRole,
	"default" | "secondary" | "outline"
> = {
	super_admin: "default",
	support: "secondary",
	billing: "outline",
};

export function formatGrantedAt(date: Date): string {
	return new Date(date).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
