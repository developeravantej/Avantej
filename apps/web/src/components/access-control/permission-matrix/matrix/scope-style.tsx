import { Check, X, Minus } from "lucide-react";
import type { PermissionScope } from "@/hooks/usePermissionMatrixState";
import type { Role } from "@/components/access-control/permission-matrix/PermissionMatrix";

/** Snake_case → "Title Case" */
export function formatResourceName(name: string): string {
	return name
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
}

/** Lowercase → "Title case" */
export function formatActionName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function getScopeIcon(scope?: PermissionScope) {
	switch (scope) {
		case "own":
			return <Minus className="size-3 text-yellow-700" />;
		case "team":
			return <Check className="size-3 text-orange-700" />;
		case "organization":
		case "country":
		case "region":
		case "area":
		case "branch":
			return <Check className="size-3 text-green-700" />;
		default:
			return <X className="size-3 text-brand-secondary-1" />;
	}
}

export function getScopeButtonStyle(scope?: PermissionScope): string {
	switch (scope) {
		case "own":
			return "bg-yellow-100 hover:bg-yellow-200 border-yellow-300";
		case "team":
			return "bg-orange-100 hover:bg-orange-200 border-orange-300";
		case "organization":
			return "bg-green-100 hover:bg-green-200 border-green-300";
		case "country":
			return "bg-blue-100 hover:bg-blue-200 border-blue-300";
		case "region":
			return "bg-purple-100 hover:bg-purple-200 border-purple-300";
		case "area":
			return "bg-teal-100 hover:bg-teal-200 border-teal-300";
		case "branch":
			return "bg-indigo-100 hover:bg-indigo-200 border-indigo-300";
		default:
			return "bg-brand-secondary-3 hover:bg-brand-secondary-3 border-brand-secondary-3";
	}
}

export interface RoleGroupConfig {
	label: string;
	color: string;
	priorities: number[];
}

export const ROLE_GROUPS: Record<string, RoleGroupConfig> = {
	all: { label: "All Roles", color: "bg-brand-secondary-3", priorities: [] },
	admin: { label: "Admin", color: "bg-red-100 text-red-800", priorities: [1] },
	manager: {
		label: "Manager",
		color: "bg-orange-100 text-orange-800",
		priorities: [2],
	},
	user: {
		label: "Basic User",
		color: "bg-blue-100 text-blue-800",
		priorities: [3, 4, 5],
	},
};

export function getRoleGroupBadge(role: Role) {
	const group = Object.entries(ROLE_GROUPS).find(
		([key, config]) =>
			key !== "all" && config.priorities.includes(role.priority),
	);
	return group ? { key: group[0], config: group[1] } : null;
}
