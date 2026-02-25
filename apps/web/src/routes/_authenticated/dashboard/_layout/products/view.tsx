import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/products/view/data-table";
import { columns, type ProductRow } from "@/components/tables/products/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view"
)({
	component: RouteComponent,
});

const mockProducts: ProductRow[] = [
	{
		Description: "Widget A",
		SKU: "SKU-001",
		Type: "product",
		Barcode: "123456789",
		"Conversion Factor": 1,
		Price: 29.99,
		Brand: "Brand X",
		Category: "Electronics",
		Supplier: "Supplier 1",
		Stock: 150,
		Status: "Active",
	},
	{
		Description: "Widget B",
		SKU: "SKU-002",
		Type: "product",
		Barcode: "987654321",
		"Conversion Factor": 1,
		Price: 49.99,
		Brand: "Brand Y",
		Category: "Accessories",
		Supplier: "Supplier 2",
		Stock: 45,
		Status: "Active",
	},
];

function RouteComponent() {
	const [data, setData] = useState<ProductRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setData(mockProducts);
		setIsLoading(false);
	}, []);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return <DataTable columns={columns} data={data} />;
}
