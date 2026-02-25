import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
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

const mockBrands: BrandRow[] = [
	{ ID: "1", Name: "Brand A", "Products Assigned": 12 },
	{ ID: "2", Name: "Brand B", "Products Assigned": 8 },
];

const mockCategories: CategoryRow[] = [
	{ ID: "1", Name: "Electronics", "External Code": "EXT-001", "Products Assigned": 24 },
	{ ID: "2", Name: "Accessories", "External Code": "EXT-002", "Products Assigned": 15 },
];

const mockSuppliers: SupplierRow[] = [
	{
		ID: "1",
		Name: "Supplier One",
		Description: "Main supplier",
		Account: "ACC-001",
		Terms: "Net 30",
		"Contact Person": "John Doe",
		Contact: "+60123456789",
		Office: "+60312345678",
		Email: "john@supplier.com",
		Website: "https://supplier.com",
		Barcode: "N/A",
	},
];

export function InventoryOptionsDashboard() {
	const { isLoading: authLoading, isAuthenticated } = useAuth();
	const [brandsData, setBrandsData] = useState<BrandRow[]>([]);
	const [categoriesData, setCategoriesData] = useState<CategoryRow[]>([]);
	const [suppliersData, setSuppliersData] = useState<SupplierRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadBrands = useCallback(async () => {
		try {
			setBrandsData(mockBrands);
		} catch (error) {
			console.error("Failed to load brands data:", error);
			toast.error("Failed to load brands data");
		}
	}, []);

	const loadCategories = useCallback(async () => {
		try {
			setCategoriesData(mockCategories);
		} catch (error) {
			console.error("Failed to load categories data:", error);
			toast.error("Failed to load categories data");
		}
	}, []);

	const loadSuppliers = useCallback(async () => {
		try {
			setSuppliersData(mockSuppliers);
		} catch (error) {
			console.error("Failed to load suppliers data:", error);
			toast.error("Failed to load suppliers data");
		}
	}, []);

	const loadAllData = useCallback(async () => {
		setIsLoading(true);
		await Promise.all([loadBrands(), loadCategories(), loadSuppliers()]);
		setIsLoading(false);
	}, [loadBrands, loadCategories, loadSuppliers]);

	useEffect(() => {
		if (!authLoading && isAuthenticated) {
			loadAllData();
		}
	}, [authLoading, isAuthenticated, loadAllData]);

	if (authLoading || isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return null;
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
							onBrandCreated={loadBrands}
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
							onCategoryCreated={loadCategories}
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
						onSupplierCreated={loadSuppliers}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
