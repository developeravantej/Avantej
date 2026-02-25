import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/payment/view/data-table";
import { columns, type PaymentRow } from "@/components/tables/payment/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const [data, setData] = useState<{ items: PaymentRow[] } | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const mockServiceData: PaymentRow[] = [
		{
			date: "2025-07-14",
			invoice: "#INV-1001",
			sales_order: "#SO-001",
			mode: "Credit Card",
			total_paid: 200.0,
			customer_name: "Customer A",
			created_by: "User A",
			e_invoice_status: "Generated",
		},
		{
			date: "2025-07-15",
			invoice: "#INV-1002",
			sales_order: "#SO-002",
			mode: "Bank Transfer",
			total_paid: 350.0,
			customer_name: "Customer B",
			created_by: "User B",
			e_invoice_status: "Pending",
		},
		{
			date: "2025-07-16",
			invoice: "#INV-1003",
			sales_order: "#SO-003",
			mode: "Cash",
			total_paid: 150.0,
			customer_name: "Customer C",
			created_by: "User C",
			e_invoice_status: "Generated",
		},
		{
			date: "2025-07-17",
			invoice: "#INV-1004",
			sales_order: "#SO-004",
			mode: "UPI",
			total_paid: 480.0,
			customer_name: "Customer D",
			created_by: "User A",
			e_invoice_status: "Generated",
		},
		{
			date: "2025-07-18",
			invoice: "#INV-1005",
			sales_order: "#SO-005",
			mode: "Credit Card",
			total_paid: 220.0,
			customer_name: "Customer E",
			created_by: "User B",
			e_invoice_status: "Failed",
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
		<DataTable<PaymentRow, unknown> columns={columns} data={data?.items ?? []} />
	);
}
