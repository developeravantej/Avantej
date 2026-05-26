import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/tables/suppliers/view/data-table";
import type { SupplierRow } from "@/components/tables/suppliers/view/columns";

// Active / all toggle tabs
const ACTIVE_TABS = [
	{ label: "Active", value: true as boolean | undefined },
	{ label: "All", value: undefined as boolean | undefined },
	{ label: "Inactive", value: false as boolean | undefined },
];

export function SuppliersTabPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [activeFilter, setActiveFilter] = useState<boolean | undefined>(true);

	// ---- Query ----
	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: [
			...orpc.suppliers.list.key(),
			{ organizationId, isActive: activeFilter },
		],
		queryFn: () =>
			client.suppliers.list({
				organizationId: organizationId!,
				isActive: activeFilter,
			}),
		enabled: !!organizationId,
	});

	// ---- Delete/deactivate mutation (stays in parent) ----
	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.suppliers.deactivate({ organizationId: organizationId!, id }),
		successMessage: false,
		errorMessage: (error) =>
			`Failed to deactivate supplier: ${error.message || "An unexpected error occurred"}`,
		invalidate: [[...orpc.suppliers.list.key(), { organizationId }]],
	});

	// ---- Map API data to SupplierRow ----
	const tableData: SupplierRow[] = apiData.map((s: any) => ({
		id: s.id,
		name: s.name,
		description: s.description ?? null,
		accountNumber: s.accountNumber ?? null,
		paymentTerms: s.paymentTerms ?? null,
		contactPerson: s.contactPerson ?? null,
		contactPhone: s.contactPhone ?? null,
		officePhone: s.officePhone ?? null,
		email: s.email ?? null,
		website: s.website ?? null,
		barcode: s.barcode ?? null,
		isActive: s.isActive,
		createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
		updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
	}));

	// ---- Guard ----
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view suppliers.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="text-lg font-medium text-destructive">
					Failed to load data
				</p>
				<p className="text-sm text-muted-foreground mb-4">
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
		<Skeleton name="inventory-suppliers-tab" loading={isLoading} fallback={<PageLoader />}>
		<div className="space-y-6">
			{/* Header */}
			<PageHeader
				icon={Building2}
				title="Suppliers"
				description="Manage your product suppliers"
				actions={<Badge variant="outline">{tableData.length} supplier(s)</Badge>}
			/>

			{/* Active / Inactive filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{ACTIVE_TABS.map((tab) => {
					const isSelected = activeFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setActiveFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isSelected
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Empty state */}
			{tableData.length === 0 && (
				<EmptyState
					title="No suppliers yet"
					description="Add a supplier to start purchasing."
					icon={Building2}
				/>
			)}

			{/* Table */}
			<DataTable
				data={tableData}
				organizationId={organizationId}
				onDeactivateSupplier={async (id) => {
					await deactivateMutation.mutateAsync(id);
				}}
				isDeactivating={deactivateMutation.isPending}
			/>
		</div>
		</Skeleton>
	);
}
