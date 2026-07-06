import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LayoutGrid } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import DataTable from "@/components/tables/categories/view/data-table";
import { columns } from "@/components/tables/categories/view/columns";
import type { CategoryRow } from "@/components/tables/categories/view/columns";

export function CategoriesTabPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Query
	const {
		data: categories = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: orpc.productCategories.list.key({
			input: { organizationId: organizationId! },
		}),
		queryFn: () =>
			client.productCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const { data: products } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const productCountByCategory = useMemo(() => {
		const counts = new Map<string, number>();
		products?.forEach((p) => {
			if (p.categoryId)
				counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
		});
		return counts;
	}, [products]);

	// Delete mutation stays in parent
	const deleteMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.productCategories.delete({ organizationId: organizationId!, id }),
		successMessage: "Category deleted successfully",
		errorMessage: (e) => e.message,
		invalidate: [
			orpc.productCategories.list.key({
				input: { organizationId: organizationId! },
			}),
		],
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view categories.
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

	const tableData: CategoryRow[] = categories.map((c) => ({
		ID: c.id,
		Name: c.name,
		externalCode: c.externalCode ?? "",
		"Products Assigned": productCountByCategory.get(c.id) ?? 0,
	}));

	return (
		<Skeleton
			name="inventory-categories-tab"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<>
				{tableData.length === 0 && (
					<EmptyState
						title="No categories yet"
						description="Create a category to organize products."
						icon={LayoutGrid}
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
