import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { useProductData } from "@/hooks/useProductData";
import { Package } from "lucide-react";
import DataTable from "@/components/tables/products/view/data-table";
import { columns } from "@/components/tables/products/view/columns";
import type { ProductRow } from "@/components/tables/products/view/columns";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ProductPricingPage } from "@/components/pages/products/pricing-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "products",
	}),
	component: ProductsViewPage,
});

type ProductStatus = "active" | "inactive" | "discontinued";

const STATUS_TABS: { value: ProductStatus | undefined; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	{ value: "discontinued", label: "Discontinued" },
];

const PAGE_TABS = [
	{ id: "products", label: "Products" },
	{ id: "pricing", label: "Pricing" },
];

function ProductsViewPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [statusFilter, setStatusFilter] = useState<ProductStatus | undefined>(undefined);

	// Fetch products via oRPC
	const { data: products = [], isLoading, isError, error, refetch } = useQuery({
		...orpc.products.list.queryOptions({
			input: {
				organizationId: organizationId!,
				status: statusFilter,
			},
		}),
		enabled: !!organizationId && tab === "products",
	});

	// Fetch brands/categories/suppliers/uoms for the form dropdowns
	const { brands, categories, suppliers, uoms } = useProductData(organizationId);

	// Map API response to ProductRow shape
	const tableData: ProductRow[] = products.map((p: any) => ({
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

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div>
					<h1 className="text-xl font-semibold">Products</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Manage your product catalog and branch pricing
					</p>
				</div>
			</div>
			<div className="shrink-0 border-b border-border/40 px-6">
				<div className="flex h-10 items-end gap-0">
					{PAGE_TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`px-4 pb-2 pt-0 text-sm font-medium border-b-2 transition-colors ${
								tab === t.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				{tab === "pricing" ? (
					<ProductPricingPage />
				) : (
					<ProductsListTab
						organizationId={organizationId}
						statusFilter={statusFilter}
						setStatusFilter={setStatusFilter}
						tableData={tableData}
						isLoading={isLoading}
						isError={isError}
						error={error}
						refetch={refetch}
						brands={brands}
						categories={categories}
						suppliers={suppliers}
						uoms={uoms}
					/>
				)}
			</div>
		</div>
	);
}

interface ProductsListTabProps {
	organizationId: string | null;
	statusFilter: ProductStatus | undefined;
	setStatusFilter: (v: ProductStatus | undefined) => void;
	tableData: ProductRow[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
	brands: ReturnType<typeof useProductData>["brands"];
	categories: ReturnType<typeof useProductData>["categories"];
	suppliers: ReturnType<typeof useProductData>["suppliers"];
	uoms: ReturnType<typeof useProductData>["uoms"];
}

function ProductsListTab({
	organizationId,
	statusFilter,
	setStatusFilter,
	tableData,
	isLoading,
	isError,
	error,
	refetch,
	brands,
	categories,
	suppliers,
	uoms,
}: ProductsListTabProps) {
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view products.
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
		<div className="p-6 space-y-6 h-full overflow-auto">
			{/* Header */}
			<PageHeader
				icon={Package}
				title="Products"
				description="Manage your product catalog"
			/>

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
				<EmptyState
					title="No products found"
					description="Create your first product to get started."
					icon={Package}
				/>
			)}

			{/* Table */}
			<DataTable
				columns={columns}
				data={tableData}
				organizationId={organizationId}
				brands={brands}
				categories={categories}
				suppliers={suppliers}
				uoms={uoms}
			/>
		</div>
	);
}
