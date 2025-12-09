import { orpc } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

/**
 * Dashboard Route
 * 
 * Main dashboard page - uses _authenticated layout
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
	component: DashboardComponent,
});

function DashboardComponent() {
	const { user } = useAuth();
	const privateData = useQuery(orpc.privateData.queryOptions());

	return (
		<div>
			<h1 className="text-3xl font-bold mb-4">Dashboard</h1>
			<p className="text-lg mb-2">Welcome {user?.full_name || user?.email || "User"}!</p>
			{privateData.data && (
				<p className="text-muted-foreground">API Status: {privateData.data?.message}</p>
			)}
		</div>
	);
}



