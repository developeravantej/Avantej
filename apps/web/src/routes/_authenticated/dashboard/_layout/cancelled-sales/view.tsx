import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/cancelled-sales/view/data-table";
import { columns, type CancelledSaleRow } from "@/components/tables/cancelled-sales/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/cancelled-sales/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const [data, setData] = useState<{ items: CancelledSaleRow[] } | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const mockServiceData: CancelledSaleRow[] = [
		{
			date: "2025-07-14",
			cancellation: "#CAN-001",
			sales_order: "#SO-001",
			cancelled_amount: 200.0,
			customer_name: "Customer A",
			created_by: "User A",
		},
		{
			date: "2025-07-15",
			cancellation: "#CAN-002",
			sales_order: "#SO-002",
			cancelled_amount: 150.0,
			customer_name: "Customer B",
			created_by: "User B",
		},
		{
			date: "2025-07-16",
			cancellation: "#CAN-003",
			sales_order: "#SO-003",
			cancelled_amount: 120.0,
			customer_name: "Customer C",
			created_by: "User C",
		},
		{
			date: "2025-07-17",
			cancellation: "#CAN-004",
			sales_order: "#SO-004",
			cancelled_amount: 480.0,
			customer_name: "Customer D",
			created_by: "User A",
		},
		{
			date: "2025-07-18",
			cancellation: "#CAN-005",
			sales_order: "#SO-005",
			cancelled_amount: 250.0,
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
		<DataTable<CancelledSaleRow, unknown> columns={columns} data={data?.items ?? []} />
	);
}
