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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Star, Plus, Edit, Tag } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/tax-rates",
)({
	component: TaxRatesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TaxCategory =
	| "SST"
	| "GST"
	| "service_tax"
	| "withholding_tax"
	| "tax_exempt"
	| "custom";

type TaxRateRow = {
	id: string;
	name: string;
	code: string;
	rateInBasisPoints: number;
	category: TaxCategory;
	isDefault: boolean;
	effectiveFrom: string;
	effectiveUntil: string | null;
	description: string | null;
	isActive: boolean;
	createdAt: string;
};

type FormState = {
	name: string;
	code: string;
	ratePercent: string; // user enters "8.00", stored as string for controlled input
	category: TaxCategory;
	effectiveFrom: string;
	effectiveUntil: string;
	description: string;
	isDefault: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
	name: "",
	code: "",
	ratePercent: "",
	category: "SST",
	effectiveFrom: "",
	effectiveUntil: "",
	description: "",
	isDefault: false,
};

const CATEGORY_LABELS: Record<TaxCategory, string> = {
	SST: "SST",
	GST: "GST",
	service_tax: "Service Tax",
	withholding_tax: "Withholding Tax",
	tax_exempt: "Tax Exempt",
	custom: "Custom",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return "—";
	}
}

// Convert ISO date string (or Date) to "YYYY-MM-DD" for <input type="date">
function toDateInputValue(value: string | Date | null | undefined): string {
	if (!value) return "";
	try {
		const d = typeof value === "string" ? new Date(value) : value;
		return d.toISOString().slice(0, 10);
	} catch {
		return "";
	}
}

// ─── Page Component ───────────────────────────────────────────────────────────

function TaxRatesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Status filter
	const [showInactive, setShowInactive] = useState(false);

	// ─── Queries & Mutations ─────────────────────────────────────────────────

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["taxRates", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.taxRates.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const createMutation = useMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.create({
				organizationId,
				name: values.name,
				code: values.code.toUpperCase(),
				rateInBasisPoints: Math.round(parseFloat(values.ratePercent) * 100),
				category: values.category,
				effectiveFrom: new Date(values.effectiveFrom).toISOString(),
				effectiveUntil: values.effectiveUntil
					? new Date(values.effectiveUntil).toISOString()
					: undefined,
				description: values.description || undefined,
				isDefault: values.isDefault,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["taxRates", organizationId] });
			toast.success("Tax rate created successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to create tax rate.");
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, values }: { id: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.update({
				organizationId,
				id,
				name: values.name,
				code: values.code.toUpperCase(),
				rateInBasisPoints: Math.round(parseFloat(values.ratePercent) * 100),
				category: values.category,
				effectiveFrom: new Date(values.effectiveFrom).toISOString(),
				effectiveUntil: values.effectiveUntil
					? new Date(values.effectiveUntil).toISOString()
					: undefined,
				description: values.description || undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["taxRates", organizationId] });
			toast.success("Tax rate updated successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to update tax rate.");
		},
	});

	const setDefaultMutation = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.setDefault({ organizationId, id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["taxRates", organizationId] });
			toast.success("Tax rate set as default.");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to set default tax rate.");
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.deactivate({ organizationId, id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["taxRates", organizationId] });
			toast.success("Tax rate deactivated.");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to deactivate tax rate.");
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

	function openEdit(row: TaxRateRow) {
		setEditingId(row.id);
		setForm({
			name: row.name,
			code: row.code,
			ratePercent: (row.rateInBasisPoints / 100).toFixed(2),
			category: row.category,
			effectiveFrom: toDateInputValue(row.effectiveFrom),
			effectiveUntil: toDateInputValue(row.effectiveUntil),
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
		if (!form.code.trim()) {
			toast.error("Code is required.");
			return;
		}
		const rate = parseFloat(form.ratePercent);
		if (Number.isNaN(rate) || rate < 0) {
			toast.error("Rate must be a valid non-negative number.");
			return;
		}
		if (!form.effectiveFrom) {
			toast.error("Effective From date is required.");
			return;
		}

		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	// ─── Data processing ──────────────────────────────────────────────────────

	const rows: TaxRateRow[] = apiData
		.filter((item) => (showInactive ? true : item.isActive))
		.map((item) => ({
			id: item.id,
			name: item.name,
			code: item.code,
			rateInBasisPoints: item.rateInBasisPoints,
			category: item.category as TaxCategory,
			isDefault: item.isDefault ?? false,
			effectiveFrom: item.effectiveFrom ? String(item.effectiveFrom) : "",
			effectiveUntil: item.effectiveUntil ? String(item.effectiveUntil) : null,
			description: item.description ?? null,
			isActive: item.isActive ?? true,
			createdAt: item.createdAt ? String(item.createdAt) : "",
		}));

	// ─── Column definitions ───────────────────────────────────────────────────

	const columns: ColumnDef<TaxRateRow>[] = [
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
			accessorKey: "rateInBasisPoints",
			header: "Rate",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{(row.original.rateInBasisPoints / 100).toFixed(2)}%
				</span>
			),
		},
		{
			accessorKey: "category",
			header: "Category",
			cell: ({ row }) => (
				<span>{CATEGORY_LABELS[row.original.category] ?? row.original.category}</span>
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
			accessorKey: "effectiveFrom",
			header: "Effective From",
			cell: ({ row }) => formatDate(row.original.effectiveFrom),
		},
		{
			accessorKey: "effectiveUntil",
			header: "Effective Until",
			cell: ({ row }) =>
				row.original.effectiveUntil ? (
					formatDate(row.original.effectiveUntil)
				) : (
					<span className="text-muted-foreground text-xs">Active</span>
				),
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
							onClick={() => deactivateMutation.mutate(row.original.id)}
							disabled={isMutating || row.original.isDefault}
							title={
								row.original.isDefault
									? "Cannot deactivate the default tax rate"
									: undefined
							}
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
				Select an organization to manage tax rates.
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
						<Tag className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold">Tax Configuration</h1>
						<p className="text-muted-foreground text-sm">
							Manage tax rates applied to sales orders and invoices.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="h-4 w-4 mr-2" />
					Add Tax Rate
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
					{rows.length} {rows.length === 1 ? "rate" : "rates"}
				</span>
			</div>

			<Separator />

			{/* Data table */}
			<DataTable<TaxRateRow, unknown> columns={columns} data={rows} />

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
							{editingId ? "Edit Tax Rate" : "Add Tax Rate"}
						</SheetTitle>
						<SheetDescription>
							{editingId
								? "Update the details for this tax rate."
								: "Define a new tax rate to apply on sales."}
						</SheetDescription>
					</SheetHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-2">
						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="tr-name"
								placeholder="e.g. Sales and Service Tax 8%"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
								required
							/>
						</div>

						{/* Code */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-code">
								Code <span className="text-destructive">*</span>
							</Label>
							<Input
								id="tr-code"
								placeholder="e.g. SST_8"
								value={form.code}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										code: e.target.value.toUpperCase(),
									}))
								}
								className="font-mono uppercase"
								required
							/>
							<p className="text-xs text-muted-foreground">
								Short identifier. Will be stored in uppercase.
							</p>
						</div>

						{/* Rate */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-rate">
								Rate (%) <span className="text-destructive">*</span>
							</Label>
							<div className="relative">
								<Input
									id="tr-rate"
									type="number"
									step="0.01"
									min="0"
									placeholder="e.g. 8.00"
									value={form.ratePercent}
									onChange={(e) =>
										setForm((f) => ({ ...f, ratePercent: e.target.value }))
									}
									className="pr-8"
									required
								/>
								<span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
									%
								</span>
							</div>
							{form.ratePercent && !Number.isNaN(parseFloat(form.ratePercent)) && (
								<p className="text-xs text-muted-foreground">
									Stored as{" "}
									<span className="font-mono">
										{Math.round(parseFloat(form.ratePercent) * 100)}
									</span>{" "}
									basis points.
								</p>
							)}
						</div>

						{/* Category */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-category">Category</Label>
							<Select
								value={form.category}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, category: v as TaxCategory }))
								}
							>
								<SelectTrigger id="tr-category">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(Object.keys(CATEGORY_LABELS) as TaxCategory[]).map(
										(key) => (
											<SelectItem key={key} value={key}>
												{CATEGORY_LABELS[key]}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>

						{/* Date range */}
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="tr-from">
									Effective From <span className="text-destructive">*</span>
								</Label>
								<Input
									id="tr-from"
									type="date"
									value={form.effectiveFrom}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											effectiveFrom: e.target.value,
										}))
									}
									required
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="tr-until">Effective Until</Label>
								<Input
									id="tr-until"
									type="date"
									value={form.effectiveUntil}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											effectiveUntil: e.target.value,
										}))
									}
									min={form.effectiveFrom || undefined}
								/>
							</div>
						</div>

						{/* Description */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-description">Description</Label>
							<Textarea
								id="tr-description"
								placeholder="Optional notes about this tax rate"
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
									id="tr-default"
									checked={form.isDefault}
									onCheckedChange={(checked) =>
										setForm((f) => ({
											...f,
											isDefault: checked === true,
										}))
									}
								/>
								<Label
									htmlFor="tr-default"
									className="cursor-pointer font-normal"
								>
									Set as default tax rate
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
									: "Add Tax Rate"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</div>
	);
}
