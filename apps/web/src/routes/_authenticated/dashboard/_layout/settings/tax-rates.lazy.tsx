import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Star, Plus, Edit, Tag } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/settings/tax-rates",
)({ component: TaxRatesPage });

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

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
function TaxRatesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const taxRatesKey = ["taxRates", organizationId];

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Status filter
	const [showInactive, setShowInactive] = useState(false);

	// ─── Queries & Mutations ─────────────────────────────────────────────────

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["taxRates", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.taxRates.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const createMutation = useApiMutation({
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
		successMessage: "Tax rate created successfully.",
		errorMessage: (err) => err.message || "Failed to create tax rate.",
		invalidate: [taxRatesKey],
		onSuccess: () => closeSheet(),
	});

	const updateMutation = useApiMutation({
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
		successMessage: "Tax rate updated successfully.",
		errorMessage: (err) => err.message || "Failed to update tax rate.",
		invalidate: [taxRatesKey],
		onSuccess: () => closeSheet(),
	});

	const setDefaultMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.setDefault({ organizationId, id });
		},
		successMessage: "Tax rate set as default.",
		errorMessage: (err) => err.message || "Failed to set default tax rate.",
		invalidate: [taxRatesKey],
	});

	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.deactivate({ organizationId, id });
		},
		successMessage: "Tax rate deactivated.",
		errorMessage: (err) => err.message || "Failed to deactivate tax rate.",
		invalidate: [taxRatesKey],
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
		if (Math.round(rate * 100) > 10000) {
			toast.error("Rate cannot exceed 100% (10,000 basis points).");
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

	const allRows: TaxRateRow[] = apiData.map((item) => ({
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

	const rows = allRows.filter((item) => (showInactive ? true : item.isActive));

	// KPI data — computed from allRows (not filtered) for accurate counts
	const defaultRate = allRows.find((r) => r.isDefault && r.isActive) ?? null;
	const activeCount = allRows.filter((r) => r.isActive).length;
	const inactiveCount = allRows.filter((r) => !r.isActive).length;

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
				<span>
					{CATEGORY_LABELS[row.original.category] ?? row.original.category}
				</span>
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
							className={`size-4 transition-colors ${
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
						<Edit className="size-4 mr-1" />
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
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
				<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
					Select an organization to manage tax rates.
				</div>
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Tag className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Tax Rates</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Configure tax rates applied at point of sale
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="size-4 mr-2" />
					New Tax Rate
				</Button>
			</div>

			{/* Filter band */}
			<div className="shrink-0 border-b border-border/40 px-6 py-3">
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
			</div>

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
				{/* KPI strip */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{/* Default rate — spans 2 cols */}
					{defaultRate ? (
						<div className="col-span-2 rounded-xl border bg-amber-50 border-amber-200 p-3">
							<div className="flex items-center justify-between">
								<div className="text-xs text-amber-700 font-medium">
									Default Rate
								</div>
								<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
									<Star className="size-3 fill-amber-500 text-amber-500" />
									Default
								</span>
							</div>
							<div className="mt-1 text-3xl font-bold tabular-nums text-amber-800">
								{(defaultRate.rateInBasisPoints / 100).toFixed(2)}%
							</div>
							<div className="text-xs text-amber-700 mt-0.5">
								{defaultRate.name}
							</div>
						</div>
					) : (
						<div className="col-span-2">
							<StatusCallout variant="warning" title="No default tax rate set">
								<p className="text-sm">
									Set a default tax rate so it is pre-selected at point of sale.
								</p>
							</StatusCallout>
						</div>
					)}
					<div className="rounded-xl border bg-card p-3">
						<div className="text-xs text-muted-foreground">Active</div>
						<div className="mt-1 text-xl font-semibold tabular-nums">
							{activeCount}
						</div>
						<div className="text-xs text-muted-foreground">rates in use</div>
					</div>
					<div className="rounded-xl border bg-card p-3">
						<div className="text-xs text-muted-foreground">Inactive</div>
						<div className="mt-1 text-xl font-semibold tabular-nums">
							{inactiveCount}
						</div>
						<div className="text-xs text-muted-foreground">archived rates</div>
					</div>
				</div>

				{/* Error callout */}
				{isError && (
					<StatusCallout
						variant="error"
						title="Failed to load tax rates"
						onRetry={() => refetch()}
					>
						<p className="text-sm">Please try again.</p>
					</StatusCallout>
				)}

				{/* Table or empty state */}
				{!isError && rows.length === 0 ? (
					<EmptyState
						icon={Tag}
						title="No tax rates"
						description="No tax rates have been configured yet. Add one to get started."
						action={{ label: "New Tax Rate", onClick: openCreate }}
					/>
				) : (
					<DataTable<TaxRateRow, unknown> columns={columns} data={rows} />
				)}
			</div>

			{/* Create / Edit Dialog */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto bg-white">
					<DialogHeader>
						<DialogTitle className="text-lg font-medium leading-6 text-brand-primary-1">
							{editingId ? "Edit Tax Rate" : "Add Tax Rate"}
						</DialogTitle>
						<DialogDescription className="text-sm text-brand-secondary-1">
							{editingId
								? "Update the details for this tax rate."
								: "Define a new tax rate to apply on sales."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="p-6 space-y-4">
						{/* Name */}
						<div>
							<label
								htmlFor="tr-name"
								className="block text-sm font-medium text-brand-primary-1"
							>
								Name *
							</label>
							<Input
								id="tr-name"
								placeholder="e.g. Sales and Service Tax 8%"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
								required
								className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
							/>
						</div>

						{/* Code */}
						<div>
							<label
								htmlFor="tr-code"
								className="block text-sm font-medium text-brand-primary-1"
							>
								Code *
							</label>
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
								className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm font-mono uppercase"
								required
							/>
							<p className="text-xs text-brand-secondary-1 mt-1">
								Short identifier. Will be stored in uppercase.
							</p>
						</div>

						{/* Rate */}
						<div>
							<label
								htmlFor="tr-rate"
								className="block text-sm font-medium text-brand-primary-1"
							>
								Rate (%) *
							</label>
							<div className="relative mt-1">
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
									className="block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm pr-8"
									required
								/>
								<span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary-1 text-sm pointer-events-none">
									%
								</span>
							</div>
							{form.ratePercent &&
								!Number.isNaN(parseFloat(form.ratePercent)) && (
									<p className="text-xs text-brand-secondary-1 mt-1">
										Stored as{" "}
										<span className="font-mono">
											{Math.round(parseFloat(form.ratePercent) * 100)}
										</span>{" "}
										basis points.
									</p>
								)}
						</div>

						{/* Category */}
						<div>
							<label
								htmlFor="tr-category"
								className="block text-sm font-medium text-brand-primary-1"
							>
								Category
							</label>
							<Select
								value={form.category}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, category: v as TaxCategory }))
								}
							>
								<SelectTrigger
									id="tr-category"
									className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
								>
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
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									htmlFor="tr-from"
									className="block text-sm font-medium text-brand-primary-1"
								>
									Effective From *
								</label>
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
									className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
								/>
							</div>
							<div>
								<label
									htmlFor="tr-until"
									className="block text-sm font-medium text-brand-primary-1"
								>
									Effective Until
								</label>
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
									className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
								/>
							</div>
						</div>

						{/* Description */}
						<div>
							<label
								htmlFor="tr-description"
								className="block text-sm font-medium text-brand-primary-1"
							>
								Description
							</label>
							<Textarea
								id="tr-description"
								placeholder="Optional notes about this tax rate"
								rows={3}
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
								className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
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
								<label
									htmlFor="tr-default"
									className="cursor-pointer text-sm text-brand-primary-1"
								>
									Set as default tax rate
								</label>
							</div>
						)}

						<div className="mt-6 flex justify-end space-x-3">
							<button
								type="button"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex justify-center rounded-md border border-transparent bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId
										? "Save Changes"
										: "Add Tax Rate"}
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
