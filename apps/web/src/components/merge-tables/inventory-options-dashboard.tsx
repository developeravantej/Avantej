import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/brands/view/data-table";
import { columns as brandColumns } from "@/components/tables/brands/view/columns";
import CategoryDataTable from "@/components/tables/categories/view/data-table";
import { columns as categoryColumns } from "@/components/tables/categories/view/columns";
import { DataTable as SupplierDataTable } from "@/components/tables/suppliers/view/data-table";
import { columns as supplierColumns } from "@/components/tables/suppliers/view/columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrandRow } from "@/components/tables/brands/view/columns";
import type { CategoryRow } from "@/components/tables/categories/view/columns";
import type { SupplierRow } from "@/components/tables/suppliers/view/columns";

export function InventoryOptionsDashboard() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: brandsApiData = [], isLoading: brandsLoading, refetch: refetchBrands } = useQuery({
		queryKey: ["brands", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.brands.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: categoriesApiData = [], isLoading: categoriesLoading, refetch: refetchCategories } = useQuery({
		queryKey: ["productCategories", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.productCategories.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: suppliersApiData = [], isLoading: suppliersLoading, refetch: refetchSuppliers } = useQuery({
		queryKey: ["suppliers", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.suppliers.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const isLoading = brandsLoading || categoriesLoading || suppliersLoading;

	const brandsData: BrandRow[] = brandsApiData.map((item) => ({
		ID: item.id,
		Name: item.name,
		"Products Assigned": 0,
	}));

	const categoriesData: CategoryRow[] = categoriesApiData.map((item) => ({
		ID: item.id,
		Name: item.name,
		"External Code": item.externalCode ?? "",
		"Products Assigned": 0,
	}));

	const suppliersData: SupplierRow[] = suppliersApiData.map((item) => ({
		ID: item.id,
		Name: item.name,
		Description: item.description ?? "N/A",
		Account: item.accountNumber ?? "N/A",
		Terms: item.paymentTerms ?? "N/A",
		"Contact Person": item.contactPerson ?? "N/A",
		Contact: item.contactPhone ?? "N/A",
		Office: item.officePhone ?? "N/A",
		Email: item.email ?? "N/A",
		Website: item.website ?? "N/A",
		Barcode: item.barcode ?? "N/A",
		"Created At": item.createdAt ? item.createdAt.toISOString() : undefined,
		"Updated At": item.updatedAt ? item.updatedAt.toISOString() : undefined,
	}));

	const handleBrandCreated = async () => {
		await refetchBrands();
	};

	const handleCategoryCreated = async () => {
		await refetchCategories();
	};

	const handleSupplierCreated = async () => {
		await refetchSuppliers();
	};

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
		<div className="space-y-4 p-4 md:p-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inventory Options</h1>
			</div>

			{/* Top Row - Brands and Categories */}
			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							Brands
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<DataTable
							columns={brandColumns}
							data={brandsData}
							onBrandCreated={handleBrandCreated}
						/>
					</CardContent>
				</Card>

				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							Categories
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<CategoryDataTable
							columns={categoryColumns}
							data={categoriesData}
							onCategoryCreated={handleCategoryCreated}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Bottom Row - Suppliers */}
			<Card className="gap-0 w-full">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
					<CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
						Suppliers
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-0 px-4 md:px-6">
					<SupplierDataTable
						columns={supplierColumns}
						data={suppliersData}
						onSupplierCreated={handleSupplierCreated}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
