import { createFileRoute } from "@tanstack/react-router";
import { EnhancedPermissionMatrix } from "@/components/access-control/permission-matrix/EnhancedPermissionMatrix";
import type { Role, PermissionResource } from "@/components/access-control/permission-matrix/PermissionMatrix";
import { requirePermission } from "@/lib/route-guards";

/**
 * Permissions Route
 * 
 * Enhanced permission matrix for managing role permissions across resources.
 * Requires: role_management:read permission
 */
export const Route = createFileRoute("/_authenticated/access-control/permissions")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard"
		);
	},
	component: PermissionsComponent,
});

function PermissionsComponent() {
	// TODO: Replace with actual API calls when backend is ready
	// const { data: roles } = useQuery(apiClient.getListroles.queryOptions());
	// const { data: resources } = useQuery(apiClient.getListresources.queryOptions());
	
	// Mock data for UI development
	const mockRoles: Role[] = [
		{
			id: "1",
			name: "System Admin",
			description: "Full system access",
			priority: 1,
			permissions: [
				{ resourceId: "users", actionId: "create", scope: "organization" },
				{ resourceId: "users", actionId: "read", scope: "organization" },
				{ resourceId: "users", actionId: "update", scope: "organization" },
				{ resourceId: "users", actionId: "delete", scope: "organization" },
			],
		},
		{
			id: "2",
			name: "Manager",
			description: "Management access",
			priority: 2,
			permissions: [
				{ resourceId: "users", actionId: "read", scope: "team" },
				{ resourceId: "users", actionId: "update", scope: "team" },
			],
		},
	];

	const mockResources: PermissionResource[] = [
		{
			id: "users",
			name: "Users",
			description: "User management and access control",
			actions: [
				{ id: "create", name: "Create", description: "Create new users" },
				{ id: "read", name: "View", description: "View user profiles" },
				{ id: "update", name: "Edit", description: "Edit user information" },
				{ id: "delete", name: "Delete", description: "Delete users" },
			],
		},
		{
			id: "roles",
			name: "Roles",
			description: "Role and permission management",
			actions: [
				{ id: "create", name: "Create", description: "Create new roles" },
				{ id: "read", name: "View", description: "View roles" },
				{ id: "update", name: "Edit", description: "Edit roles" },
				{ id: "delete", name: "Delete", description: "Delete roles" },
			],
		},
		{
			id: "branches",
			name: "Branches",
			description: "Branch management",
			actions: [
				{ id: "create", name: "Create", description: "Create new branches" },
				{ id: "read", name: "View", description: "View branch data" },
				{ id: "update", name: "Edit", description: "Edit branch information" },
			],
		},
	];

	const handlePermissionChange = (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope?: "own" | "team" | "organization" | "country" | "region" | "area" | "branch" | null
	) => {
		// TODO: Replace with actual API call when backend is ready
		console.log("Permission change:", { roleId, resourceId, actionId, enabled, scope });
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Permissions</h1>
			</div>
			<EnhancedPermissionMatrix
				roles={mockRoles}
				resources={mockResources}
				onPermissionChange={handlePermissionChange}
			/>
		</div>
	);
}

