import { createFileRoute } from "@tanstack/react-router";
import HierarchicalBranchForm from "@/components/forms/hierarchical-branch-form";
import { requirePermission } from "@/lib/route-guards";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

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
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
			{/* Main Form - Takes 2 columns on large screens */}
			<div className="lg:col-span-2 space-y-4">
				<div className="flex items-center justify-between">
					<h1 className="text-3xl font-bold">Create Branch</h1>
				</div>
				<HierarchicalBranchForm onSuccess={handleSuccess} />
			</div>

			{/* Info Card - Takes 1 column on large screens */}
			<div className="lg:col-span-1">
				<Card className="sticky top-6">
					<CardHeader>
						<CardTitle className="text-xl font-bold">How it works</CardTitle>
						<CardDescription>
							Follow the step-by-step process to create your branch
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Steps */}
						<div className="space-y-4">
							{/* Step 1: Country */}
							<div className="flex items-start gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white font-semibold text-sm">
									1
								</div>
								<div className="flex-1">
									<h3 className="font-semibold text-sm mb-1">Country</h3>
									<p className="text-sm text-muted-foreground">
										Select or create the country
									</p>
								</div>
							</div>

							{/* Step 2: Region */}
							<div className="flex items-start gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white font-semibold text-sm">
									2
								</div>
								<div className="flex-1">
									<h3 className="font-semibold text-sm mb-1">Region</h3>
									<p className="text-sm text-muted-foreground">
										Select or create the region
									</p>
								</div>
							</div>

							{/* Step 3: Area */}
							<div className="flex items-start gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white font-semibold text-sm">
									3
								</div>
								<div className="flex-1">
									<h3 className="font-semibold text-sm mb-1">Area</h3>
									<p className="text-sm text-muted-foreground">
										Select or create the area
									</p>
								</div>
							</div>

							{/* Step 4: Branch */}
							<div className="flex items-start gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white font-semibold text-sm">
									4
								</div>
								<div className="flex-1">
									<h3 className="font-semibold text-sm mb-1">Branch</h3>
									<p className="text-sm text-muted-foreground">
										Enter branch details
									</p>
								</div>
							</div>
						</div>

						{/* Permissions Required */}
						<div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
							<h3 className="font-semibold text-sm mb-2">Permissions Required</h3>
							<p className="text-sm text-muted-foreground">
								You need Organization Owner permissions to create branches and hierarchy items.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

