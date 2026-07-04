import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
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
	DialogFooter,
} from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	type TaxCategory,
	type TaxRateRow,
	type FormState,
	EMPTY_FORM,
	CATEGORY_LABELS,
	COUNTRY_OPTIONS,
	COUNTRY_LABELS,
} from "./types";
import { formatDate, toDateInputValue } from "./helpers";

// ─── Page Component ───────────────────────────────────────────────────────────

export function TaxRatesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const taxRatesKey = orpc.taxRates.list.queryOptions({
		input: { organizationId: organizationId! },
	}).queryKey;

	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
	const [search, setSearch] = useState("");

	// ─── Queries & Mutations ─────────────────────────────────────────────────

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.taxRates.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
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
				country: values.country ? values.country : null,
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
				country: values.country ? values.country : null,
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
		errorMessage: (err) => err.message || "Failed to set default.",
		invalidate: [taxRatesKey],
	});

	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.deactivate({ organizationId, id });
		},
		successMessage: "Tax rate deactivated.",
		errorMessage: (err) => err.message || "Failed to deactivate.",
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
			country: row.country ?? "",
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
			toast.error("Rate cannot exceed 100%.");
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
		country: item.country ?? null,
	}));

	const rows = allRows.filter((r) => {
		const matchesStatus = statusFilter === "all" ? true : r.isActive;
		const matchesSearch =
			search.trim() === "" ||
			r.name.toLowerCase().includes(search.toLowerCase()) ||
			r.code.toLowerCase().includes(search.toLowerCase());
		return matchesStatus && matchesSearch;
	});

	const activeCount = allRows.filter((r) => r.isActive).length;

	// ─── Guard ────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center text-sm text-[#6b7170]">
				Select an organization to manage tax rates.
			</div>
		);
	}

	if (isLoading) return <PageLoader />;

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="-m-6 flex h-screen flex-col bg-white">
			{/* Page header */}
			<div className="flex shrink-0 items-center justify-between border-b border-[#edede4] px-7 py-5">
				<div>
					<h1 className="text-[15px] font-bold text-[#0a0a0a]">Tax Rates</h1>
					<p className="mt-0.5 text-xs text-[#6b7170]">
						Manage tax rates applied to sales across your branches.
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					disabled={isMutating}
					className="inline-flex items-center gap-1.5 rounded-lg border border-[#edede4] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
				>
					<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
						<path
							d="M8 2v12M2 8h12"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
					Add tax rate
				</button>
			</div>

			{/* Filter row */}
			<div className="flex shrink-0 items-center gap-3 border-b border-[#edede4] bg-[#faf9f5] px-7 py-3">
				<div className="flex flex-1 items-center gap-2">
					<svg
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="none"
						className="shrink-0 text-[#6b7170]"
					>
						<circle
							cx="6.5"
							cy="6.5"
							r="4.5"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
						<path
							d="m10 10 3.5 3.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search rates…"
						className="w-[220px] rounded-lg border border-[#edede4] bg-white px-3 py-1.5 text-xs text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a] placeholder:text-[#6b7170]"
					/>
				</div>
				<select
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
					className="rounded-lg border border-[#edede4] bg-white px-3 py-1.5 text-xs text-[#0a0a0a] outline-none focus:border-[#0a0a0a]"
				>
					<option value="active">Active</option>
					<option value="all">All status</option>
				</select>
			</div>

			{/* Error */}
			{isError && (
				<div className="shrink-0 px-7 pt-4">
					<StatusCallout
						variant="error"
						title="Failed to load tax rates"
						onRetry={() => refetch()}
					>
						<p className="text-sm">Please try again.</p>
					</StatusCallout>
				</div>
			)}

			{/* Table */}
			<div className="min-h-0 flex-1 overflow-auto">
				{!isError && rows.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-[#6b7170]">
						<svg
							width="32"
							height="32"
							viewBox="0 0 16 16"
							fill="none"
							className="opacity-30"
						>
							<path
								d="M2 3h12M4 7h8M6 11h4"
								stroke="#0a0a0a"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
						<span className="font-medium text-[#0a0a0a]">No tax rates</span>
						<span>No rates match the current filter.</span>
						<button
							type="button"
							onClick={openCreate}
							className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#edede4] bg-white px-3 py-1.5 text-xs font-medium text-[#0a0a0a] hover:bg-[#f7f5ee]"
						>
							<svg width="11" height="11" viewBox="0 0 16 16" fill="none">
								<path
									d="M8 2v12M2 8h12"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
								/>
							</svg>
							Add tax rate
						</button>
					</div>
				) : (
					<table className="w-full border-collapse text-[13px]">
						<thead>
							<tr>
								{[
									"Name",
									"Rate",
									"Category",
									"Country",
									"Effective From",
									"Effective To",
									"Status",
									"Default",
									"",
								].map((h) => (
									<th
										key={h}
										className="border-b border-[#edede4] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7170] whitespace-nowrap"
									>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									key={row.id}
									className="group border-b border-[#f7f5ee] last:border-b-0 hover:bg-[#faf9f5] transition-colors"
									style={{ opacity: row.isActive ? 1 : 0.65 }}
								>
									{/* Name */}
									<td className="px-3.5 py-3 align-middle">
										<div className="font-semibold text-[13px] text-[#0a0a0a]">
											{row.name}
										</div>
										<div className="text-xs text-[#6b7170] font-mono">
											{row.code}
										</div>
									</td>

									{/* Rate */}
									<td className="px-3.5 py-3 align-middle">
										<span className="font-mono tabular-nums text-[13px] font-semibold text-[#0a0a0a]">
											{(row.rateInBasisPoints / 100).toFixed(2)}%
										</span>
									</td>

									{/* Category */}
									<td className="px-3.5 py-3 align-middle">
										<span
											className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
											style={{ background: "#d9d9ca", color: "#0a0a0a" }}
										>
											{CATEGORY_LABELS[row.category] ?? row.category}
										</span>
									</td>

									{/* Country */}
									<td className="px-3.5 py-3 align-middle">
										{row.country ? (
											<span className="text-[13px] text-[#0a0a0a]">
												{COUNTRY_LABELS[row.country] ?? row.country}
											</span>
										) : (
											<span className="text-xs text-[#6b7170]">Org-wide</span>
										)}
									</td>

									{/* Effective From */}
									<td className="px-3.5 py-3 align-middle">
										<span className="font-mono text-xs tabular-nums text-[#0a0a0a]">
											{formatDate(row.effectiveFrom)}
										</span>
									</td>

									{/* Effective To */}
									<td className="px-3.5 py-3 align-middle">
										{row.effectiveUntil ? (
											<span className="font-mono text-xs tabular-nums text-[#0a0a0a]">
												{formatDate(row.effectiveUntil)}
											</span>
										) : (
											<span className="text-xs text-[#6b7170]">—</span>
										)}
									</td>

									{/* Status */}
									<td className="px-3.5 py-3 align-middle">
										{row.isActive ? (
											<span className="inline-flex items-center gap-1 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-medium text-[#15803d]">
												Active
											</span>
										) : (
											<span className="inline-flex items-center gap-1 rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#b91c1c]">
												Inactive
											</span>
										)}
									</td>

									{/* Default */}
									<td className="px-3.5 py-3 align-middle">
										{row.isDefault ? (
											<span className="inline-flex items-center rounded-md bg-[#000] px-2 py-0.5 text-[11px] font-medium text-white">
												Default
											</span>
										) : row.isActive ? (
											<button
												type="button"
												title="Set as default"
												disabled={isMutating}
												onClick={() => setDefaultMutation.mutate(row.id)}
												className="rounded-md border border-[#edede4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6b7170] transition-colors hover:border-[#0a0a0a] hover:text-[#0a0a0a] disabled:opacity-50"
											>
												Set default
											</button>
										) : (
											<span className="text-xs text-[#6b7170]">—</span>
										)}
									</td>

									{/* Actions */}
									<td className="px-3.5 py-3 align-middle">
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => openEdit(row)}
												disabled={isMutating}
												className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3] disabled:opacity-50"
											>
												Edit
											</button>
											{row.isActive && (
												<button
													type="button"
													onClick={() => deactivateMutation.mutate(row.id)}
													disabled={isMutating || row.isDefault}
													title={
														row.isDefault
															? "Cannot deactivate the default rate"
															: undefined
													}
													className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7170] transition-colors hover:bg-[#f3f3f3] disabled:opacity-40"
												>
													Deactivate
												</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{/* Footer */}
			<div className="flex shrink-0 items-center justify-between border-t border-[#edede4] bg-[#faf9f5] px-7 py-3">
				<span className="text-xs text-[#6b7170]">
					{allRows.length} tax {allRows.length === 1 ? "rate" : "rates"} ·{" "}
					{activeCount} active
				</span>
			</div>

			{/* Create / Edit Dialog */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<DialogContent
					className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							TAX CONFIGURATION
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							{editingId ? "Edit Tax Rate" : "Add Tax Rate"}
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							{editingId
								? "Update the details for this tax rate."
								: "Define a new tax rate to apply on sales."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit}>
						<div className="px-6 pt-4 pb-2 overflow-y-auto space-y-4">
							{/* Name */}
							<div>
								<label
									htmlFor="tr-name"
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
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
									className="mt-0 w-full"
								/>
							</div>

							{/* Code */}
							<div>
								<label
									htmlFor="tr-code"
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
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
									className="w-full font-mono uppercase"
									required
								/>
								<p className="text-xs text-[#737373] mt-1">
									Short identifier. Stored in uppercase.
								</p>
							</div>

							{/* Rate */}
							<div>
								<label
									htmlFor="tr-rate"
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
								>
									Rate (%) *
								</label>
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
										className="w-full pr-8 font-mono tabular-nums"
										required
									/>
									<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] text-sm pointer-events-none">
										%
									</span>
								</div>
								{form.ratePercent &&
									!Number.isNaN(parseFloat(form.ratePercent)) && (
										<p className="text-xs text-[#737373] mt-1">
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
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
								>
									Category
								</label>
								<Select
									value={form.category}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, category: v as TaxCategory }))
									}
								>
									<SelectTrigger id="tr-category" className="w-full">
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

							{/* Country */}
							<div>
								<label
									htmlFor="tr-country"
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
								>
									Country
								</label>
								<Select
									value={form.country || "__org__"}
									onValueChange={(v) =>
										setForm((f) => ({
											...f,
											country: v === "__org__" ? "" : v,
										}))
									}
								>
									<SelectTrigger id="tr-country" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__org__">
											Org-wide (all countries)
										</SelectItem>
										{COUNTRY_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-[#737373] mt-1">
									Scope this rate to one country, or leave org-wide to apply
									everywhere. Branch sales resolve their rate by country.
								</p>
							</div>

							{/* Date range */}
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="tr-from"
										className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
									>
										Effective From *
									</label>
									<Input
										id="tr-from"
										type="date"
										value={form.effectiveFrom}
										onChange={(e) =>
											setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
										}
										required
										className="w-full"
									/>
								</div>
								<div>
									<label
										htmlFor="tr-until"
										className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
									>
										Effective Until
									</label>
									<Input
										id="tr-until"
										type="date"
										value={form.effectiveUntil}
										onChange={(e) =>
											setForm((f) => ({ ...f, effectiveUntil: e.target.value }))
										}
										min={form.effectiveFrom || undefined}
										className="w-full"
									/>
								</div>
							</div>

							{/* Description */}
							<div>
								<label
									htmlFor="tr-description"
									className="block text-sm font-medium text-[#0a0a0a] mb-1.5"
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
									className="w-full"
								/>
							</div>

							{/* Is default — only shown on create */}
							{!editingId && (
								<div className="flex items-center gap-2">
									<Checkbox
										id="tr-default"
										checked={form.isDefault}
										onCheckedChange={(checked) =>
											setForm((f) => ({ ...f, isDefault: checked === true }))
										}
									/>
									<label
										htmlFor="tr-default"
										className="cursor-pointer text-sm text-[#0a0a0a]"
									>
										Set as default tax rate
									</label>
								</div>
							)}
						</div>

						<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
							<button
								type="button"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex items-center justify-center rounded-lg border border-[#edede4] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex items-center justify-center rounded-lg bg-[#0a0a0a] text-white hover:bg-[#262626] px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId
										? "Save Changes"
										: "Add Tax Rate"}
							</button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
