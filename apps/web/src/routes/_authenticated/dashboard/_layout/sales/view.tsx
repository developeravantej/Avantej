import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { columns, type SalesRow } from "@/components/tables/sales/view/columns";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/view",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["salesOrders", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.salesOrders.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: SalesRow[] = apiData.map((item) => ({
		date: item.date ? item.date.toISOString() : null,
		sales_order: item.salesOrderNumber,
		total_sales: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
	}));

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="font-medium text-destructive text-lg">
					Failed to load data
				</p>
				<p className="mb-4 text-muted-foreground text-sm">
					{error instanceof Error
						? error.message
						: "An unexpected error occurred"}
				</p>
				<Button variant="outline" onClick={() => refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4 p-6">
			<div className="flex items-center justify-between">
				<h1 className="font-bold font-heading text-2xl">Sales Orders</h1>
				<Link to="/dashboard/sales/create">
					<Button>
						<Plus className="mr-2 h-4 w-4" />
						New Sale
					</Button>
				</Link>
			</div>
			<DataTable<SalesRow, unknown> columns={columns} data={data} />
		</div>
	);
}
