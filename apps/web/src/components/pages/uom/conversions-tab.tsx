import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeftRight } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import DataTable from "@/components/tables/uom-conversions/view/data-table";
import { columns } from "@/components/tables/uom-conversions/view/columns";

export function UomConversionsTabPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<{
		id: string;
		name: string;
		description: string;
		baseUomId: string;
		conversionFactor: string;
	} | null>(null);

	const { data: allUoms = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: ["unitsOfMeasure", organizationId],
		queryFn: () =>
			client.unitsOfMeasure.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// Derived UOMs (have a baseUomId) are treated as conversions
	const conversions = allUoms.filter((u) => u.baseUomId !== null);
	// Base UOMs for the name lookup map and selector
	const baseUoms = allUoms.filter((u) => !u.baseUomId);
	const uomMap = Object.fromEntries(allUoms.map((u) => [u.id, u.name]));

	const createMutation = useApiMutation({
		mutationFn: (vars: {
			name: string;
			description?: string;
			baseUomId: string;
			conversionFactor: string;
		}) =>
			client.unitsOfMeasure.create({
				organizationId: organizationId!,
				name: vars.name,
				description: vars.description,
				baseUomId: vars.baseUomId,
				conversionFactor: vars.conversionFactor,
			}),
		successMessage: "Conversion created",
		errorMessage: (error) =>
			`Failed to create conversion: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["unitsOfMeasure", organizationId]],
		onSuccess: () => setIsAddDialogOpen(false),
	});

	const updateMutation = useApiMutation({
		mutationFn: (vars: {
			id: string;
			name?: string;
			description?: string;
			baseUomId?: string;
			conversionFactor?: string;
		}) =>
			client.unitsOfMeasure.update({
				organizationId: organizationId!,
				...vars,
			}),
		successMessage: "Conversion updated",
		errorMessage: (error) =>
			`Failed to update conversion: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["unitsOfMeasure", organizationId]],
		onSuccess: () => setEditTarget(null),
	});

	const deleteMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.unitsOfMeasure.delete({
				organizationId: organizationId!,
				id,
			}),
		successMessage: "Conversion deleted",
		errorMessage: (error) =>
			`Failed to delete conversion: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["unitsOfMeasure", organizationId]],
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view UoM conversions.
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
		<>
			{conversions.length === 0 && (
				<EmptyState
					title="No UoM conversions"
					description="Add a conversion to relate units of measure."
					icon={ArrowLeftRight}
				/>
			)}
			<DataTable
				columns={columns}
				data={conversions}
				uomMap={uomMap}
				baseUoms={baseUoms}
				isAddDialogOpen={isAddDialogOpen}
				onAddDialogOpenChange={setIsAddDialogOpen}
				editTarget={editTarget}
				onEditTargetChange={setEditTarget}
				onCreate={(vars) => createMutation.mutate(vars)}
				onUpdate={(vars) => updateMutation.mutate(vars)}
				onDelete={(id) => deleteMutation.mutate(id)}
				isCreating={createMutation.isPending}
				isUpdating={updateMutation.isPending}
				isDeleting={deleteMutation.isPending}
			/>
		</>
	);
}
