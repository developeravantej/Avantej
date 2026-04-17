import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/tables/uom/view/data-table";
import { columns } from "@/components/tables/uom/view/columns";
import { Ruler } from "lucide-react";

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

	const { data: allUoms = [], isLoading, isError, error, refetch } = useQuery({
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
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to create UoM: ${message}`);
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
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to update UoM: ${message}`);
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
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to delete UoM: ${message}`);
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
					<p className="text-brand-secondary-1 text-sm">Manage base units of measure for products.</p>
				</div>
			</div>
			<Separator />
			{baseUoms.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<p className="text-lg font-medium">No units of measure defined</p>
					<p className="text-sm">Add a unit of measure.</p>
				</div>
			)}
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
		</div>
	);
}
