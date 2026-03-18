import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/tables/suppliers/view/data-table";
import type { SupplierRow } from "@/components/tables/suppliers/view/columns";
import type { SupplierFormData } from "@/components/forms/supplier-form";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/suppliers/view"
)({
	component: SuppliersViewPage,
});

// Active / all toggle tabs
const ACTIVE_TABS = [
	{ label: "Active", value: true as boolean | undefined },
	{ label: "All", value: undefined as boolean | undefined },
	{ label: "Inactive", value: false as boolean | undefined },
];

function SuppliersViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [activeFilter, setActiveFilter] = useState<boolean | undefined>(true);

	// ---- Query ----
	const { data: apiData = [], isLoading } = useQuery({
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

	// ---- Mutations ----
	const createMutation = useMutation({
		mutationFn: (data: SupplierFormData) =>
			client.suppliers.create({
				organizationId: organizationId!,
				...data,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [...orpc.suppliers.list.key(), { organizationId }],
			});
			toast.success("Supplier created successfully");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create supplier");
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: SupplierFormData }) =>
			client.suppliers.update({
				organizationId: organizationId!,
				id,
				...data,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [...orpc.suppliers.list.key(), { organizationId }],
			});
			toast.success("Supplier updated successfully");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update supplier");
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (id: string) =>
			client.suppliers.deactivate({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [...orpc.suppliers.list.key(), { organizationId }],
			});
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to deactivate supplier");
		},
	});

	// ---- Map API data to SupplierRow ----
	const tableData: SupplierRow[] = apiData.map((s) => ({
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
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<Building2 className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold">Suppliers</h1>
						<p className="text-sm text-muted-foreground">
							Manage your product suppliers
						</p>
					</div>
				</div>
				<Badge variant="outline">{tableData.length} supplier(s)</Badge>
			</div>

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

			{/* Table */}
			<DataTable
				data={tableData}
				onCreateSupplier={async (data) => {
					await createMutation.mutateAsync(data);
				}}
				onUpdateSupplier={async (id, data) => {
					await updateMutation.mutateAsync({ id, data });
				}}
				onDeactivateSupplier={async (id) => {
					await deactivateMutation.mutateAsync(id);
				}}
				isCreating={createMutation.isPending}
				isUpdating={updateMutation.isPending}
				isDeactivating={deactivateMutation.isPending}
			/>
		</div>
	);
}
