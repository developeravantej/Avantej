import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { useProductData } from "@/hooks/useProductData";
import { Package } from "lucide-react";
import DataTable from "@/components/tables/products/view/data-table";
import { columns } from "@/components/tables/products/view/columns";
import type { ProductRow } from "@/components/tables/products/view/columns";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ProductPricingPage } from "@/components/pages/products/pricing-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view",
)({
	beforeLoad: async () => {
		await requirePermission("inventory:read");
	},
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
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PRODUCT CATALOG
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Products
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						Manage your product catalog and branch pricing
					</p>
				</div>
			</div>

			{/* Pill tabs */}
			<div className="mb-5 flex flex-wrap items-center gap-2">
				{PAGE_TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						onClick={() => navigate({ search: { tab: t.id } })}
						className={
							tab === t.id
								? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
								: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
						}
					>
						{t.label}
					</button>
				))}
			</div>

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
			<div className="flex flex-col items-center justify-center min-h-96 text-[#737373]">
				<Package className="h-8 w-8 mb-3 opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">No organisation selected</p>
				<p className="text-xs mt-1">Select an organisation to view products.</p>
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="rounded-2xl border border-[#e5e5e5] bg-white p-8 flex flex-col items-center justify-center gap-3">
				<p className="text-sm font-medium text-[#0a0a0a]">Failed to load products</p>
				<p className="text-xs text-[#737373]">
					{error instanceof Error ? error.message : "An unexpected error occurred"}
				</p>
				<button
					type="button"
					onClick={() => refetch()}
					className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
				>
					Try Again
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{/* Status filter pills */}
			<div className="flex flex-wrap items-center gap-2">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={
								isActive
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
							}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Empty state inside card */}
			{tableData.length === 0 ? (
				<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
					<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
						<Package className="h-8 w-8 mb-3 opacity-30" />
						<p className="text-sm font-medium text-[#0a0a0a]">No products found</p>
						<p className="text-xs mt-1">
							{statusFilter
								? "Try clearing the status filter or searching for a different term."
								: "Create your first product to get started."}
						</p>
					</div>
				</div>
			) : (
				<DataTable
					columns={columns}
					data={tableData}
					organizationId={organizationId}
					brands={brands}
					categories={categories}
					suppliers={suppliers}
					uoms={uoms}
				/>
			)}
		</div>
	);
}
