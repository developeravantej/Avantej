import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Star, Percent } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/tax-rates",
)({
	beforeLoad: async () => {
		await requirePermission("tax_configuration:update");
	},
	validateSearch: z.object({
		filter: z.enum(["all", "active", "inactive"]).optional().default("active"),
	}),
	component: TaxRatesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TaxRateRow = {
	id: string;
	name: string;
	code: string;
	rateInBasisPoints: number;
	category: string | null;
	isDefault: boolean;
	isActive: boolean;
	effectiveFrom: string;
	effectiveUntil: string | null;
	description: string | null;
	createdAt: string;
};

type FormState = {
	name: string;
	code: string;
	ratePct: string;
	category: string;
	description: string;
	isDefault: boolean;
	effectiveFrom: string;
	effectiveUntil: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

function todayIso(): string {
	return new Date().toISOString().split("T")[0];
}

const EMPTY_FORM: FormState = {
	name: "",
	code: "",
	ratePct: "0",
	category: "",
	description: "",
	isDefault: false,
	effectiveFrom: todayIso(),
	effectiveUntil: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(bps: number): string {
	const pct = bps / 100;
	return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
}

function fmtDate(val: string | null | undefined): string {
	if (!val) return "—";
	try {
		return new Date(val).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

// ─── Page Component ───────────────────────────────────────────────────────────

function TaxRatesPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { filter } = Route.useSearch();
	const navigate = Route.useNavigate();

	const canCreate = hasPermission("tax_configuration:create");
	const canUpdate = hasPermission("tax_configuration:update");

	const taxRatesKey = ["taxRates", organizationId];

	// ─── Sheet / form state ───────────────────────────────────────────────────
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// ─── Deactivate dialog ────────────────────────────────────────────────────
	const [deactivateTarget, setDeactivateTarget] = useState<TaxRateRow | null>(null);
	const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

	// ─── Queries & Mutations ──────────────────────────────────────────────────
	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: taxRatesKey,
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
				name: values.name.trim(),
				code: values.code.trim().toUpperCase(),
				rateInBasisPoints: Math.round(parseFloat(values.ratePct || "0") * 100),
				category: values.category.trim() || undefined,
				description: values.description.trim() || undefined,
				isDefault: values.isDefault,
				effectiveFrom: new Date(`${values.effectiveFrom}T00:00:00Z`).toISOString(),
				effectiveUntil: values.effectiveUntil
					? new Date(`${values.effectiveUntil}T23:59:59Z`).toISOString()
					: undefined,
			});
		},
		successMessage: "Tax rate created.",
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
				name: values.name.trim(),
				rateInBasisPoints: Math.round(parseFloat(values.ratePct || "0") * 100),
				category: values.category.trim() || undefined,
				description: values.description.trim() || undefined,
				effectiveFrom: values.effectiveFrom
					? new Date(`${values.effectiveFrom}T00:00:00Z`).toISOString()
					: undefined,
				effectiveUntil: values.effectiveUntil
					? new Date(`${values.effectiveUntil}T23:59:59Z`).toISOString()
					: undefined,
			});
		},
		successMessage: "Tax rate updated.",
		errorMessage: (err) => err.message || "Failed to update tax rate.",
		invalidate: [taxRatesKey],
		onSuccess: () => closeSheet(),
	});

	const setDefaultMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.taxRates.setDefault({ organizationId, id });
		},
		successMessage: "Default tax rate updated.",
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
		onSuccess: () => {
			setDeactivateDialogOpen(false);
			setDeactivateTarget(null);
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
			ratePct: String((row.rateInBasisPoints ?? 0) / 100),
			category: row.category ?? "",
			description: row.description ?? "",
			isDefault: row.isDefault,
			effectiveFrom: row.effectiveFrom
				? new Date(row.effectiveFrom).toISOString().split("T")[0]
				: todayIso(),
			effectiveUntil: row.effectiveUntil
				? new Date(row.effectiveUntil).toISOString().split("T")[0]
				: "",
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
		if (!form.name.trim()) { toast.error("Name is required."); return; }
		if (!editingId && !form.code.trim()) { toast.error("Code is required."); return; }
		if (!form.effectiveFrom) { toast.error("Effective from date is required."); return; }
		const p = parseFloat(form.ratePct || "0");
		if (Number.isNaN(p) || p < 0 || p > 100) { toast.error("Rate must be 0–100%."); return; }
		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	// ─── Data ─────────────────────────────────────────────────────────────────
	const allRows: TaxRateRow[] = apiData.map((item) => ({
		id: item.id,
		name: item.name,
		code: item.code,
		rateInBasisPoints: item.rateInBasisPoints ?? 0,
		category: item.category ?? null,
		isDefault: item.isDefault ?? false,
		isActive: item.isActive ?? true,
		effectiveFrom: item.effectiveFrom ? String(item.effectiveFrom) : "",
		effectiveUntil: item.effectiveUntil ? String(item.effectiveUntil) : null,
		description: item.description ?? null,
		createdAt: item.createdAt ? String(item.createdAt) : "",
	}));

	const activeCount = allRows.filter((r) => r.isActive).length;
	const inactiveCount = allRows.filter((r) => !r.isActive).length;

	const rows = allRows.filter((r) => {
		if (filter === "active") return r.isActive;
		if (filter === "inactive") return !r.isActive;
		return true;
	});

	// ─── Guard ────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="-m-6 flex min-h-screen items-center justify-center">
				<p className="text-sm text-[#737373]">Select an organization to manage tax rates.</p>
			</div>
		);
	}

	if (isLoading) return <PageLoader />;

	// ─── Render ───────────────────────────────────────────────────────────────
	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="mb-1 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
						TAX CONFIGURATION
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Tax Rates
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						{allRows.length} rate{allRows.length !== 1 ? "s" : ""} · {activeCount} active
					</p>
				</div>
				{canCreate && (
					<button
						type="button"
						onClick={openCreate}
						disabled={isMutating}
						className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
					>
						<Plus className="h-4 w-4" />
						New Rate
					</button>
				)}
			</div>

			{/* Filter pills */}
			<div className="mb-5 flex flex-wrap items-center gap-2">
				{(
					[
						{ key: "all", label: `All (${allRows.length})` },
						{ key: "active", label: `Active (${activeCount})` },
						{ key: "inactive", label: `Inactive (${inactiveCount})` },
					] as const
				).map(({ key, label }) => (
					<button
						key={key}
						type="button"
						onClick={() => navigate({ search: { filter: key } })}
						className={
							filter === key
								? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
								: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
						}
					>
						{label}
					</button>
				))}
			</div>

			{/* Error state */}
			{isError && (
				<StatusCallout variant="error" title="Failed to load tax rates" onRetry={() => refetch()}>
					<p className="text-sm">Please try again.</p>
				</StatusCallout>
			)}

			{/* Empty state */}
			{!isError && rows.length === 0 && (
				<div className="rounded-2xl border border-[#e5e5e5] bg-white">
					<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
						<Percent className="h-8 w-8 mb-3 opacity-30" />
						<p className="text-sm font-medium text-[#0a0a0a]">
							{filter === "inactive" ? "No inactive tax rates" : "No tax rates yet"}
						</p>
						<p className="text-xs mt-1">
							{filter !== "inactive" && canCreate
								? "Create your first tax rate to start applying to transactions."
								: "Try changing filters."}
						</p>
						{filter !== "inactive" && canCreate && (
							<button
								type="button"
								onClick={openCreate}
								className="mt-4 inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
							>
								<Plus className="h-4 w-4" />
								New Rate
							</button>
						)}
					</div>
				</div>
			)}

			{/* Table */}
			{!isError && rows.length > 0 && (
				<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
					<table className="w-full">
						<thead className="bg-[#f3f3f3]">
							<tr className="border-b border-[#e5e5e5]">
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Name</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Code</th>
								<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">Rate</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Category</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Effective From</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Status</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]" />
							</tr>
						</thead>
						<tbody className="divide-y divide-[#e5e5e5]">
							{rows.map((row) => (
								<tr
									key={row.id}
									className={cn(
										"hover:bg-[#fafafa] transition-colors group",
										!row.isActive && "opacity-60",
									)}
								>
									<td className="px-4 py-3">
										<div className="flex items-center gap-1.5">
											<span className="text-sm font-medium text-[#0a0a0a]">{row.name}</span>
											{row.isDefault && (
												<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
													<Star className="h-3 w-3 fill-amber-400 text-amber-400" />
													Default
												</span>
											)}
										</div>
										{row.description && (
											<p className="mt-0.5 text-xs text-[#737373] line-clamp-1">{row.description}</p>
										)}
									</td>
									<td className="px-4 py-3">
										<span className="font-mono tabular-nums text-xs text-[#737373]">{row.code}</span>
									</td>
									<td className="px-4 py-3 text-right font-mono tabular-nums text-sm font-semibold text-[#0a0a0a]">
										{fmtRate(row.rateInBasisPoints)}
									</td>
									<td className="px-4 py-3">
										{row.category ? (
											<span className="inline-flex items-center rounded-full border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 text-[11px] font-semibold text-[#737373]">
												{row.category}
											</span>
										) : (
											<span className="text-[#737373] font-mono tabular-nums text-sm">—</span>
										)}
									</td>
									<td className="px-4 py-3 font-mono tabular-nums text-sm text-[#737373]">
										{fmtDate(row.effectiveFrom)}
									</td>
									<td className="px-4 py-3">
										<span
											className={cn(
												"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
												row.isActive
													? "bg-emerald-50 text-emerald-700"
													: "bg-slate-100 text-slate-500",
											)}
										>
											<span
												className={cn(
													"h-1.5 w-1.5 rounded-full",
													row.isActive ? "bg-emerald-500" : "bg-slate-400",
												)}
											/>
											{row.isActive ? "Active" : "Inactive"}
										</span>
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
											{canUpdate && row.isActive && !row.isDefault && (
												<button
													type="button"
													onClick={() => setDefaultMutation.mutate(row.id)}
													disabled={isMutating}
													className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#737373] hover:bg-[#f3f3f3] disabled:opacity-50"
												>
													<Star className="h-3 w-3" />
													Set default
												</button>
											)}
											{canUpdate && (
												<button
													type="button"
													onClick={() => openEdit(row)}
													disabled={isMutating}
													className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] disabled:opacity-50"
												>
													Edit
												</button>
											)}
											{canUpdate && row.isActive && (
												<button
													type="button"
													onClick={() => { setDeactivateTarget(row); setDeactivateDialogOpen(true); }}
													disabled={isMutating}
													className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
												>
													Disable
												</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{/* Footer */}
					<div className="flex items-center border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5">
						<span className="text-[13px] text-[#737373]">
							{allRows.length} rate{allRows.length !== 1 ? "s" : ""} · {activeCount} active
							{inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ""}
						</span>
					</div>
				</div>
			)}

			{/* ── Create / Edit Dialog ──────────────────────────────────────────── */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => { if (!open) closeSheet(); else setSheetOpen(true); }}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto bg-white">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold text-[#0a0a0a]">
							{editingId ? "Edit Tax Rate" : "Add Tax Rate"}
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							{editingId
								? "Update the rate details. Code cannot be changed."
								: "Create a new tax rate. It will be available for use on services."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="space-y-4 p-6 pt-0">
						{/* Name */}
						<div>
							<label htmlFor="tr-name" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Name *
							</label>
							<Input
								id="tr-name"
								placeholder="e.g. GST 8%"
								value={form.name}
								onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
								required
							/>
						</div>

						{/* Code */}
						<div>
							<label htmlFor="tr-code" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Code {!editingId && "*"}
							</label>
							<Input
								id="tr-code"
								placeholder="e.g. GST_08"
								value={form.code}
								onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
								className="font-mono"
								required={!editingId}
								disabled={!!editingId}
							/>
							<p className="mt-1 text-[11px] text-[#737373]">
								{editingId ? "Cannot be changed after creation." : "Short identifier used internally. Cannot be changed later."}
							</p>
						</div>

						{/* Rate */}
						<div>
							<label htmlFor="tr-rate" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Rate (%) *
							</label>
							<Input
								id="tr-rate"
								type="number"
								min="0"
								max="100"
								step="0.01"
								placeholder="e.g. 8"
								value={form.ratePct}
								onChange={(e) => setForm((f) => ({ ...f, ratePct: e.target.value }))}
								required
							/>
							<p className="mt-1 text-[11px] text-[#737373]">Enter as a percentage, e.g. 8 for 8%.</p>
						</div>

						{/* Category */}
						<div>
							<label htmlFor="tr-cat" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Category
							</label>
							<Input
								id="tr-cat"
								placeholder="e.g. standard, reduced, zero"
								value={form.category}
								onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
							/>
						</div>

						{/* Effective dates */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label htmlFor="tr-from" className="block text-xs font-medium text-[#0a0a0a] mb-1">
									Effective From *
								</label>
								<Input
									id="tr-from"
									type="date"
									value={form.effectiveFrom}
									onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
									required
								/>
							</div>
							<div>
								<label htmlFor="tr-until" className="block text-xs font-medium text-[#0a0a0a] mb-1">
									Effective Until
								</label>
								<Input
									id="tr-until"
									type="date"
									value={form.effectiveUntil}
									onChange={(e) => setForm((f) => ({ ...f, effectiveUntil: e.target.value }))}
								/>
								<p className="mt-1 text-[11px] text-[#737373]">Leave blank for no expiry.</p>
							</div>
						</div>

						{/* Description */}
						<div>
							<label htmlFor="tr-desc" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Description
							</label>
							<Textarea
								id="tr-desc"
								placeholder="Optional notes"
								rows={2}
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</div>

						{/* Default — create only */}
						{!editingId && (
							<div className="flex items-center gap-2">
								<Checkbox
									id="tr-default"
									checked={form.isDefault}
									onCheckedChange={(c) => setForm((f) => ({ ...f, isDefault: c === true }))}
								/>
								<label htmlFor="tr-default" className="cursor-pointer text-sm text-[#0a0a0a]">
									Set as default tax rate
								</label>
							</div>
						)}

						<div className="flex justify-end gap-3 pt-2">
							<button
								type="button"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
								className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
							>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId
										? "Save Changes"
										: "Add Rate"}
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			{/* ── Deactivate Dialog ─────────────────────────────────────────────── */}
			<Dialog
				open={deactivateDialogOpen}
				onOpenChange={(open) => {
					if (!open) { setDeactivateDialogOpen(false); setDeactivateTarget(null); }
				}}
			>
				<DialogContent className="sm:max-w-md rounded-2xl bg-white p-6">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold text-[#0a0a0a]">
							Disable Tax Rate
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Are you sure you want to disable{" "}
							<strong className="text-[#0a0a0a]">{deactivateTarget?.name}</strong>?
							Inactive rates will no longer be selectable for new transactions.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<div className="mt-2 flex justify-end gap-3">
							<button
								type="button"
								onClick={() => { setDeactivateDialogOpen(false); setDeactivateTarget(null); }}
								disabled={deactivateMutation.isPending}
								className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => { if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id); }}
								disabled={deactivateMutation.isPending}
								className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-rose-700 transition disabled:opacity-50"
							>
								{deactivateMutation.isPending ? "Disabling…" : "Disable"}
							</button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
