import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { useProductData } from "@/hooks/useProductData";
import { toast } from "sonner";
import { Package } from "lucide-react";
import DataTable from "@/components/tables/products/view/data-table";
import { columns } from "@/components/tables/products/view/columns";
import type { ProductRow } from "@/components/tables/products/view/columns";
import type { CreateProductInput, UpdateProductInput } from "@/hooks/useProductForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view",
)({
	component: ProductsViewPage,
});

type ProductStatus = "active" | "inactive" | "discontinued";

const STATUS_TABS: { value: ProductStatus | undefined; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	{ value: "discontinued", label: "Discontinued" },
];

function ProductsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<ProductStatus | undefined>(undefined);

	// Use .key() for partial-match invalidation — matches all products.list queries
	function invalidateProducts() {
		queryClient.invalidateQueries({
			queryKey: orpc.products.list.key(),
		});
	}

	// Fetch products via oRPC
	const { data: products = [], isLoading, isError, error, refetch } = useQuery({
		...orpc.products.list.queryOptions({
			input: {
				organizationId: organizationId!,
				status: statusFilter,
			},
		}),
		enabled: !!organizationId,
	});

	// Fetch brands/categories/suppliers/uoms for the form
	const { brands, categories, suppliers, uoms } = useProductData(organizationId);

	// Create mutation
	const createMutation = useMutation({
		mutationFn: (data: CreateProductInput) =>
			client.products.create({ organizationId: organizationId!, ...data }),
		onSuccess: () => {
			invalidateProducts();
			toast.success("Product created successfully");
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to create product: ${message}`);
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: ({ id, ...data }: { id: string } & UpdateProductInput) =>
			client.products.update({ organizationId: organizationId!, id, ...data }),
		onSuccess: () => {
			invalidateProducts();
			toast.success("Product updated successfully");
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to update product: ${message}`);
		},
	});

	function handleProductCreate(data: CreateProductInput) {
		createMutation.mutate(data);
	}

	function handleProductUpdate(data: { id: string } & UpdateProductInput) {
		updateMutation.mutate(data);
	}

	// Map API response to ProductRow shape
	const tableData: ProductRow[] = products.map((p) => ({
		id: p.id,
		sku: p.sku,
		name: p.name,
		barcode: p.barcode ?? null,
		type: p.type ?? null,
		brandId: p.brandId ?? null,
		categoryId: p.categoryId ?? null,
		supplierId: p.supplierId ?? null,
		uomId: p.uomId ?? null,
		conversionFactor: p.conversionFactor ?? null,
		price: p.price,
		status: p.status ?? null,
		createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
		updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
	}));

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view products.
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
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
					<Package className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading">Products</h1>
					<p className="text-sm text-muted-foreground">
						Manage your product catalog
					</p>
				</div>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Empty state */}
			{tableData.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<p className="text-lg font-medium">No products found</p>
					<p className="text-sm">Create your first product to get started.</p>
				</div>
			)}

			{/* Table */}
			<DataTable
				columns={columns}
				data={tableData}
				onProductCreate={handleProductCreate}
				onProductUpdate={handleProductUpdate}
				isCreating={createMutation.isPending}
				isUpdating={updateMutation.isPending}
				brands={brands}
				categories={categories}
				suppliers={suppliers}
				uoms={uoms}
			/>
		</div>
	);
}
