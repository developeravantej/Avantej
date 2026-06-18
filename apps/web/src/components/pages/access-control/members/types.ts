/**
 * Shared types for the members-tab sub-components.
 * Keep these aligned with the types used in the orchestrator.
 */
import type { client } from "@/utils/orpc";
import type { UserForAssignment, RoleResponse } from "@/types/user-assignment";

export type MemberApiItem = Awaited<
	ReturnType<typeof client.members.list>
>[number];
export type RoleApiItem = Awaited<ReturnType<typeof client.roles.list>>[number];

export type SystemRole = "admin" | "trainer" | "staff" | "client";

export const SYSTEM_ROLES: {
	value: SystemRole;
	label: string;
	description: string;
}[] = [
	{
		value: "admin",
		label: "Admin",
		description: "Full access to all organization features",
	},
	{
		value: "trainer",
		label: "Trainer",
		description: "Can manage appointments and client sessions",
	},
	{
		value: "staff",
		label: "Staff",
		description: "General staff with limited access",
	},
	{
		value: "client",
		label: "Client",
		description: "End-user/customer access only",
	},
];

export type { UserForAssignment, RoleResponse };
