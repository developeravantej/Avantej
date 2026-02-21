import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/sales/view/data-table";
import { columns, type SalesRow } from "@/components/tables/sales/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const [data, setData] = useState<{ items: SalesRow[] } | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const mockServiceData: SalesRow[] = [
		{
			date: "2025-07-14",
			sales_order: "#1",
			total_sales: 200,
			customer_name: "Customer A",
			created_by: "User A",
		},
		{
			date: "2025-07-15",
			sales_order: "#2",
			total_sales: 350,
			customer_name: "Customer B",
			created_by: "User B",
		},
		{
			date: "2025-07-16",
			sales_order: "#3",
			total_sales: 150,
			customer_name: "Customer C",
			created_by: "User C",
		},
		{
			date: "2025-07-17",
			sales_order: "#4",
			total_sales: 480,
			customer_name: "Customer D",
			created_by: "User A",
		},
		{
			date: "2025-07-18",
			sales_order: "#5",
			total_sales: 220,
			customer_name: "Customer E",
			created_by: "User B",
		},
	];

	useEffect(() => {
		setData({ items: mockServiceData });
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

	return (
		<DataTable<SalesRow, unknown> columns={columns} data={data?.items ?? []} />
	);
}
