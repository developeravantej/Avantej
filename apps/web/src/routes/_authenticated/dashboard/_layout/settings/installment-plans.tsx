import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
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
import { Plus, Star, CreditCard } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/installment-plans",
)({
	beforeLoad: async () => {
		await requirePermission("payments:update");
	},
	validateSearch: z.object({
		filter: z.enum(["all", "active", "inactive"]).optional().default("active"),
	}),
	component: InstallmentPlansPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type InstallmentPlanRow = {
	id: string;
	code: string;
	name: string;
	numInstallments: number;
	defaultIntervalDays: number;
	pricePremiumBps: number;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
	sortOrder: number;
	createdAt: string;
};

type FormState = {
	code: string;
	name: string;
	numInstallments: string;
	defaultIntervalDays: string;
	pricePremiumPct: string;
	description: string;
	isDefault: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
	code: "",
	name: "",
	numInstallments: "1",
	defaultIntervalDays: "30",
	pricePremiumPct: "0",
	description: "",
	isDefault: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a basis-points premium as a % string */
function fmtPremium(bps: number) {
	if (bps === 0) return null;
	return `+${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Compute per-installment amount from a sample total (in RM cents-free) */
function samplePerInstallment(total: number, n: number) {
	if (n <= 0) return total;
	const per = total / n;
	return per % 1 === 0 ? per.toFixed(0) : per.toFixed(2);
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
	plan,
	sampleAmount,
	isMutating,
	onEdit,
	onSetDefault,
	onDeactivate,
}: {
	plan: InstallmentPlanRow;
	sampleAmount: number;
	isMutating: boolean;
	onEdit: () => void;
	onSetDefault: () => void;
	onDeactivate: () => void;
}) {
	const inactive = !plan.isActive;
	const per = samplePerInstallment(sampleAmount, plan.numInstallments);
	const premium = fmtPremium(plan.pricePremiumBps);
	const totalWithPremium = premium
		? sampleAmount * (1 + plan.pricePremiumBps / 10000)
		: sampleAmount;

	return (
		<div
			className={cn(
				"flex flex-col rounded-xl border border-[#e5e5e5] bg-white p-5",
				inactive && "opacity-60",
			)}
		>
			{/* Card header */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					{/* Badges row */}
					<div className="flex flex-wrap items-center gap-1.5">
						{/* Active / Inactive badge */}
						<span
							className={cn(
								"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
								plan.isActive
									? "border-green-200 bg-green-50 text-green-700"
									: "border-red-200 bg-red-50 text-red-700",
							)}
						>
							<span
								className={cn(
									"h-1.5 w-1.5 rounded-full",
									plan.isActive ? "bg-green-500" : "bg-red-400",
								)}
							/>
							{plan.isActive ? "Active" : "Inactive"}
						</span>

						{/* Installments count badge */}
						<span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#4a4f51]">
							×{plan.numInstallments}
						</span>

						{/* Interval */}
						{plan.numInstallments > 1 && (
							<span className="text-[11px] text-[#6b7170]">
								· {plan.defaultIntervalDays} day interval
							</span>
						)}

						{/* Default star */}
						{plan.isDefault && (
							<span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
								<Star className="h-3 w-3 fill-amber-400 text-amber-400" />
								Default
							</span>
						)}
					</div>

					{/* Plan name */}
					<h4 className="mt-2 text-sm font-semibold text-[#0a0a0a]">
						{plan.name}
					</h4>

					{/* Code */}
					<p className="mt-0.5 font-mono text-[11px] text-[#8a8f91]">
						{plan.code}
					</p>

					{/* Description */}
					{plan.description && (
						<p className="mt-1 line-clamp-2 text-xs text-[#6b7170]">
							{plan.description}
						</p>
					)}
				</div>

				{/* Edit button */}
				<button
					type="button"
					onClick={onEdit}
					disabled={isMutating}
					className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
				>
					Edit
				</button>
			</div>

			{/* Sample math block */}
			<div className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-3">
				<div className="mb-2 text-xs font-medium text-[#6b7170]">
					Sample · RM {sampleAmount.toLocaleString()} sale
					{premium && (
						<span className="ml-1 text-amber-600">
							({premium} premium → RM {totalWithPremium.toFixed(0)})
						</span>
					)}
				</div>

				{plan.numInstallments === 1 ? (
					// Single payment
					<div className="flex items-center gap-2">
						<div className="flex-1 rounded-lg bg-[#000] px-3 py-2 text-center">
							<div className="font-mono text-sm font-bold tabular-nums text-white">
								RM {sampleAmount.toLocaleString()}
							</div>
							<div className="mt-0.5 text-[10px] text-[#8a8f91]">Due today</div>
						</div>
					</div>
				) : plan.numInstallments <= 4 ? (
					// 2–4 installments: show each chip
					<div className="flex flex-wrap items-center gap-1.5">
						{Array.from({ length: plan.numInstallments }).map((_, i) => (
							<div
								key={i}
								className={cn(
									"flex-1 rounded-lg border px-2 py-1.5 text-center",
									i === 0
										? "border-[#000] bg-[#000] text-white"
										: "border-[#e5e5e5] bg-[#f3f3f3]",
								)}
								style={{ minWidth: "3rem" }}
							>
								<div
									className={cn(
										"font-mono text-xs font-bold tabular-nums",
										i === 0 ? "text-white" : "text-[#0a0a0a]",
									)}
								>
									RM {per}
								</div>
								<div
									className={cn(
										"text-[10px]",
										i === 0 ? "text-[#8a8f91]" : "text-[#6b7170]",
									)}
								>
									{i === 0
										? "Today"
										: `Day ${plan.defaultIntervalDays * i}`}
								</div>
							</div>
						))}
					</div>
				) : (
					// 5+ installments: show "per installment × count" summary
					<div className="flex items-center gap-2">
						<div className="rounded-lg border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-1.5 text-center">
							<div className="font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
								RM {per}
							</div>
							<div className="text-[10px] text-[#6b7170]">per installment</div>
						</div>
						<span className="font-mono text-xs text-[#6b7170]">×</span>
						<div className="text-xs leading-tight text-[#6b7170]">
							{plan.numInstallments} installments
							<br />
							<span className="font-mono tabular-nums font-medium text-[#0a0a0a]">
								RM {sampleAmount.toLocaleString()}
							</span>{" "}
							total
						</div>
					</div>
				)}
			</div>

			{/* Footer actions */}
			<div className="mt-3 flex items-center gap-1.5">
				{plan.isActive ? (
					<button
						type="button"
						onClick={onDeactivate}
						disabled={isMutating}
						className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Disable
					</button>
				) : (
					// Inactive: show no enable button (handled via Edit)
					null
				)}

				{!plan.isDefault && plan.isActive && (
					<button
						type="button"
						onClick={onSetDefault}
						disabled={isMutating}
						className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7170] transition-colors hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Star className="h-3 w-3" />
						Set default
					</button>
				)}
			</div>
		</div>
	);
}

// ─── Page Component ───────────────────────────────────────────────────────────

function InstallmentPlansPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const installmentPlansKey = ["installmentPlans", organizationId];
	const { filter } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Sheet / form state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Sample amount (for the math preview in cards)
	const [sampleAmount, setSampleAmount] = useState(1200);
	const [sampleInput, setSampleInput] = useState("1,200");

	// Deactivate dialog
	const [deactivateTarget, setDeactivateTarget] =
		useState<InstallmentPlanRow | null>(null);
	const [deactivateWarning, setDeactivateWarning] = useState<string | null>(null);
	const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

	// ─── Queries & Mutations ─────────────────────────────────────────────────

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: installmentPlansKey,
		queryFn: async () => {
			if (!organizationId) return [];
			return client.installmentPlans.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const createMutation = useApiMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.create({
				organizationId,
				code: values.code.trim(),
				name: values.name,
				numInstallments: parseInt(values.numInstallments, 10),
				defaultIntervalDays: parseInt(values.defaultIntervalDays, 10),
				pricePremiumBps: Math.round(
					parseFloat(values.pricePremiumPct || "0") * 100,
				),
				description: values.description || undefined,
				isDefault: values.isDefault,
			});
		},
		successMessage: "Installment plan created.",
		errorMessage: (err) => err.message || "Failed to create installment plan.",
		invalidate: [installmentPlansKey],
		onSuccess: () => closeSheet(),
	});

	const updateMutation = useApiMutation({
		mutationFn: ({ id, values }: { id: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.update({
				organizationId,
				id,
				name: values.name,
				numInstallments: parseInt(values.numInstallments, 10),
				defaultIntervalDays: parseInt(values.defaultIntervalDays, 10),
				pricePremiumBps: Math.round(
					parseFloat(values.pricePremiumPct || "0") * 100,
				),
				description: values.description || undefined,
			});
		},
		successMessage: "Installment plan updated.",
		errorMessage: (err) => err.message || "Failed to update installment plan.",
		invalidate: [installmentPlansKey],
		onSuccess: () => closeSheet(),
	});

	const setDefaultMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.setDefault({ organizationId, id });
		},
		successMessage: "Default installment plan updated.",
		errorMessage: (err) => err.message || "Failed to set default.",
		invalidate: [installmentPlansKey],
	});

	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.installmentPlans.deactivate({ organizationId, id });
		},
		successMessage: "Installment plan deactivated.",
		errorMessage: (err) => err.message || "Failed to deactivate.",
		invalidate: [installmentPlansKey],
		onSuccess: () => {
			setDeactivateDialogOpen(false);
			setDeactivateTarget(null);
			setDeactivateWarning(null);
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
			pricePremiumPct: String((row.pricePremiumBps ?? 0) / 100),
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
		if (!form.name.trim()) { toast.error("Name is required."); return; }
		if (!editingId && !form.code.trim()) { toast.error("Code is required."); return; }
		const n = parseInt(form.numInstallments, 10);
		if (Number.isNaN(n) || n < 1) { toast.error("Installments must be ≥ 1."); return; }
		const d = parseInt(form.defaultIntervalDays, 10);
		if (Number.isNaN(d) || d < 1) { toast.error("Interval days must be ≥ 1."); return; }
		const p = parseFloat(form.pricePremiumPct || "0");
		if (Number.isNaN(p) || p < 0 || p > 100) { toast.error("Premium must be 0–100%."); return; }
		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	async function handleDeactivateClick(row: InstallmentPlanRow) {
		setDeactivateTarget(row);
		setDeactivateWarning(null);
		if (organizationId) {
			try {
				const allServices = await client.services.list({ organizationId, isActive: true });
				const count = allServices.filter((s) =>
					(s.availablePaymentPlans ?? []).includes(row.code),
				).length;
				if (count > 0) {
					setDeactivateWarning(
						`This plan is enabled on ${count} active service${count === 1 ? "" : "s"}. Deactivating it will prevent customers from selecting it for new purchases but won't affect existing schedules.`,
					);
				}
			} catch {
				// proceed without warning
			}
		}
		setDeactivateDialogOpen(true);
	}

	// ─── Data ─────────────────────────────────────────────────────────────────

	const allRows: InstallmentPlanRow[] = apiData.map((item) => ({
		id: item.id,
		code: item.code,
		name: item.name,
		numInstallments: item.numInstallments,
		defaultIntervalDays: item.defaultIntervalDays,
		pricePremiumBps: item.pricePremiumBps ?? 0,
		description: item.description ?? null,
		isDefault: item.isDefault ?? false,
		isActive: item.isActive ?? true,
		sortOrder: item.sortOrder ?? 0,
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
			<div className="-m-6 flex h-screen flex-col">
				<div className="flex flex-1 items-center justify-center text-sm text-[#6b7170]">
					Select an organization to manage installment plans.
				</div>
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
						INSTALLMENT PLANS
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Installment Plans
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						{allRows.length} plan{allRows.length !== 1 ? "s" : ""} · {activeCount} active
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					disabled={isMutating}
					className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Plus className="h-4 w-4" />
					New Plan
				</button>
			</div>

			{/* Filter + sample amount strip */}
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

					{/* Sample amount input */}
					<div className="ml-auto flex items-center gap-1.5 text-xs text-[#737373]">
						<span>Sample amount</span>
						<div className="flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1">
							<span className="font-medium text-[#737373]">RM</span>
							<input
								type="text"
								value={sampleInput}
								onChange={(e) => {
									const raw = e.target.value.replace(/,/g, "");
									const n = parseFloat(raw);
									setSampleInput(e.target.value);
									if (!Number.isNaN(n) && n > 0) setSampleAmount(n);
								}}
								onBlur={() => {
									setSampleInput(sampleAmount.toLocaleString());
								}}
								className="w-16 bg-transparent font-mono text-xs font-medium text-[#0a0a0a] tabular-nums outline-none"
							/>
						</div>
					</div>
			</div>

			{/* Error */}
			{isError && (
				<StatusCallout
					variant="error"
					title="Failed to load installment plans"
					onRetry={() => refetch()}
				>
					<p className="text-sm">Please try again.</p>
				</StatusCallout>
			)}

			{/* Empty */}
			{!isError && rows.length === 0 && (
				<div className="rounded-2xl border border-[#e5e5e5] bg-white">
					<EmptyState
						icon={CreditCard}
						title="No installment plans"
						description={
							filter === "inactive"
								? "No inactive plans."
								: "No installment plans configured yet. Add one to get started."
						}
						action={
							filter !== "inactive"
								? { label: "New Plan", onClick: openCreate }
								: undefined
						}
					/>
				</div>
			)}

			{/* Plan grid */}
			{!isError && rows.length > 0 && (
				<div className="grid grid-cols-3 gap-4">
					{rows.map((plan) => (
						<PlanCard
							key={plan.id}
							plan={plan}
							sampleAmount={sampleAmount}
							isMutating={isMutating}
							onEdit={() => openEdit(plan)}
							onSetDefault={() => setDefaultMutation.mutate(plan.id)}
							onDeactivate={() => handleDeactivateClick(plan)}
						/>
					))}
				</div>
			)}

			{/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => { if (!open) closeSheet(); else setSheetOpen(true); }}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto bg-white">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold text-[#0a0a0a]">
							{editingId ? "Edit Installment Plan" : "Add Installment Plan"}
						</DialogTitle>
						<DialogDescription className="text-sm text-[#6b7170]">
							{editingId
								? "Update plan details. The plan code cannot be changed."
								: "Define a new installment plan to offer on package services."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="space-y-4 p-6 pt-0">
						{/* Code */}
						<div>
							<label htmlFor="ip-code" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Code {!editingId && "*"}
							</label>
							<Input
								id="ip-code"
								placeholder="e.g. monthly_6"
								value={form.code}
								onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
								className="font-mono"
								required={!editingId}
								disabled={!!editingId}
							/>
							<p className="mt-1 text-[11px] text-[#8a8f91]">
								{editingId ? "Cannot be changed after creation." : "Short identifier used internally. Cannot be changed later."}
							</p>
						</div>

						{/* Name */}
						<div>
							<label htmlFor="ip-name" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Name *
							</label>
							<Input
								id="ip-name"
								placeholder="e.g. Monthly (6 payments)"
								value={form.name}
								onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
								required
							/>
						</div>

						{/* Installments + Interval days */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label htmlFor="ip-num" className="block text-xs font-medium text-[#0a0a0a] mb-1">
									Installments *
								</label>
								<Input
									id="ip-num"
									type="number"
									min="1"
									step="1"
									placeholder="e.g. 6"
									value={form.numInstallments}
									onChange={(e) => setForm((f) => ({ ...f, numInstallments: e.target.value }))}
									required
								/>
								<p className="mt-1 text-[11px] text-[#8a8f91]">Use 1 for full single payment.</p>
							</div>
							<div>
								<label htmlFor="ip-days" className="block text-xs font-medium text-[#0a0a0a] mb-1">
									Interval (days) *
								</label>
								<Input
									id="ip-days"
									type="number"
									min="1"
									step="1"
									placeholder="e.g. 30"
									value={form.defaultIntervalDays}
									onChange={(e) => setForm((f) => ({ ...f, defaultIntervalDays: e.target.value }))}
									required
								/>
								<p className="mt-1 text-[11px] text-[#8a8f91]">Services can override this.</p>
							</div>
						</div>

						{/* Premium */}
						<div>
							<label htmlFor="ip-premium" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Price Premium (%)
							</label>
							<Input
								id="ip-premium"
								type="number"
								min="0"
								max="100"
								step="0.01"
								placeholder="0"
								value={form.pricePremiumPct}
								onChange={(e) => setForm((f) => ({ ...f, pricePremiumPct: e.target.value }))}
							/>
							<p className="mt-1 text-[11px] text-[#8a8f91]">
								Markup on base price when this plan is selected. 0 = no premium.
							</p>
						</div>

						{/* Description */}
						<div>
							<label htmlFor="ip-desc" className="block text-xs font-medium text-[#0a0a0a] mb-1">
								Description
							</label>
							<Textarea
								id="ip-desc"
								placeholder="Optional notes about this plan"
								rows={3}
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</div>

						{/* Is default — only on create */}
						{!editingId && (
							<div className="flex items-center gap-2">
								<Checkbox
									id="ip-default"
									checked={form.isDefault}
									onCheckedChange={(c) => setForm((f) => ({ ...f, isDefault: c === true }))}
								/>
								<label htmlFor="ip-default" className="cursor-pointer text-sm text-[#0a0a0a]">
									Set as default plan
								</label>
							</div>
						)}

						<div className="flex justify-end gap-3 pt-2">
							<button
								type="button"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
								className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
								className="rounded-lg bg-[#000] px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId
										? "Save Changes"
										: "Add Plan"}
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			{/* ── Deactivate Dialog ────────────────────────────────────────────── */}
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
				<DialogContent className="sm:max-w-md rounded-2xl bg-white p-6">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold text-[#0a0a0a]">
							Disable Installment Plan
						</DialogTitle>
						<DialogDescription className="text-sm text-[#6b7170]">
							Are you sure you want to disable{" "}
							<strong className="text-[#0a0a0a]">{deactivateTarget?.name}</strong>?
						</DialogDescription>
					</DialogHeader>

					{deactivateWarning && (
						<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
							{deactivateWarning}
						</div>
					)}

					<p className="text-xs text-[#6b7170]">
						Inactive plans are hidden from the service form. Existing installment
						schedules are not affected.
					</p>

					<DialogFooter>
						<div className="mt-2 flex justify-end gap-3">
							<button
								type="button"
								onClick={() => {
									setDeactivateDialogOpen(false);
									setDeactivateTarget(null);
									setDeactivateWarning(null);
								}}
								disabled={deactivateMutation.isPending}
								className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => { if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id); }}
								disabled={deactivateMutation.isPending}
								className="rounded-lg bg-[#000] px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
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
