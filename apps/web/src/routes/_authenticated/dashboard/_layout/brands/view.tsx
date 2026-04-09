import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
	const [_editTarget, setEditTarget] = useState<BrandRow | null>(null);
	const [_deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);

	// Query
	const { data: brands = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: [orpc.brands.list.key({ input: { organizationId: organizationId! } })],
		queryFn: () => client.brands.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const { data: products } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const productCountByBrand = useMemo(() => {
		const counts = new Map<string, number>();
		products?.forEach((p) => {
			if (p.brandId) counts.set(p.brandId, (counts.get(p.brandId) ?? 0) + 1);
		});
		return counts;
	}, [products]);

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

	const tableData: BrandRow[] = brands.map((b) => ({
		ID: b.id,
		Name: b.name,
		"Products Assigned": productCountByBrand.get(b.id) ?? 0,
	}));

	return (
		<>
			{tableData.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<p className="text-lg font-medium">No brands yet</p>
					<p className="text-sm">Add a brand to organize your products.</p>
				</div>
			)}
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
		</>
	);
}
