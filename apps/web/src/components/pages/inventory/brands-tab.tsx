import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import DataTable from "@/components/tables/brands/view/data-table";
import { columns } from "@/components/tables/brands/view/columns";
import type { BrandRow } from "@/components/tables/brands/view/columns";

export function BrandsTabPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Dialog state
	const [_editTarget, _setEditTarget] = useState<BrandRow | null>(null);

	// Query
	const {
		data: brands = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: orpc.brands.list.key({
			input: { organizationId: organizationId! },
		}),
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

	// Delete mutation (still owned by parent — form handles create/update)
	const deleteMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.brands.delete({ organizationId: organizationId!, id }),
		successMessage: "Brand deleted successfully",
		errorMessage: (e) => e.message,
		invalidate: [
			orpc.brands.list.key({ input: { organizationId: organizationId! } }),
		],
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view brands.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="text-lg font-medium text-destructive">
					Failed to load data
				</p>
				<p className="text-sm text-muted-foreground mb-4">
					{error instanceof Error
						? error.message
						: "An unexpected error occurred"}
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
		<Skeleton
			name="inventory-brands-tab"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<>
				{tableData.length === 0 && (
					<EmptyState
						title="No brands yet"
						description="Add a brand to organize your products."
						icon={Tag}
					/>
				)}
				<DataTable
					columns={columns}
					data={tableData}
					organizationId={organizationId}
					onDelete={(id) => deleteMutation.mutate(id)}
					isMutating={deleteMutation.isPending}
				/>
			</>
		</Skeleton>
	);
}
