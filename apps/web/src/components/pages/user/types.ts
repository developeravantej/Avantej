export type MemberRole = "admin" | "trainer" | "staff" | "client";
export type MemberStatus = "active" | "suspended";

export interface MemberRow {
	id: string;
	userId: string;
	role: MemberRole;
	hierarchyScopeId: string;
	status: MemberStatus;
	joinedAt: Date | null;
	name: string | null;
	email: string | null;
}
