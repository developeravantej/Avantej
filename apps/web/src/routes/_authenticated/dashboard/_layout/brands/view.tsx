import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import DataTable from "@/components/tables/brands/view/data-table";
import { columns } from "@/components/tables/brands/view/columns";
import type { BrandRow } from "@/components/tables/brands/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/brands/view",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Dialog state
	const [editTarget, setEditTarget] = useState<BrandRow | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);

	// Query
	const { data: brands = [], isLoading } = useQuery({
		queryKey: [orpc.brands.list.key({ input: { organizationId: organizationId! } })],
		queryFn: () => client.brands.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: [orpc.brands.list.key({ input: { organizationId: organizationId! } })],
		});

	// Mutations
	const createMutation = useMutation({
		mutationFn: (data: { name: string; description?: string }) =>
			client.brands.create({ organizationId: organizationId!, ...data }),
		onSuccess: () => {
			invalidate();
			toast.success("Brand created successfully");
		},
		onError: (e: Error) => toast.error(e.message),
	});

	const updateMutation = useMutation({
		mutationFn: (data: { id: string; name?: string; description?: string }) =>
			client.brands.update({ organizationId: organizationId!, ...data }),
		onSuccess: () => {
			invalidate();
			toast.success("Brand updated successfully");
			setEditTarget(null);
		},
		onError: (e: Error) => toast.error(e.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			client.brands.delete({ organizationId: organizationId!, id }),
		onSuccess: () => {
			invalidate();
			toast.success("Brand deleted successfully");
			setDeleteTarget(null);
		},
		onError: (e: Error) => toast.error(e.message),
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view brands.
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

	const tableData: BrandRow[] = brands.map((b) => ({
		ID: b.id,
		Name: b.name,
		"Products Assigned": 0,
	}));

	return (
		<DataTable
			columns={columns}
			data={tableData}
			onAdd={(data) => createMutation.mutate(data)}
			onEdit={(id, data) => updateMutation.mutate({ id, ...data })}
			onDelete={(id) => deleteMutation.mutate(id)}
			isMutating={
				createMutation.isPending ||
				updateMutation.isPending ||
				deleteMutation.isPending
			}
		/>
	);
}
