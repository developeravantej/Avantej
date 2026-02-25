import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/transfer-orders/view/data-table";
import { columns, type TransferOrderRow } from "@/components/tables/transfer-orders/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/transfer-orders/view"
)({
	component: RouteComponent,
});

const mockTransferOrders: TransferOrderRow[] = [
	{
		"Transfer Number": "TO-001",
		"Date Issued": "2025-02-01",
		Form: "Branch A",
		"Issued By": "User A",
		"Issued To": "Branch B",
		Status: "Pending",
	},
	{
		"Transfer Number": "TO-002",
		"Date Issued": "2025-02-06",
		Form: "Warehouse",
		"Issued By": "User B",
		"Issued To": "Store",
		Status: "Completed",
	},
];

function RouteComponent() {
	const [data, setData] = useState<TransferOrderRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setData(mockTransferOrders);
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
