import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/service/view/data-table";
import { columns } from "@/components/tables/service/view/columns";
import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useMemo } from "react";

/**
 * Service View Route
 *
 * Displays a table of all services with CRUD operations.
 * Requires: service_management:read permission
 */
export const Route = createFileRoute("/_authenticated/service/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "service_management", action: "read" },
			"/dashboard"
		);
	},
	component: ServiceViewComponent,
});

function ServiceViewComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: categories = [], isLoading: categoriesLoading } = useQuery({
		queryKey: ["service-categories", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.serviceCategories.list({ organizationId });
		},
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const {
		data: services = [],
		isLoading: servicesLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["services", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.services.list({ organizationId, isActive: undefined });
		},
		enabled: !!organizationId,
		staleTime: 30 * 1000,
	});

	const categoryNameMap = useMemo(() => {
		const map: Record<string, string> = {};
		for (const c of categories) {
			map[c.id] = c.name;
		}
		return map;
	}, [categories]);

	const servicesWithCategoryName = useMemo(() => {
		return services.map((s: any) => ({
			...s,
			service_category_name: s.categoryId ? categoryNameMap[s.categoryId] ?? null : null,
		}));
	}, [services, categoryNameMap]);

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold">Services</h1>
				<p className="text-muted-foreground">No organization selected. Please select an organization first.</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold">Services</h1>
				<p className="text-destructive">{error instanceof Error ? error.message : "Failed to load services"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Services</h1>
			</div>
			<DataTable
				columns={columns}
				data={servicesWithCategoryName}
				{...({ organizationId, categories, isLoading: servicesLoading || categoriesLoading, onSuccess: refetch } as any)}
			/>
		</div>
	);
}
