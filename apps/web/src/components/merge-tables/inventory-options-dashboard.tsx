"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import DataTable from "@/components/tables/brands/view/data-table";
import { columns as brandColumns } from "@/components/tables/brands/view/columns";
import CategoryDataTable from "@/components/tables/categories/view/data-table";
import { columns as categoryColumns } from "@/components/tables/categories/view/columns";
import { DataTable as SupplierDataTable } from "@/components/tables/suppliers/view/data-table";
import type { SupplierRow } from "@/components/tables/suppliers/view/columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrandFormData } from "@/components/forms/brand-form";
import type { CategoryFormData } from "@/components/forms/category-form";
import type { SupplierFormData } from "@/components/forms/supplier-form";

export function InventoryOptionsDashboard() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// ---- Brands query ----
	const { data: brandsRaw = [], isLoading: brandsLoading } = useQuery({
		queryKey: ["brands", organizationId],
		queryFn: () => client.brands.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// ---- Product Categories query ----
	const { data: categoriesRaw = [], isLoading: categoriesLoading } = useQuery({
		queryKey: ["productCategories", organizationId],
		queryFn: () =>
			client.productCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// ---- Suppliers query ----
	const { data: suppliersRaw = [], isLoading: suppliersLoading } = useQuery({
		queryKey: ["suppliers", organizationId],
		queryFn: () => client.suppliers.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// ---- Brand mutations ----
	const createBrandMutation = useMutation({
		mutationFn: (data: BrandFormData) =>
			client.brands.create({
				organizationId: organizationId!,
				name: data.name,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["brands", organizationId] });
			toast.success("Brand created");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create brand");
		},
	});

	const updateBrandMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: BrandFormData }) =>
			client.brands.update({
				organizationId: organizationId!,
				id,
				name: data.name,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["brands", organizationId] });
			toast.success("Brand updated");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update brand");
		},
	});

	const deleteBrandMutation = useMutation({
		mutationFn: (id: string) =>
			client.brands.delete({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["brands", organizationId] });
			toast.success("Brand deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete brand");
		},
	});

	// ---- Category mutations ----
	const createCategoryMutation = useMutation({
		mutationFn: (data: CategoryFormData) =>
			client.productCategories.create({
				organizationId: organizationId!,
				name: data.name,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["productCategories", organizationId],
			});
			toast.success("Category created");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create category");
		},
	});

	const updateCategoryMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: CategoryFormData }) =>
			client.productCategories.update({
				organizationId: organizationId!,
				id,
				name: data.name,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["productCategories", organizationId],
			});
			toast.success("Category updated");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update category");
		},
	});

	const deleteCategoryMutation = useMutation({
		mutationFn: (id: string) =>
			client.productCategories.delete({
				organizationId: organizationId!,
				id,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["productCategories", organizationId],
			});
			toast.success("Category deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete category");
		},
	});

	// ---- Supplier mutations ----
	const createSupplierMutation = useMutation({
		mutationFn: (data: SupplierFormData) =>
			client.suppliers.create({
				organizationId: organizationId!,
				name: data.name,
				description: data.description ?? undefined,
				accountNumber: data.accountNumber ?? undefined,
				paymentTerms: data.paymentTerms ?? undefined,
				contactPerson: data.contactPerson ?? undefined,
				contactPhone: data.contactPhone ?? undefined,
				officePhone: data.officePhone ?? undefined,
				email: data.email ?? undefined,
				website: data.website ?? undefined,
				barcode: data.barcode ?? undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["suppliers", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create supplier");
		},
	});

	const updateSupplierMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: SupplierFormData }) =>
			client.suppliers.update({
				organizationId: organizationId!,
				id,
				name: data.name,
				description: data.description ?? undefined,
				accountNumber: data.accountNumber ?? undefined,
				paymentTerms: data.paymentTerms ?? undefined,
				contactPerson: data.contactPerson ?? undefined,
				contactPhone: data.contactPhone ?? undefined,
				officePhone: data.officePhone ?? undefined,
				email: data.email ?? undefined,
				website: data.website ?? undefined,
				barcode: data.barcode ?? undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["suppliers", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update supplier");
		},
	});

	const deactivateSupplierMutation = useMutation({
		mutationFn: (id: string) =>
			client.suppliers.deactivate({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["suppliers", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to deactivate supplier");
		},
	});

	// ---- Transform data ----
	const brandsData = brandsRaw.map((brand) => ({
		Name: brand.name,
		"Products Assigned": 0,
		ID: brand.id,
	}));

	const categoriesData = categoriesRaw.map((cat) => ({
		Name: cat.name,
		externalCode: "",
		"Products Assigned": 0,
		ID: cat.id,
	}));

	// Supplier DataTable expects SupplierRow shape (camelCase, matches schema)
	const suppliersData: SupplierRow[] = suppliersRaw.map((s) => ({
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
		createdAt: s.createdAt ? String(s.createdAt) : null,
		updatedAt: s.updatedAt ? String(s.updatedAt) : null,
	}));

	const isLoading = brandsLoading || categoriesLoading || suppliersLoading;

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view inventory options.
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
		<div className="space-y-4 p-4 md:p-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl md:text-3xl font-bold tracking-tight">
					Inventory Options
				</h1>
			</div>

			{/* Top Row - Brands and Categories */}
			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
				{/* Brands Table */}
				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							Brands
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<DataTable
							columns={brandColumns}
							data={brandsData}
							onAdd={(data) => createBrandMutation.mutate(data)}
							onEdit={(id, data) => updateBrandMutation.mutate({ id, data })}
							onDelete={(id) => deleteBrandMutation.mutate(id)}
							isMutating={
								createBrandMutation.isPending ||
								updateBrandMutation.isPending ||
								deleteBrandMutation.isPending
							}
						/>
					</CardContent>
				</Card>

				{/* Categories Table */}
				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							Categories
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<CategoryDataTable
							columns={categoryColumns}
							data={categoriesData}
							onAdd={(data) => createCategoryMutation.mutate(data)}
							onEdit={(id, data) =>
								updateCategoryMutation.mutate({ id, data })
							}
							onDelete={(id) => deleteCategoryMutation.mutate(id)}
							isMutating={
								createCategoryMutation.isPending ||
								updateCategoryMutation.isPending ||
								deleteCategoryMutation.isPending
							}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Bottom Row - Suppliers */}
			<Card className="gap-0">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
					<CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
						Suppliers
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-0 px-4 md:px-6">
					<SupplierDataTable
						data={suppliersData}
						onCreateSupplier={async (data) => {
							await createSupplierMutation.mutateAsync(data);
						}}
						onUpdateSupplier={async (id, data) => {
							await updateSupplierMutation.mutateAsync({ id, data });
						}}
						onDeactivateSupplier={async (id) => {
							await deactivateSupplierMutation.mutateAsync(id);
						}}
						isCreating={createSupplierMutation.isPending}
						isUpdating={updateSupplierMutation.isPending}
						isDeactivating={deactivateSupplierMutation.isPending}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
