import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/$id",
)({
	component: SalesOrderDetailPage,
});

function StatusBadge({ status }: { status?: string | null }) {
	const variants: Record<
		string,
		"default" | "secondary" | "destructive" | "outline"
	> = {
		confirmed: "default",
		completed: "default",
		paid: "default",
		pending: "secondary",
		processing: "secondary",
		draft: "secondary",
		sent: "secondary",
		partially_paid: "secondary",
		cancelled: "destructive",
		rejected: "destructive",
		overdue: "destructive",
	};
	return (
		<Badge variant={variants[status ?? ""] ?? "outline"}>
			{status ?? "unknown"}
		</Badge>
	);
}

function SalesOrderDetailPage() {
	const { id } = Route.useParams();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const {
		data: order,
		isLoading: orderLoading,
		error: orderError,
	} = useQuery({
		queryKey: ["salesOrders", id],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.salesOrders.getById({ organizationId, id });
		},
		enabled: !!organizationId,
	});

	const { data: invoices = [] } = useQuery({
		queryKey: ["invoices", "by-order", id],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.invoices.list({ organizationId, salesOrderId: id });
		},
		enabled: !!organizationId,
	});

	if (orderLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	if (orderError || !order) {
		return (
			<div className="p-6 max-w-4xl mx-auto">
				<Link to="/dashboard/sales/view">
					<Button variant="ghost" size="sm" className="mb-4">
						<ArrowLeft className="h-4 w-4 mr-2" /> Back to Sales Orders
					</Button>
				</Link>
				<p className="text-muted-foreground">Order not found.</p>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl mx-auto">
			<Link to="/dashboard/sales/view">
				<Button variant="ghost" size="sm" className="mb-4">
					<ArrowLeft className="h-4 w-4 mr-2" /> Back to Sales Orders
				</Button>
			</Link>

			<div className="flex items-start justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold font-heading">
						Sales Order #{order.salesOrderNumber}
					</h1>
					<div className="flex items-center gap-3 mt-1">
						<StatusBadge status={order.status} />
						<span className="text-muted-foreground">
							{order.date
								? new Date(order.date).toLocaleDateString()
								: "\u2014"}
						</span>
					</div>
				</div>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Order Summary</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-4">
						<div>
							<dt className="text-sm text-muted-foreground">Total Amount</dt>
							<dd className="font-medium">
								{formatPrice(order.totalAmount ?? 0, "MYR")}
							</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">Customer</dt>
							<dd className="font-medium">{order.customerName ?? "\u2014"}</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">Created By</dt>
							<dd className="font-medium">{order.createdBy ?? "\u2014"}</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">Status</dt>
							<dd>
								<StatusBadge status={order.status} />
							</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">Customer Type</dt>
							<dd className="font-medium">{order.customerType ?? "\u2014"}</dd>
						</div>
						{order.notes && (
							<div className="col-span-2">
								<dt className="text-sm text-muted-foreground">Notes</dt>
								<dd className="font-medium">{order.notes}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>

			{invoices.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Invoices</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{invoices.map((inv) => (
								<div
									key={inv.id}
									className="flex items-center justify-between p-3 border rounded"
								>
									<span className="font-mono text-sm">
										{inv.invoiceNumber}
									</span>
									<span className="text-sm">
										{formatPrice(inv.totalAmount ?? 0, "MYR")}
									</span>
									<StatusBadge status={inv.status} />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
