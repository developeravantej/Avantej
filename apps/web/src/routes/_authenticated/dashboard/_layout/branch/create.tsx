import { createFileRoute } from "@tanstack/react-router";
import HierarchicalBranchForm from "@/components/forms/hierarchical-branch-form";
import { requirePermission } from "@/lib/route-guards";

/**
 * Create Branch Route
 * 
 * Form for creating hierarchical branches (country, region, area, branch).
 * Requires: hierarchy_management:create permission
 */
export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/branch/create"
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "hierarchy_management", action: "create" },
			"/dashboard/branch/view"
		);
	},
	component: CreateBranchComponent,
});

function CreateBranchComponent() {
	const handleSuccess = () => {
		// TODO: Navigate to branch view after successful creation
		console.log("Branch created successfully");
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Create Branch</h1>
			</div>
			<HierarchicalBranchForm onSuccess={handleSuccess} />
		</div>
	);
}

