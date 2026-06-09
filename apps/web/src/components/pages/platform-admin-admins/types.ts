// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminRole = "super_admin" | "support" | "billing";

export type AdminRow = {
	userId: string;
	email: string | null;
	name: string | null;
	role: AdminRole;
	grantedAt: Date;
	grantedByEmail: string | null;
};

export type UserRow = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	name: string;
	isPlatformAdmin: boolean;
	platformAdminRole: string | null;
};
