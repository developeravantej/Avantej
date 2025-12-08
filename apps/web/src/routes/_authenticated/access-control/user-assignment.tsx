import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/user/view/data-table";
import { columns } from "@/components/tables/user/view/columns";
import { useState } from "react";
import { BulkAssignmentSheet } from "@/components/access-control/mobile/BulkAssignmentSheet";
import type { Role } from "@/components/access-control/permission-matrix/PermissionMatrix";
import { requirePermission } from "@/lib/route-guards";

/**
 * User Assignment Route
 * 
 * Manages user-role assignments with bulk assignment capabilities.
 * Requires: user_management:read and role_management:read permissions
 */
export const Route = createFileRoute("/_authenticated/access-control/user-assignment")({
	beforeLoad: async () => {
		// Require both user and role management permissions
		await requirePermission(
			{ resource: "user_management", action: "read" },
			"/dashboard"
		);
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard"
		);
	},
	component: UserAssignmentComponent,
});

function UserAssignmentComponent() {
	const [isBulkSheetOpen, setIsBulkSheetOpen] = useState(false);
	const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

	// TODO: Replace with actual API calls when backend is ready
	// const { data: users } = useQuery(apiClient.getListusers.queryOptions());
	// const { data: roles } = useQuery(apiClient.getListroles.queryOptions());
	
	// Mock data for UI development - matches User type from columns.tsx
	const mockUsers = [
		{
			id: "1",
			name: "John Doe",
			email: "john@example.com",
			email_verified: true,
			onboarding_completed: true,
			image: null,
			organization_id: "org-1",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: "2",
			name: "Jane Smith",
			email: "jane@example.com",
			email_verified: true,
			onboarding_completed: true,
			image: null,
			organization_id: "org-1",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: "3",
			name: "Bob Johnson",
			email: "bob@example.com",
			email_verified: true,
			onboarding_completed: true,
			image: null,
			organization_id: "org-1",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	];

	const mockRoles: Role[] = [
		{
			id: "1",
			name: "System Admin",
			description: "Full system access",
			priority: 1,
			permissions: [],
		},
		{
			id: "2",
			name: "Manager",
			description: "Management access",
			priority: 2,
			permissions: [],
		},
		{
			id: "3",
			name: "Trainer",
			description: "Trainer access",
			priority: 3,
			permissions: [],
		},
	];

	const handleBulkSave = async (assignments: any[]) => {
		// TODO: Replace with actual API call when backend is ready
		console.log("Bulk assignment:", assignments);
		setIsBulkSheetOpen(false);
		setSelectedUsers([]);
	};

	const selectedUserObjects = mockUsers
		.filter((user) => selectedUsers.includes(user.id))
		.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			roles: [], // TODO: Fetch actual roles from API
			isActive: user.onboarding_completed ?? false,
		}));

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">User Assignment</h1>
				{selectedUsers.length > 0 && (
					<button
						onClick={() => setIsBulkSheetOpen(true)}
						className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
					>
						Assign Roles ({selectedUsers.length} selected)
					</button>
				)}
			</div>
			<DataTable columns={columns} data={mockUsers} />
			<BulkAssignmentSheet
				isOpen={isBulkSheetOpen}
				onClose={() => setIsBulkSheetOpen(false)}
				selectedUsers={selectedUserObjects}
				availableRoles={mockRoles}
				onSave={handleBulkSave}
			/>
		</div>
	);
}

