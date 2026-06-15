import type React from "react";

export interface PermissionAction {
	id: string;
	name: string;
	description?: string;
}

export interface PermissionResource {
	id: string;
	name: string;
	description?: string;
	icon?: React.ComponentType<{ className?: string }>;
	actions: PermissionAction[];
}

export interface Role {
	id: string;
	name: string;
	description?: string;
	priority: number;
	permissions: {
		resourceId: string;
		actionId: string;
		scope:
			| "own"
			| "team"
			| "organization"
			| "country"
			| "region"
			| "area"
			| "branch";
	}[];
}
