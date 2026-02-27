import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/products/view/data-table";
import { columns, type ProductRow } from "@/components/tables/products/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.products.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: ProductRow[] = apiData.map((item) => ({
		Description: item.name,
		SKU: item.sku,
		Type: item.type,
		Barcode: item.barcode ?? "",
		"Conversion Factor": Number(item.conversionFactor),
		Price: item.price,
		Brand: item.brandId ?? "",
		Category: item.categoryId ?? "",
		Supplier: item.supplierId ?? "",
		Stock: 0,
		Status: item.status,
	}));

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
