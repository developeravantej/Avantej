import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import { DataTable } from "@/components/tables/uom/view/data-table";
import { columns } from "@/components/tables/uom/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/uom/view",
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
	} | null>(null);

	const { data: allUoms = [], isLoading } = useQuery({
		queryKey: ["unitsOfMeasure", organizationId],
		queryFn: () =>
			client.unitsOfMeasure.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// Show only base UOMs (no parent)
	const baseUoms = allUoms.filter((u) => !u.baseUomId);

	const createMutation = useMutation({
		mutationFn: (vars: { name: string; description?: string }) =>
			client.unitsOfMeasure.create({
				organizationId: organizationId!,
				name: vars.name,
				description: vars.description,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("UoM created");
			setIsAddDialogOpen(false);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create UoM");
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { id: string; name: string; description?: string }) =>
			client.unitsOfMeasure.update({
				organizationId: organizationId!,
				id: vars.id,
				name: vars.name,
				description: vars.description,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("UoM updated");
			setEditTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update UoM");
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
			toast.success("UoM deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete UoM");
		},
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view units of measure.
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
			data={baseUoms}
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
