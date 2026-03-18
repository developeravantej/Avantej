"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { useState } from "react";
import { DataTable as UomDataTable } from "@/components/tables/uom/view/data-table";
import { columns as uomColumns } from "@/components/tables/uom/view/columns";
import UomConversionDataTable from "@/components/tables/uom-conversions/view/data-table";
import { columns as uomConversionColumns } from "@/components/tables/uom-conversions/view/columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UomOptionsDashboard() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// ---- UOM add/edit dialog state for base UOMs ----
	const [uomAddOpen, setUomAddOpen] = useState(false);
	const [uomEditTarget, setUomEditTarget] = useState<{
		id: string;
		name: string;
		description: string;
	} | null>(null);

	// ---- UOM Conversion add/edit dialog state ----
	const [convAddOpen, setConvAddOpen] = useState(false);
	const [convEditTarget, setConvEditTarget] = useState<{
		id: string;
		name: string;
		description: string;
		baseUomId: string;
		conversionFactor: string;
	} | null>(null);

	// ---- Query: all UOMs ----
	const { data: allUoms = [], isLoading } = useQuery({
		queryKey: ["unitsOfMeasure", organizationId],
		queryFn: () =>
			client.unitsOfMeasure.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	// ---- Derived data ----
	// Map to UomRow shape
	const allUomRows = allUoms.map((u) => ({
		id: u.id,
		name: u.name,
		description: u.description ?? null,
		baseUomId: u.baseUomId ?? null,
		conversionFactor: u.conversionFactor,
		createdAt: (u.createdAt ?? new Date()) as Date,
		updatedAt: (u.updatedAt ?? new Date()) as Date,
	}));
	const baseUoms = allUomRows.filter((u) => !u.baseUomId);
	const conversions = allUomRows.filter((u) => u.baseUomId !== null);
	const uomMap = Object.fromEntries(allUoms.map((u) => [u.id, u.name]));

	// ---- Mutations ----
	const createUomMutation = useMutation({
		mutationFn: (vars: { name: string; description?: string }) =>
			client.unitsOfMeasure.create({
				organizationId: organizationId!,
				name: vars.name,
				description: vars.description,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Unit of measure created");
			setUomAddOpen(false);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create unit of measure");
		},
	});

	const updateUomMutation = useMutation({
		mutationFn: (vars: { id: string; name: string; description?: string }) =>
			client.unitsOfMeasure.update({
				organizationId: organizationId!,
				id: vars.id,
				name: vars.name,
				description: vars.description,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Unit of measure updated");
			setUomEditTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update unit of measure");
		},
	});

	const deleteUomMutation = useMutation({
		mutationFn: (id: string) =>
			client.unitsOfMeasure.delete({
				organizationId: organizationId!,
				id,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Unit of measure deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete unit of measure");
		},
	});

	const createConvMutation = useMutation({
		mutationFn: (vars: {
			name: string;
			description?: string;
			baseUomId: string;
			conversionFactor: string;
		}) =>
			client.unitsOfMeasure.create({
				organizationId: organizationId!,
				name: vars.name,
				description: vars.description,
				baseUomId: vars.baseUomId,
				conversionFactor: vars.conversionFactor,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion created");
			setConvAddOpen(false);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create conversion");
		},
	});

	const updateConvMutation = useMutation({
		mutationFn: (vars: {
			id: string;
			name?: string;
			description?: string;
			baseUomId?: string;
			conversionFactor?: string;
		}) =>
			client.unitsOfMeasure.update({
				organizationId: organizationId!,
				id: vars.id,
				name: vars.name,
				description: vars.description,
				baseUomId: vars.baseUomId,
				conversionFactor: vars.conversionFactor,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion updated");
			setConvEditTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update conversion");
		},
	});

	const deleteConvMutation = useMutation({
		mutationFn: (id: string) =>
			client.unitsOfMeasure.delete({
				organizationId: organizationId!,
				id,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["unitsOfMeasure", organizationId],
			});
			toast.success("Conversion deleted");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to delete conversion");
		},
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view units of measure.
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
					Unit of Measure
				</h1>
			</div>

			{/* Left and Right Layout - UoMs and UoM Conversions */}
			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
				{/* Left - Base UoMs */}
				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							UoM List
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<UomDataTable
							columns={uomColumns}
							data={baseUoms}
							isAddDialogOpen={uomAddOpen}
							onAddDialogOpenChange={setUomAddOpen}
							editTarget={uomEditTarget}
							onEditTargetChange={setUomEditTarget}
							onCreate={(vars) => createUomMutation.mutate(vars)}
							onUpdate={(vars) => updateUomMutation.mutate(vars)}
							onDelete={(id) => deleteUomMutation.mutate(id)}
							isCreating={createUomMutation.isPending}
							isUpdating={updateUomMutation.isPending}
							isDeleting={deleteUomMutation.isPending}
						/>
					</CardContent>
				</Card>

				{/* Right - UoM Conversions */}
				<Card className="gap-0">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-4 md:px-6">
						<CardTitle className="text-base md:text-lg font-semibold">
							UoM Conversions
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 px-4 md:px-6">
						<UomConversionDataTable
							columns={uomConversionColumns}
							data={conversions}
							uomMap={uomMap}
							baseUoms={baseUoms.map((u) => ({ id: u.id, name: u.name }))}
							isAddDialogOpen={convAddOpen}
							onAddDialogOpenChange={setConvAddOpen}
							editTarget={convEditTarget}
							onEditTargetChange={setConvEditTarget}
							onCreate={(vars) => createConvMutation.mutate(vars)}
							onUpdate={(vars) => updateConvMutation.mutate(vars)}
							onDelete={(id) => deleteConvMutation.mutate(id)}
							isCreating={createConvMutation.isPending}
							isUpdating={updateConvMutation.isPending}
							isDeleting={deleteConvMutation.isPending}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
