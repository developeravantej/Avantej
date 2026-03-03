import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/currency";
import { Plus, Tag, Edit, Percent } from "lucide-react";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/promotions/view",
)({
	component: PromotionsViewPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

type PromotionType = "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y";

interface PromotionRow {
	id: string;
	code: string;
	name: string;
	description: string | null;
	type: PromotionType;
	value: number;
	minimumOrderAmount: number | null;
	maximumDiscount: number | null;
	usageLimit: number | null;
	usageCount: number;
	perCustomerLimit: number | null;
	validFrom: string;
	validUntil: string | null;
	isActive: boolean;
	branchId: string | null;
	createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PromotionType, string> = {
	percentage: "Percentage",
	fixed_amount: "Fixed Amount",
	free_item: "Free Item",
	buy_x_get_y: "Buy X Get Y",
};

function formatPromotionValue(type: PromotionType, value: number): string {
	if (type === "percentage") {
		return `${(value / 100).toFixed(2)}%`;
	}
	if (type === "fixed_amount") {
		// value is stored in cents; formatPrice divides by 100 internally
		return formatPrice(value, "MYR");
	}
	return value.toString();
}

function formatDateDisplay(iso: string | null): string {
	if (!iso) return "No expiry";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

/** Convert a datetime-local string (YYYY-MM-DDTHH:mm) to a full ISO 8601 string. */
function toIsoDatetime(localDt: string): string {
	return new Date(localDt).toISOString();
}

/** Convert an ISO datetime to datetime-local input format (YYYY-MM-DDTHH:mm). */
function toDatetimeLocal(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Default form state ────────────────────────────────────────────────────────

interface CreateFormState {
	code: string;
	name: string;
	description: string;
	type: PromotionType;
	value: string;
	minimumOrderAmount: string;
	usageLimit: string;
	perCustomerLimit: string;
	validFrom: string;
	validUntil: string;
}

interface EditFormState {
	name: string;
	description: string;
	validFrom: string;
	validUntil: string;
}

const defaultCreateForm: CreateFormState = {
	code: "",
	name: "",
	description: "",
	type: "percentage",
	value: "",
	minimumOrderAmount: "",
	usageLimit: "",
	perCustomerLimit: "1",
	validFrom: "",
	validUntil: "",
};

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(
	onEdit: (row: PromotionRow) => void,
	onDeactivate: (id: string) => void,
	isDeactivating: boolean,
): ColumnDef<PromotionRow>[] {
	return [
		{
			accessorKey: "code",
			header: "Code",
			cell: ({ row }) => <CopyableCell value={row.original.code} />,
		},
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => {
				const type = row.original.type;
				const label = TYPE_LABELS[type] ?? type;
				return (
					<Badge variant="secondary" className="whitespace-nowrap">
						{label}
					</Badge>
				);
			},
		},
		{
			accessorKey: "value",
			header: "Value",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatPromotionValue(row.original.type, row.original.value)}
				</span>
			),
		},
		{
			accessorKey: "validFrom",
			header: "Valid From",
			cell: ({ row }) => formatDateDisplay(row.original.validFrom),
		},
		{
			accessorKey: "validUntil",
			header: "Valid Until",
			cell: ({ row }) => formatDateDisplay(row.original.validUntil),
		},
		{
			id: "usage",
			header: "Usage",
			cell: ({ row }) => {
				const { usageCount, usageLimit } = row.original;
				return (
					<span className="tabular-nums text-muted-foreground">
						{usageCount} / {usageLimit ?? "∞"}
					</span>
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
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onEdit(row.original)}
						className="h-7 px-2 text-xs"
					>
						<Edit className="h-3 w-3 mr-1" />
						Edit
					</Button>
					{row.original.isActive && (
						<Button
							variant="destructive"
							size="sm"
							disabled={isDeactivating}
							onClick={() => onDeactivate(row.original.id)}
							className="h-7 px-2 text-xs"
						>
							Deactivate
						</Button>
					)}
				</div>
			),
		},
	];
}

// ── Main component ────────────────────────────────────────────────────────────

function PromotionsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Sheet state
	const [createOpen, setCreateOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<PromotionRow | null>(null);

	// Form state
	const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateForm);
	const [editForm, setEditForm] = useState<EditFormState>({
		name: "",
		description: "",
		validFrom: "",
		validUntil: "",
	});

	// ── Query ──────────────────────────────────────────────────────────────────

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["promotions", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.promotions.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: PromotionRow[] = apiData.map((item) => ({
		id: item.id,
		code: item.code,
		name: item.name,
		description: item.description ?? null,
		type: item.type as PromotionType,
		value: item.value,
		minimumOrderAmount: item.minimumOrderAmount ?? null,
		maximumDiscount: item.maximumDiscount ?? null,
		usageLimit: item.usageLimit ?? null,
		usageCount: item.usageCount,
		perCustomerLimit: item.perCustomerLimit ?? null,
		validFrom: item.validFrom instanceof Date
			? item.validFrom.toISOString()
			: String(item.validFrom),
		validUntil: item.validUntil
			? item.validUntil instanceof Date
				? item.validUntil.toISOString()
				: String(item.validUntil)
			: null,
		isActive: item.isActive,
		branchId: item.branchId ?? null,
		createdAt: item.createdAt instanceof Date
			? item.createdAt.toISOString()
			: String(item.createdAt),
	}));

	// ── Mutations ──────────────────────────────────────────────────────────────

	const { mutate: createPromotion, isPending: isCreating } = useMutation({
		mutationFn: (input: Parameters<typeof client.promotions.create>[0]) =>
			client.promotions.create(input),
		onSuccess: () => {
			toast.success("Promotion created successfully.");
			queryClient.invalidateQueries({ queryKey: ["promotions", organizationId] });
			setCreateOpen(false);
			setCreateForm(defaultCreateForm);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create promotion.");
		},
	});

	const { mutate: updatePromotion, isPending: isUpdating } = useMutation({
		mutationFn: (input: Parameters<typeof client.promotions.update>[0]) =>
			client.promotions.update(input),
		onSuccess: () => {
			toast.success("Promotion updated successfully.");
			queryClient.invalidateQueries({ queryKey: ["promotions", organizationId] });
			setEditOpen(false);
			setEditTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to update promotion.");
		},
	});

	const { mutate: deactivatePromotion, isPending: isDeactivating } = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected.");
			return client.promotions.deactivate({ organizationId, id });
		},
		onSuccess: () => {
			toast.success("Promotion deactivated.");
			queryClient.invalidateQueries({ queryKey: ["promotions", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to deactivate promotion.");
		},
	});

	// ── Handlers ───────────────────────────────────────────────────────────────

	function handleOpenEdit(row: PromotionRow) {
		setEditTarget(row);
		setEditForm({
			name: row.name,
			description: row.description ?? "",
			validFrom: toDatetimeLocal(row.validFrom),
			validUntil: row.validUntil ? toDatetimeLocal(row.validUntil) : "",
		});
		setEditOpen(true);
	}

	function handleCreateSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId) return;

		const rawValue = parseFloat(createForm.value);
		if (Number.isNaN(rawValue) || rawValue <= 0) {
			toast.error("Please enter a valid value.");
			return;
		}
		if (!createForm.validFrom) {
			toast.error("Valid From date is required.");
			return;
		}

		// For both percentage and fixed_amount, user enters a decimal → store as basis points (×100)
		const storedValue = Math.round(rawValue * 100);

		const rawMinOrder = parseFloat(createForm.minimumOrderAmount);
		const minimumOrderAmount = !Number.isNaN(rawMinOrder) && rawMinOrder > 0
			? Math.round(rawMinOrder * 100)
			: undefined;

		const rawUsageLimit = parseInt(createForm.usageLimit, 10);
		const usageLimit = !Number.isNaN(rawUsageLimit) && rawUsageLimit > 0
			? rawUsageLimit
			: undefined;

		const rawPerCustomer = parseInt(createForm.perCustomerLimit, 10);
		const perCustomerLimit = !Number.isNaN(rawPerCustomer) && rawPerCustomer > 0
			? rawPerCustomer
			: undefined;

		createPromotion({
			organizationId,
			code: createForm.code.trim().toUpperCase(),
			name: createForm.name.trim(),
			description: createForm.description.trim() || undefined,
			type: createForm.type,
			value: storedValue,
			minimumOrderAmount,
			usageLimit,
			perCustomerLimit,
			validFrom: toIsoDatetime(createForm.validFrom),
			validUntil: createForm.validUntil
				? toIsoDatetime(createForm.validUntil)
				: undefined,
		});
	}

	function handleEditSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId || !editTarget) return;

		if (!editForm.validFrom) {
			toast.error("Valid From date is required.");
			return;
		}

		updatePromotion({
			organizationId,
			id: editTarget.id,
			name: editForm.name.trim() || undefined,
			description: editForm.description.trim() || undefined,
			validFrom: toIsoDatetime(editForm.validFrom),
			validUntil: editForm.validUntil
				? toIsoDatetime(editForm.validUntil)
				: undefined,
		});
	}

	const columns = buildColumns(handleOpenEdit, deactivatePromotion, isDeactivating);

	// ── Render ─────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view promotions.
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
		<div className="space-y-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<Tag className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Promotions</h1>
						<p className="text-sm text-muted-foreground">
							Manage discount codes and promotions for checkout.
						</p>
					</div>
				</div>
				<Button onClick={() => setCreateOpen(true)} className="gap-2">
					<Plus className="h-4 w-4" />
					New Promotion
				</Button>
			</div>

			{/* Table */}
			<DataTable<PromotionRow, unknown> columns={columns} data={data} />

			{/* ── Create Sheet ─────────────────────────────────────────────────── */}
			<Sheet open={createOpen} onOpenChange={setCreateOpen}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader className="pb-4">
						<SheetTitle className="flex items-center gap-2">
							<Percent className="h-4 w-4 text-primary" />
							New Promotion
						</SheetTitle>
						<SheetDescription>
							Create a new discount code or promotion. The code will be
							automatically uppercased.
						</SheetDescription>
					</SheetHeader>
					<Separator />
					<form onSubmit={handleCreateSubmit} className="flex flex-col gap-5 px-4 py-5">
						{/* Code */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="create-code">
								Code <span className="text-destructive">*</span>
							</label>
							<Input
								id="create-code"
								placeholder="e.g. SAVE20"
								value={createForm.code}
								onChange={(e) =>
									setCreateForm((f) => ({
										...f,
										code: e.target.value.toUpperCase(),
									}))
								}
								required
								className="font-mono uppercase"
							/>
							<p className="text-xs text-muted-foreground">
								Customers enter this at checkout. Will be stored in uppercase.
							</p>
						</div>

						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="create-name">
								Name <span className="text-destructive">*</span>
							</label>
							<Input
								id="create-name"
								placeholder="e.g. 20% Off All Services"
								value={createForm.name}
								onChange={(e) =>
									setCreateForm((f) => ({ ...f, name: e.target.value }))
								}
								required
							/>
						</div>

						{/* Description */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="create-description">
								Description
							</label>
							<Textarea
								id="create-description"
								placeholder="Optional internal note about this promotion..."
								value={createForm.description}
								onChange={(e) =>
									setCreateForm((f) => ({
										...f,
										description: e.target.value,
									}))
								}
								rows={2}
							/>
						</div>

						{/* Type */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Type <span className="text-destructive">*</span>
							</label>
							<Select
								value={createForm.type}
								onValueChange={(v) =>
									setCreateForm((f) => ({
										...f,
										type: v as PromotionType,
										value: "",
									}))
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="percentage">Percentage</SelectItem>
									<SelectItem value="fixed_amount">Fixed Amount</SelectItem>
									<SelectItem value="free_item">Free Item</SelectItem>
									<SelectItem value="buy_x_get_y">Buy X Get Y</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Value */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="create-value">
								{createForm.type === "percentage"
									? "Discount %"
									: createForm.type === "fixed_amount"
										? "Discount Amount (RM)"
										: "Value"}{" "}
								<span className="text-destructive">*</span>
							</label>
							<Input
								id="create-value"
								type="number"
								step="0.01"
								min="0.01"
								placeholder={
									createForm.type === "percentage"
										? "e.g. 20 for 20%"
										: createForm.type === "fixed_amount"
											? "e.g. 10.00 for RM 10.00"
											: "Enter value"
								}
								value={createForm.value}
								onChange={(e) =>
									setCreateForm((f) => ({ ...f, value: e.target.value }))
								}
								required
							/>
							{createForm.type === "percentage" && (
								<p className="text-xs text-muted-foreground">
									Enter a number between 0.01 and 100.
								</p>
							)}
						</div>

						{/* Minimum Order Amount */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="create-min-order">
								Minimum Order Amount (RM)
							</label>
							<Input
								id="create-min-order"
								type="number"
								step="0.01"
								min="0"
								placeholder="e.g. 50.00 (leave blank for no minimum)"
								value={createForm.minimumOrderAmount}
								onChange={(e) =>
									setCreateForm((f) => ({
										...f,
										minimumOrderAmount: e.target.value,
									}))
								}
							/>
						</div>

						{/* Usage limit and per-customer limit side by side */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="create-usage-limit">
									Usage Limit
								</label>
								<Input
									id="create-usage-limit"
									type="number"
									step="1"
									min="1"
									placeholder="Unlimited"
									value={createForm.usageLimit}
									onChange={(e) =>
										setCreateForm((f) => ({
											...f,
											usageLimit: e.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="create-per-customer">
									Per Customer
								</label>
								<Input
									id="create-per-customer"
									type="number"
									step="1"
									min="1"
									placeholder="e.g. 1"
									value={createForm.perCustomerLimit}
									onChange={(e) =>
										setCreateForm((f) => ({
											...f,
											perCustomerLimit: e.target.value,
										}))
									}
								/>
							</div>
						</div>

						{/* Valid From / Valid Until side by side */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="create-valid-from">
									Valid From <span className="text-destructive">*</span>
								</label>
								<Input
									id="create-valid-from"
									type="datetime-local"
									value={createForm.validFrom}
									onChange={(e) =>
										setCreateForm((f) => ({
											...f,
											validFrom: e.target.value,
										}))
									}
									required
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="create-valid-until">
									Valid Until
								</label>
								<Input
									id="create-valid-until"
									type="datetime-local"
									value={createForm.validUntil}
									onChange={(e) =>
										setCreateForm((f) => ({
											...f,
											validUntil: e.target.value,
										}))
									}
								/>
								<p className="text-xs text-muted-foreground">Leave blank for no expiry.</p>
							</div>
						</div>

						<Separator />
						<SheetFooter className="px-0 pb-0">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setCreateOpen(false);
									setCreateForm(defaultCreateForm);
								}}
								disabled={isCreating}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isCreating}>
								{isCreating ? "Creating..." : "Create Promotion"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			{/* ── Edit Sheet ───────────────────────────────────────────────────── */}
			<Sheet
				open={editOpen}
				onOpenChange={(open) => {
					if (!open) {
						setEditOpen(false);
						setEditTarget(null);
					}
				}}
			>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader className="pb-4">
						<SheetTitle className="flex items-center gap-2">
							<Edit className="h-4 w-4 text-primary" />
							Edit Promotion
						</SheetTitle>
						<SheetDescription>
							Update the name, description, and validity window. Code and type
							cannot be changed after creation.
						</SheetDescription>
					</SheetHeader>
					<Separator />

					{editTarget && (
						<div className="px-4 py-3 bg-muted/50 rounded-md mx-4 mt-4 text-sm">
							<div className="flex items-center gap-2 flex-wrap">
								<CopyableCell value={editTarget.code} />
								<Badge variant="secondary">{TYPE_LABELS[editTarget.type]}</Badge>
								<span className="text-muted-foreground">
									{formatPromotionValue(editTarget.type, editTarget.value)}
								</span>
							</div>
						</div>
					)}

					<form onSubmit={handleEditSubmit} className="flex flex-col gap-5 px-4 py-5">
						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="edit-name">
								Name
							</label>
							<Input
								id="edit-name"
								placeholder="Promotion name"
								value={editForm.name}
								onChange={(e) =>
									setEditForm((f) => ({ ...f, name: e.target.value }))
								}
							/>
						</div>

						{/* Description */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="edit-description">
								Description
							</label>
							<Textarea
								id="edit-description"
								placeholder="Optional internal note..."
								value={editForm.description}
								onChange={(e) =>
									setEditForm((f) => ({
										...f,
										description: e.target.value,
									}))
								}
								rows={2}
							/>
						</div>

						{/* Valid From / Valid Until */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="edit-valid-from">
									Valid From <span className="text-destructive">*</span>
								</label>
								<Input
									id="edit-valid-from"
									type="datetime-local"
									value={editForm.validFrom}
									onChange={(e) =>
										setEditForm((f) => ({
											...f,
											validFrom: e.target.value,
										}))
									}
									required
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium" htmlFor="edit-valid-until">
									Valid Until
								</label>
								<Input
									id="edit-valid-until"
									type="datetime-local"
									value={editForm.validUntil}
									onChange={(e) =>
										setEditForm((f) => ({
											...f,
											validUntil: e.target.value,
										}))
									}
								/>
								<p className="text-xs text-muted-foreground">Leave blank for no expiry.</p>
							</div>
						</div>

						<Separator />
						<SheetFooter className="px-0 pb-0">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setEditOpen(false);
									setEditTarget(null);
								}}
								disabled={isUpdating}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isUpdating}>
								{isUpdating ? "Saving..." : "Save Changes"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</div>
	);
}
