import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/tables/stock-requests/view/data-table";
import { columns, type StockRequestRow } from "@/components/tables/stock-requests/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/stock-requests/view"
)({
	component: RouteComponent,
});

const mockStockRequests: StockRequestRow[] = [
	{
		"Request Number": "SR-001",
		"Date Issued": "2025-02-01",
		"Issued By": "User A",
		"Issued To": "Warehouse",
		Status: "Pending",
	},
	{
		"Request Number": "SR-002",
		"Date Issued": "2025-02-05",
		"Issued By": "User B",
		"Issued To": "Store",
		Status: "Approved",
	},
];

function RouteComponent() {
	const [data, setData] = useState<StockRequestRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setData(mockStockRequests);
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
