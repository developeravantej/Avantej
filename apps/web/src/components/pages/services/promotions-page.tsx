import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatPrice, rmToCents } from "@/lib/money";
import { StatusCallout } from "@/components/ui/status-callout";
import { Plus, Edit, Percent, Search } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";

type PromotionType =
	| "percentage"
	| "fixed_amount"
	| "free_item"
	| "buy_x_get_y";

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

function toIsoDatetime(localDt: string): string {
	return new Date(localDt).toISOString();
}

function toDatetimeLocal(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export function PromotionsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const promotionsQueryOptions = orpc.promotions.list.queryOptions({
		input: { organizationId: organizationId! },
	});

	const [search, setSearch] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<PromotionRow | null>(null);
	const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
	const [createForm, setCreateForm] =
		useState<CreateFormState>(defaultCreateForm);
	const [editForm, setEditForm] = useState<EditFormState>({
		name: "",
		description: "",
		validFrom: "",
		validUntil: "",
	});

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...promotionsQueryOptions,
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
		validFrom:
			item.validFrom instanceof Date
				? item.validFrom.toISOString()
				: String(item.validFrom),
		validUntil: item.validUntil
			? item.validUntil instanceof Date
				? item.validUntil.toISOString()
				: String(item.validUntil)
			: null,
		isActive: item.isActive,
		branchId: item.branchId ?? null,
		createdAt:
			item.createdAt instanceof Date
				? item.createdAt.toISOString()
				: String(item.createdAt),
	}));

	const { mutate: createPromotion, isPending: isCreating } = useApiMutation({
		mutationFn: (input: Parameters<typeof client.promotions.create>[0]) =>
			client.promotions.create(input),
		successMessage: "Promotion created successfully.",
		errorMessage: (err) => err.message || "Failed to create promotion.",
		invalidate: [promotionsQueryOptions.queryKey],
		onSuccess: () => {
			setCreateOpen(false);
			setCreateForm(defaultCreateForm);
		},
	});

	const { mutate: updatePromotion, isPending: isUpdating } = useApiMutation({
		mutationFn: (input: Parameters<typeof client.promotions.update>[0]) =>
			client.promotions.update(input),
		successMessage: "Promotion updated successfully.",
		errorMessage: (err) => err.message || "Failed to update promotion.",
		invalidate: [promotionsQueryOptions.queryKey],
		onSuccess: () => {
			setEditOpen(false);
			setEditTarget(null);
		},
	});

	const { mutate: deactivatePromotion, isPending: isDeactivating } =
		useApiMutation({
			mutationFn: (id: string) => {
				if (!organizationId) throw new Error("No organization selected.");
				return client.promotions.deactivate({ organizationId, id });
			},
			successMessage: "Promotion deactivated.",
			errorMessage: (err) => err.message || "Failed to deactivate promotion.",
			invalidate: [promotionsQueryOptions.queryKey],
			onSuccess: () => {
				setDeactivateTarget(null);
			},
		});

	const { mutate: reactivatePromotion, isPending: isReactivating } =
		useApiMutation({
			mutationFn: (id: string) => {
				if (!organizationId) throw new Error("No organization selected.");
				return client.promotions.update({ organizationId, id, isActive: true });
			},
			successMessage: "Promotion enabled.",
			errorMessage: (err) => err.message || "Failed to enable promotion.",
			invalidate: [promotionsQueryOptions.queryKey],
		});

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

		const trimmedCode = createForm.code.trim();
		if (trimmedCode.length < 3) {
			toast.error("Promo code must be at least 3 characters.");
			return;
		}
		if (!/^[A-Z0-9_-]+$/i.test(trimmedCode)) {
			toast.error(
				"Promo code may only contain letters, numbers, hyphens, and underscores.",
			);
			return;
		}

		const rawValue = parseFloat(createForm.value);
		if (Number.isNaN(rawValue) || rawValue <= 0) {
			toast.error("Please enter a valid value.");
			return;
		}
		if (createForm.type === "percentage" && rawValue > 100) {
			toast.error("Percentage discount cannot exceed 100%");
			return;
		}
		if (!createForm.validFrom) {
			toast.error("Valid From date is required.");
			return;
		}
		if (
			createForm.validUntil &&
			new Date(createForm.validUntil) <= new Date(createForm.validFrom)
		) {
			toast.error("Valid Until must be after Valid From.");
			return;
		}

		const storedValue = Math.round(rawValue * 100);

		const rawMinOrder = parseFloat(createForm.minimumOrderAmount);
		const minimumOrderAmount =
			!Number.isNaN(rawMinOrder) && rawMinOrder > 0
				? rmToCents(rawMinOrder)
				: undefined;

		const rawUsageLimit = parseInt(createForm.usageLimit, 10);
		const usageLimit =
			!Number.isNaN(rawUsageLimit) && rawUsageLimit > 0
				? rawUsageLimit
				: undefined;

		const rawPerCustomer = parseInt(createForm.perCustomerLimit, 10);
		const perCustomerLimit =
			!Number.isNaN(rawPerCustomer) && rawPerCustomer > 0
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
		if (
			editForm.validUntil &&
			new Date(editForm.validUntil) <= new Date(editForm.validFrom)
		) {
			toast.error("Valid Until must be after Valid From.");
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

	const filteredData = data.filter(
		(p) =>
			!search ||
			p.code.toLowerCase().includes(search.toLowerCase()) ||
			p.name.toLowerCase().includes(search.toLowerCase()),
	);

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-[#737373]">
				Select an organization to view promotions.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Couldn't load promotions"
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	return (
		<Skeleton
			name="services-promotions-page"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="flex h-full flex-col overflow-hidden">
				{/* Action bar */}
				<div className="flex shrink-0 items-center justify-between pt-2 pb-4">
					<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 w-64">
						<Search className="h-4 w-4 text-[#737373] shrink-0" />
						<input
							placeholder="Search promotions..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="flex-1 bg-transparent text-[13px] text-[#0a0a0a] placeholder:text-[#737373] outline-none"
						/>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-[#737373]">
							<span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">
								{filteredData.length}
							</span>{" "}
							promotion{filteredData.length !== 1 ? "s" : ""}
						</span>
						<button
							type="button"
							onClick={() => setCreateOpen(true)}
							className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
						>
							<Plus className="h-4 w-4" />
							New Promotion
						</button>
					</div>
				</div>

				{/* Table */}
				<div className="min-h-0 flex-1 overflow-auto pb-6">
					<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
						<table className="w-full">
							<thead>
								<tr className="border-b border-[#e5e5e5] bg-[#f3f3f3]">
									{[
										"Code",
										"Name",
										"Type",
										"Value",
										"Valid From",
										"Valid Until",
										"Usage",
										"Status",
										"Actions",
									].map((h) => (
										<th
											key={h}
											className="py-3 px-3 text-[10px] uppercase tracking-widest font-bold text-[#737373] text-left whitespace-nowrap"
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{filteredData.length === 0 ? (
									<tr>
										<td
											colSpan={9}
											className="py-16 text-center text-[13px] text-[#737373]"
										>
											{search
												? "No promotions match your search."
												: "No promotions found."}
										</td>
									</tr>
								) : (
									filteredData.map((row) => (
										<tr
											key={row.id}
											className="border-b border-[#e5e5e5] transition-colors hover:bg-[#f3f3f3]/60"
										>
											<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
												<CopyableCell value={row.code} />
											</td>
											<td className="py-3 px-3 text-[13px] text-[#0a0a0a] font-semibold whitespace-nowrap">
												{row.name}
											</td>
											<td className="py-3 px-3 whitespace-nowrap">
												<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-[#f3f3f3] text-[#737373]">
													{TYPE_LABELS[row.type] ?? row.type}
												</span>
											</td>
											<td className="py-3 px-3 text-[13px] tabular-nums text-[#0a0a0a] whitespace-nowrap">
												{formatPromotionValue(row.type, row.value)}
											</td>
											<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
												{formatDateDisplay(row.validFrom)}
											</td>
											<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
												{formatDateDisplay(row.validUntil)}
											</td>
											<td className="py-3 px-3 text-[13px] tabular-nums text-[#737373] whitespace-nowrap">
												{row.usageCount}{" "}
												<span className="text-[#d4d4d4]">·</span>{" "}
												{row.usageLimit ?? "∞"}
											</td>
											<td className="py-3 px-3 whitespace-nowrap">
												{row.isActive ? (
													<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-green-50 text-green-700">
														Active
													</span>
												) : (
													<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-[#f3f3f3] text-[#737373]">
														Inactive
													</span>
												)}
											</td>
											<td className="py-3 px-3 whitespace-nowrap">
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => handleOpenEdit(row)}
														className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition inline-flex items-center gap-1"
													>
														<Edit className="h-3 w-3" />
														Edit
													</button>
													{row.isActive ? (
														<button
															type="button"
															disabled={isDeactivating}
															onClick={() => setDeactivateTarget(row.id)}
															className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
														>
															Deactivate
														</button>
													) : (
														<button
															type="button"
															disabled={isReactivating}
															onClick={() => reactivatePromotion(row.id)}
															className="rounded-lg border border-green-200 bg-white px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
														>
															Enable
														</button>
													)}
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>

				{/* Create Dialog */}
				<Dialog open={createOpen} onOpenChange={setCreateOpen}>
					<DialogContent
						className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								SERVICE CATALOG
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								New Promotion
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								Create a new discount code or promotion. The code will be
								automatically uppercased.
							</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleCreateSubmit}>
							<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[65vh] flex flex-col gap-5">
								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium" htmlFor="create-code">
										Code <span className="text-rose-600">*</span>
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
									<p className="text-xs text-[#737373]">
										Customers enter this at checkout. Will be stored in
										uppercase.
									</p>
								</div>

								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium" htmlFor="create-name">
										Name <span className="text-rose-600">*</span>
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

								<div className="flex flex-col gap-1.5">
									<label
										className="text-sm font-medium"
										htmlFor="create-description"
									>
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

								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium">
										Type <span className="text-rose-600">*</span>
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

								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium" htmlFor="create-value">
										{createForm.type === "percentage"
											? "Discount %"
											: createForm.type === "fixed_amount"
												? "Discount Amount (RM)"
												: "Value"}{" "}
										<span className="text-rose-600">*</span>
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
										<p className="text-xs text-[#737373]">
											Enter a number between 0.01 and 100.
										</p>
									)}
								</div>

								<div className="flex flex-col gap-1.5">
									<label
										className="text-sm font-medium"
										htmlFor="create-min-order"
									>
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

								<div className="grid grid-cols-2 gap-4">
									<div className="flex flex-col gap-1.5">
										<label
											className="text-sm font-medium"
											htmlFor="create-usage-limit"
										>
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
										<label
											className="text-sm font-medium"
											htmlFor="create-per-customer"
										>
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

								<div className="grid grid-cols-2 gap-4">
									<div className="flex flex-col gap-1.5">
										<label
											className="text-sm font-medium"
											htmlFor="create-valid-from"
										>
											Valid From <span className="text-rose-600">*</span>
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
										<label
											className="text-sm font-medium"
											htmlFor="create-valid-until"
										>
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
										<p className="text-xs text-[#737373]">
											Leave blank for no expiry.
										</p>
									</div>
								</div>
							</div>
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
								<Button
									type="submit"
									disabled={isCreating}
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
								>
									{isCreating ? "Creating..." : "Create Promotion"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>

				{/* Deactivate Confirmation */}
				<Dialog
					open={!!deactivateTarget}
					onOpenChange={(open) => !open && setDeactivateTarget(null)}
				>
					<DialogContent
						className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								SERVICE CATALOG
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Confirm Deactivate
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								Are you sure you want to deactivate{" "}
								<span className="font-medium text-foreground">
									{data.find((p) => p.id === deactivateTarget)?.name ??
										"this promotion"}
								</span>
								? It will no longer be usable by customers.
							</DialogDescription>
						</DialogHeader>
						<div className="px-6 pt-4 pb-2 overflow-y-auto" />
						<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setDeactivateTarget(null)}
							>
								Cancel
							</Button>
							<Button
								onClick={() => {
									if (deactivateTarget) {
										deactivatePromotion(deactivateTarget);
									}
								}}
								disabled={isDeactivating}
								className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							>
								{isDeactivating ? "Deactivating..." : "Deactivate"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Edit Dialog */}
				<Dialog
					open={editOpen}
					onOpenChange={(open) => {
						if (!open) {
							setEditOpen(false);
							setEditTarget(null);
						}
					}}
				>
					<DialogContent
						className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								SERVICE CATALOG
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Edit Promotion
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								Update the name, description, and validity window. Code and type
								cannot be changed after creation.
							</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleEditSubmit}>
							<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[65vh] flex flex-col gap-5">
								{editTarget && (
									<div className="px-4 py-3 bg-[#f3f3f3]/50 rounded-md text-sm">
										<div className="flex items-center gap-2 flex-wrap">
											<CopyableCell value={editTarget.code} />
											<Badge variant="secondary">
												{TYPE_LABELS[editTarget.type]}
											</Badge>
											<span className="text-[#737373]">
												{formatPromotionValue(
													editTarget.type,
													editTarget.value,
												)}
											</span>
										</div>
									</div>
								)}

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

								<div className="flex flex-col gap-1.5">
									<label
										className="text-sm font-medium"
										htmlFor="edit-description"
									>
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

								<div className="grid grid-cols-2 gap-4">
									<div className="flex flex-col gap-1.5">
										<label
											className="text-sm font-medium"
											htmlFor="edit-valid-from"
										>
											Valid From <span className="text-rose-600">*</span>
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
										<label
											className="text-sm font-medium"
											htmlFor="edit-valid-until"
										>
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
										<p className="text-xs text-[#737373]">
											Leave blank for no expiry.
										</p>
									</div>
								</div>
							</div>
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
								<Button
									type="submit"
									disabled={isUpdating}
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
								>
									{isUpdating ? "Saving..." : "Save Changes"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>
		</Skeleton>
	);
}
