import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import DataTable from "@/components/tables/uom-conversions/view/data-table";
import { columns } from "@/components/tables/uom-conversions/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/uom-conversions/view",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<{
		id: string;
		name: string;
		description: string;
		baseUomId: string;
		conversionFactor: string;
	} | null>(null);

	const { data: allUoms = [], isLoading } = useQuery({
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

	const createMutation = useMutation({
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
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion created");
			setIsAddDialogOpen(false);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create conversion");
		},
	});

	const updateMutation = useMutation({
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
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion updated");
			setEditTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update conversion");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			client.unitsOfMeasure.delete({
				organizationId: organizationId!,
				id,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete conversion");
		},
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view UoM conversions.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return (
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
	);
}
