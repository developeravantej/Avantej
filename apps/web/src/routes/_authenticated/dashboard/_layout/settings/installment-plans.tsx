import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Star, Plus, Edit, CreditCard } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/installment-plans",
)({
	component: InstallmentPlansPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type InstallmentPlanRow = {
	id: string;
	code: string;
	name: string;
	numInstallments: number;
	defaultIntervalDays: number;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
	sortOrder: number;
	createdAt: string;
};

type FormState = {
	code: string;
	name: string;
	numInstallments: string; // string for controlled input; parsed to int on submit
	defaultIntervalDays: string; // string for controlled input
	description: string;
	isDefault: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
	code: "",
	name: "",
	numInstallments: "1",
	defaultIntervalDays: "30",
	description: "",
	isDefault: false,
};

// ─── Page Component ───────────────────────────────────────────────────────────

function InstallmentPlansPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Status filter
	const [showInactive, setShowInactive] = useState(false);

	// Deactivate confirmation dialog state
	const [deactivateTarget, setDeactivateTarget] = useState<InstallmentPlanRow | null>(null);
	const [deactivateWarning, setDeactivateWarning] = useState<string | null>(null);
	const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

	// ─── Queries & Mutations ─────────────────────────────────────────────────

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["installmentPlans", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.installmentPlans.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const createMutation = useMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.create({
				organizationId,
				code: values.code.trim(),
				name: values.name,
				numInstallments: parseInt(values.numInstallments, 10),
				defaultIntervalDays: parseInt(values.defaultIntervalDays, 10),
				description: values.description || undefined,
				isDefault: values.isDefault,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installmentPlans", organizationId] });
			toast.success("Installment plan created successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to create installment plan.");
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, values }: { id: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.update({
				organizationId,
				id,
				name: values.name,
				numInstallments: parseInt(values.numInstallments, 10),
				defaultIntervalDays: parseInt(values.defaultIntervalDays, 10),
				description: values.description || undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installmentPlans", organizationId] });
			toast.success("Installment plan updated successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to update installment plan.");
		},
	});

	const setDefaultMutation = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.setDefault({ organizationId, id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installmentPlans", organizationId] });
			toast.success("Default installment plan updated.");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to set default installment plan.");
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.deactivate({ organizationId, id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installmentPlans", organizationId] });
			toast.success("Installment plan deactivated.");
			setDeactivateDialogOpen(false);
			setDeactivateTarget(null);
			setDeactivateWarning(null);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to deactivate installment plan.");
		},
	});

	const isMutating =
		createMutation.isPending ||
		updateMutation.isPending ||
		setDefaultMutation.isPending ||
		deactivateMutation.isPending;

	// ─── Sheet handlers ───────────────────────────────────────────────────────

	function openCreate() {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setSheetOpen(true);
	}

	function openEdit(row: InstallmentPlanRow) {
		setEditingId(row.id);
		setForm({
			code: row.code,
			name: row.name,
			numInstallments: String(row.numInstallments),
			defaultIntervalDays: String(row.defaultIntervalDays),
			description: row.description ?? "",
			isDefault: row.isDefault,
		});
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setEditingId(null);
		setForm(EMPTY_FORM);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!form.name.trim()) {
			toast.error("Name is required.");
			return;
		}
		if (!editingId && !form.code.trim()) {
			toast.error("Code is required.");
			return;
		}
		const numInstallments = parseInt(form.numInstallments, 10);
		if (Number.isNaN(numInstallments) || numInstallments < 1) {
			toast.error("Number of installments must be at least 1.");
			return;
		}
		const defaultIntervalDays = parseInt(form.defaultIntervalDays, 10);
		if (Number.isNaN(defaultIntervalDays) || defaultIntervalDays < 1) {
			toast.error("Default interval days must be at least 1.");
			return;
		}

		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	// ─── Deactivate with warning ──────────────────────────────────────────────

	async function handleDeactivateClick(row: InstallmentPlanRow) {
		setDeactivateTarget(row);
		setDeactivateWarning(null);

		// Check if any active service references this plan code
		if (organizationId) {
			try {
				const allServices = await client.services.list({ organizationId, isActive: true });
				const affectedCount = allServices.filter(
					(svc) => (svc.availablePaymentPlans ?? []).includes(row.code),
				).length;

				if (affectedCount > 0) {
					setDeactivateWarning(
						`This plan is currently enabled on ${affectedCount} active service${affectedCount === 1 ? "" : "s"}. Deactivating it will prevent customers from selecting it for new purchases but will not affect existing installment schedules.`,
					);
				}
			} catch {
				// If the services check fails, proceed without a warning
			}
		}

		setDeactivateDialogOpen(true);
	}

	// ─── Data processing ──────────────────────────────────────────────────────

	const rows: InstallmentPlanRow[] = apiData
		.filter((item) => (showInactive ? true : item.isActive))
		.map((item) => ({
			id: item.id,
			code: item.code,
			name: item.name,
			numInstallments: item.numInstallments,
			defaultIntervalDays: item.defaultIntervalDays,
			description: item.description ?? null,
			isDefault: item.isDefault ?? false,
			isActive: item.isActive ?? true,
			sortOrder: item.sortOrder ?? 0,
			createdAt: item.createdAt ? String(item.createdAt) : "",
		}));

	// ─── Column definitions ───────────────────────────────────────────────────

	const columns: ColumnDef<InstallmentPlanRow>[] = [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "code",
			header: "Code",
			cell: ({ row }) => (
				<Badge variant="outline" className="font-mono">
					{row.original.code}
				</Badge>
			),
		},
		{
			accessorKey: "numInstallments",
			header: "Installments",
			cell: ({ row }) => (
				<span className="tabular-nums">{row.original.numInstallments}</span>
			),
		},
		{
			accessorKey: "defaultIntervalDays",
			header: "Default Interval (days)",
			cell: ({ row }) => (
				<span className="tabular-nums">{row.original.defaultIntervalDays}</span>
			),
		},
		{
			accessorKey: "isDefault",
			header: "Default",
			enableSorting: false,
			cell: ({ row }) => {
				const isDefault = row.original.isDefault;
				const isActive = row.original.isActive;
				return (
					<button
						type="button"
						title={isDefault ? "Current default" : "Set as default"}
						disabled={isDefault || !isActive || isMutating}
						onClick={() => setDefaultMutation.mutate(row.original.id)}
						className="flex items-center justify-center disabled:cursor-not-allowed"
					>
						<Star
							className={`h-4 w-4 transition-colors ${
								isDefault
									? "fill-amber-400 text-amber-400"
									: "text-muted-foreground hover:text-amber-400"
							}`}
						/>
					</button>
				);
			},
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) =>
				row.original.isActive ? (
					<Badge variant="default">Active</Badge>
				) : (
					<Badge variant="outline">Inactive</Badge>
				),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => openEdit(row.original)}
						disabled={isMutating}
					>
						<Edit className="h-4 w-4 mr-1" />
						Edit
					</Button>
					{row.original.isActive && (
						<Button
							variant="ghost"
							size="sm"
							className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
							onClick={() => handleDeactivateClick(row.original)}
							disabled={isMutating}
						>
							Deactivate
						</Button>
					)}
				</div>
			),
		},
	];

	// ─── Guard: no org selected ───────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage installment plans.
			</div>
		);
	}

	// ─── Loading state ────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<CreditCard className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Installment Plans</h1>
						<p className="text-brand-secondary-1 text-sm">
							Configure payment plan options available to customers on package services.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="h-4 w-4 mr-2" />
					Add Plan
				</Button>
			</div>

			{/* Filters toolbar */}
			<div className="flex items-center gap-3">
				<div className="flex items-center rounded-lg border bg-muted/40 p-1 gap-1">
					<button
						type="button"
						onClick={() => setShowInactive(false)}
						className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
							!showInactive
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Active
					</button>
					<button
						type="button"
						onClick={() => setShowInactive(true)}
						className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
							showInactive
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						All
					</button>
				</div>
				<span className="text-sm text-muted-foreground">
					{rows.length} {rows.length === 1 ? "plan" : "plans"}
				</span>
			</div>

			<Separator />

			{/* Data table */}
			<DataTable<InstallmentPlanRow, unknown> columns={columns} data={rows} />

			{/* Create / Edit Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{editingId ? "Edit Installment Plan" : "Add Installment Plan"}
						</SheetTitle>
						<SheetDescription>
							{editingId
								? "Update the details for this installment plan. The plan code cannot be changed."
								: "Define a new installment plan to offer on package services."}
						</SheetDescription>
					</SheetHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-2">
						{/* Code — disabled on edit */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ip-code">
								Code {!editingId && <span className="text-destructive">*</span>}
							</Label>
							<Input
								id="ip-code"
								placeholder="e.g. monthly_6"
								value={form.code}
								onChange={(e) =>
									setForm((f) => ({ ...f, code: e.target.value }))
								}
								className="font-mono"
								required={!editingId}
								disabled={!!editingId}
							/>
							<p className="text-xs text-muted-foreground">
								{editingId
									? "Code cannot be changed after creation."
									: "Short identifier used internally (e.g. monthly_6). Cannot be changed later."}
							</p>
						</div>

						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ip-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="ip-name"
								placeholder="e.g. Monthly (6 payments)"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
								required
							/>
						</div>

						{/* Number of installments */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ip-num-installments">
								Number of Installments <span className="text-destructive">*</span>
							</Label>
							<Input
								id="ip-num-installments"
								type="number"
								min="1"
								step="1"
								placeholder="e.g. 6"
								value={form.numInstallments}
								onChange={(e) =>
									setForm((f) => ({ ...f, numInstallments: e.target.value }))
								}
								required
							/>
							<p className="text-xs text-muted-foreground">
								Use 1 for a full single payment plan.
							</p>
						</div>

						{/* Default interval days */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ip-interval-days">
								Default Interval (days) <span className="text-destructive">*</span>
							</Label>
							<Input
								id="ip-interval-days"
								type="number"
								min="1"
								step="1"
								placeholder="e.g. 30"
								value={form.defaultIntervalDays}
								onChange={(e) =>
									setForm((f) => ({ ...f, defaultIntervalDays: e.target.value }))
								}
								required
							/>
							<p className="text-xs text-muted-foreground">
								Days between each installment payment. Services can override this.
							</p>
						</div>

						{/* Description */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ip-description">Description</Label>
							<Textarea
								id="ip-description"
								placeholder="Optional notes about this plan"
								rows={3}
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
							/>
						</div>

						{/* Is default — only shown on create */}
						{!editingId && (
							<div className="flex items-center gap-2">
								<Checkbox
									id="ip-default"
									checked={form.isDefault}
									onCheckedChange={(checked) =>
										setForm((f) => ({
											...f,
											isDefault: checked === true,
										}))
									}
								/>
								<Label
									htmlFor="ip-default"
									className="cursor-pointer font-normal"
								>
									Set as default plan
								</Label>
							</div>
						)}

						<SheetFooter className="px-0 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
							>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId
									? "Save Changes"
									: "Add Plan"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			{/* Deactivate confirmation dialog */}
			<Dialog
				open={deactivateDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						setDeactivateDialogOpen(false);
						setDeactivateTarget(null);
						setDeactivateWarning(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Deactivate Installment Plan</DialogTitle>
						<DialogDescription>
							Are you sure you want to deactivate{" "}
							<strong>{deactivateTarget?.name}</strong>?
						</DialogDescription>
					</DialogHeader>

					{deactivateWarning && (
						<div className="rounded-md bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800">
							{deactivateWarning}
						</div>
					)}

					<p className="text-sm text-muted-foreground">
						Inactive plans are hidden from the service form. Existing installment schedules are not affected.
					</p>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setDeactivateDialogOpen(false);
								setDeactivateTarget(null);
								setDeactivateWarning(null);
							}}
							disabled={deactivateMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deactivateTarget) {
									deactivateMutation.mutate(deactivateTarget.id);
								}
							}}
							disabled={deactivateMutation.isPending}
						>
							{deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
