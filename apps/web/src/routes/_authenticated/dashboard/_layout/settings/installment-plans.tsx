import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import { z } from "zod";
import { Plus, CreditCard } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	type InstallmentPlanRow,
	type FormState,
	EMPTY_FORM,
} from "@/components/pages/settings/installment-plans/types";
import { PlanCard } from "@/components/pages/settings/installment-plans/PlanCard";
import { PlanFormDialog } from "@/components/pages/settings/installment-plans/PlanFormDialog";
import { DeactivatePlanDialog } from "@/components/pages/settings/installment-plans/DeactivatePlanDialog";
import { SampleAmountInput } from "@/components/pages/settings/installment-plans/SampleAmountInput";

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

function InstallmentPlansPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const installmentPlansKey = orpc.installmentPlans.list.queryOptions({
		input: { organizationId: organizationId! },
	}).queryKey;
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
	const [deactivateWarning, setDeactivateWarning] = useState<string | null>(
		null,
	);
	const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.installmentPlans.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
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
		if (!form.name.trim()) {
			toast.error("Name is required.");
			return;
		}
		if (!editingId && !form.code.trim()) {
			toast.error("Code is required.");
			return;
		}
		const n = parseInt(form.numInstallments, 10);
		if (Number.isNaN(n) || n < 1) {
			toast.error("Installments must be ≥ 1.");
			return;
		}
		const d = parseInt(form.defaultIntervalDays, 10);
		if (Number.isNaN(d) || d < 1) {
			toast.error("Interval days must be ≥ 1.");
			return;
		}
		const p = parseFloat(form.pricePremiumPct || "0");
		if (Number.isNaN(p) || p < 0 || p > 100) {
			toast.error("Premium must be 0–100%.");
			return;
		}
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
				const allServices = await client.services.list({
					organizationId,
					isActive: true,
				});
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
	const rows = allRows.filter((r) =>
		filter === "all" ? true : filter === "active" ? r.isActive : !r.isActive,
	);

	if (!organizationId) {
		return (
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<div className="flex flex-1 items-center justify-center text-sm text-[#6b7170]">
					Select an organization to manage installment plans.
				</div>
			</div>
		);
	}

	return (
		<Skeleton
			name="settings-installment-plans"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<span className="text-[#737373]">Settings</span>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold">Installment Plans</span>
					</div>
					<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
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
								className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${filter === key ? "bg-[#0a0a0a] text-white" : "text-[#737373] hover:text-[#0a0a0a]"}`}
							>
								{label}
							</button>
						))}
					</div>
					<div className="ml-auto flex items-center gap-2">
						{/* Sample amount input */}
						<SampleAmountInput
							sampleInput={sampleInput}
							onSampleInputChange={(raw, parsed) => {
								setSampleInput(raw);
								if (parsed !== null) setSampleAmount(parsed);
							}}
							onBlur={() => setSampleInput(sampleAmount.toLocaleString())}
						/>
						<button
							type="button"
							onClick={openCreate}
							disabled={isMutating}
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Plus className="h-3.5 w-3.5" />
							New Plan
						</button>
					</div>
				</header>

				<div className="flex flex-col gap-5 px-6 py-6">
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
				</div>

				{/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
				<PlanFormDialog
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					editingId={editingId}
					form={form}
					setForm={setForm}
					onSubmit={handleSubmit}
					onCancel={closeSheet}
					isCreating={createMutation.isPending}
					isUpdating={updateMutation.isPending}
				/>

				{/* ── Deactivate Dialog ────────────────────────────────────────────── */}
				<DeactivatePlanDialog
					open={deactivateDialogOpen}
					onOpenChange={setDeactivateDialogOpen}
					target={deactivateTarget}
					warning={deactivateWarning}
					isDeactivating={deactivateMutation.isPending}
					onConfirm={() => {
						if (deactivateTarget)
							deactivateMutation.mutate(deactivateTarget.id);
					}}
					onCancel={() => {
						setDeactivateDialogOpen(false);
						setDeactivateTarget(null);
						setDeactivateWarning(null);
					}}
				/>
			</div>
		</Skeleton>
	);
}
