import { useQuery } from "@tanstack/react-query";
import { client, queryClient } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/useApiMutation";

export function ImpersonationBanner() {
	const { data } = useQuery({
		queryKey: ["admin", "impersonationStatus"],
		queryFn: () => client.admin.getImpersonationStatus({}),
		staleTime: 60_000,
		refetchOnWindowFocus: true,
	});

	const stopMutation = useApiMutation({
		mutationFn: async () => {
			// TODO Phase 6/7: when type === 'tenant', route to client.tenantAdmin.stopImpersonating({})
			// once that procedure exists. For now both platform and tenant type fall back to
			// admin.stopImpersonating as a temporary measure agreed in Phase 3 planning.
			return client.admin.stopImpersonating({});
		},
		errorMessage: (err) => err.message || "Failed to stop impersonation",
		onSuccess: (result) => {
			queryClient.invalidateQueries();
			// Hard reload required so the restored admin cookie is picked up cleanly by
			// orpcTenantMiddleware and createContext — router.navigate() will not work here.
			window.location.href = result.redirectTo;
		},
	});

	if (data?.isImpersonating !== true) {
		return null;
	}

	return (
		<>
			<div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-950 px-4 py-2 flex items-center justify-between shadow-md">
				<p className="font-medium text-sm">
					Impersonating{" "}
					<strong>{data.impersonatedUser.email}</strong> as{" "}
					{data.adminUser.email}
				</p>
				<Button
					size="sm"
					variant="outline"
					className="border-yellow-900 text-yellow-950 hover:bg-yellow-500"
					onClick={() => stopMutation.mutate()}
					disabled={stopMutation.isPending}
				>
					{stopMutation.isPending ? "Stopping…" : "Stop impersonating"}
				</Button>
			</div>
			{/* Spacer pushes normal-flow content below the fixed banner */}
			<div className="h-10" />
		</>
	);
}
