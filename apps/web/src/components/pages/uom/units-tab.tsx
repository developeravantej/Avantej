import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/tables/uom/view/data-table";
import { columns } from "@/components/tables/uom/view/columns";
import { Ruler } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";

export function UnitsTabPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: allUoms = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: ["unitsOfMeasure", organizationId],
		queryFn: () =>
			client.unitsOfMeasure.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// Show only base UOMs (no parent)
	const baseUoms = allUoms.filter((u) => !u.baseUomId);

	const deleteMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.unitsOfMeasure.delete({
				organizationId: organizationId!,
				id,
			}),
		successMessage: "UoM deleted",
		errorMessage: (error) =>
			`Failed to delete UoM: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["unitsOfMeasure", organizationId]],
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view units of measure.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="text-lg font-medium text-destructive">Failed to load data</p>
				<p className="text-sm text-muted-foreground mb-4">
					{error instanceof Error ? error.message : "An unexpected error occurred"}
				</p>
				<Button variant="outline" onClick={() => refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<Ruler className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading">Units of Measure</h1>
					<p className="text-muted-foreground text-sm">Manage base units of measure for products.</p>
				</div>
			</div>
			<Separator />
			{baseUoms.length === 0 && (
				<EmptyState
					title="No units of measure"
					description="Add a unit of measure to get started."
					icon={Ruler}
				/>
			)}
			<DataTable
				columns={columns}
				data={baseUoms}
				organizationId={organizationId}
				onDelete={(id) => deleteMutation.mutate(id)}
				isDeleting={deleteMutation.isPending}
			/>
		</div>
	);
}
