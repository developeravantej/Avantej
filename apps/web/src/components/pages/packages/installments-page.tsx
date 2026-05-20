import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import type { Installment, InstallmentOverviewItem, InstallmentPlan, SuggestRefundResult } from "@/features/installments/types";
import { AdjustCreditsDialog } from "@/features/installments/components/adjust-credits-dialog";
import { ConfirmPaymentDialog } from "@/features/installments/components/confirm-payment-dialog";
import { InstallmentsTable } from "@/features/installments/components/installments-table";
import { ManualUnlockDialog } from "@/features/installments/components/manual-unlock-dialog";
import { OverdraftDialog } from "@/features/installments/components/overdraft-dialog";
import { PackageDetailDialog } from "@/features/installments/components/package-detail-dialog";
import { RescheduleDialog } from "@/features/installments/components/reschedule-dialog";
import { WaiveDialog } from "@/features/installments/components/waive-dialog";
import { useInstallmentMutations } from "@/features/installments/hooks/useInstallmentMutations";

// ── Main component ─────────────────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function PackageInstallmentsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// ── List state ──────────────────────────────────────────────────────────────
	const [statusFilter, setStatusFilter] = useState<
		"active" | "overdue" | "locked" | "due_soon" | undefined
	>(undefined);

	// ── Filter state ─────────────────────────────────────────────────────────────
	const [showFilters, setShowFilters] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [dueBefore, setDueBefore] = useState<string | undefined>(undefined);
	const [dueAfter, setDueAfter] = useState<string | undefined>(undefined);
	const [planCode, setPlanCode] = useState<string | undefined>(undefined);
	const debouncedSearch = useDebounce(searchQuery, 300);

	// ── Sheet / detail state ─────────────────────────────────────────────────────
	const [selectedInstance, setSelectedInstance] =
		useState<InstallmentOverviewItem | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// ── Dialog states ────────────────────────────────────────────────────────────
	const [confirmInstallment, setConfirmInstallment] =
		useState<Installment | null>(null);
	const [rescheduleInstallment, setRescheduleInstallment] =
		useState<Installment | null>(null);
	const [waiveInstallment, setWaiveInstallment] =
		useState<Installment | null>(null);
	const [showUnlockDialog, setShowUnlockDialog] = useState(false);
	const [showRefundDialog, setShowRefundDialog] = useState(false);
	const [showAdjustCreditsDialog, setShowAdjustCreditsDialog] = useState(false);
	const [showOverdraftDialog, setShowOverdraftDialog] = useState(false);
	const [overdraftReason, setOverdraftReason] = useState("");

	// ── Form state ───────────────────────────────────────────────────────────────
	const [paymentMethod, setPaymentMethod] = useState<
		"manual_transfer" | "cash" | "card" | "fpx" | "stripe"
	>("manual_transfer");
	const [notes, setNotes] = useState("");
	const [nextIntervalDays, setNextIntervalDays] = useState("");
	const [unlockReason, setUnlockReason] = useState("");
	const [adjustUnlocked, setAdjustUnlocked] = useState("");
	const [adjustUsed, setAdjustUsed] = useState("");
	const [adjustReason, setAdjustReason] = useState("");

	// ── Data queries ─────────────────────────────────────────────────────────────

	const { data: plans } = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async (): Promise<InstallmentPlan[]> => {
			if (!organizationId) return [];
			return client.installmentPlans.list({
				organizationId,
				activeOnly: true,
			});
		},
		enabled: !!organizationId,
	});
	const plansMap = useMemo(
		() =>
			new Map<string, { code: string; name: string; numInstallments: number }>(
				(plans ?? []).map((p) => [p.code, p]),
			),
		[plans],
	);

	const { data: overviewData, isLoading } = useQuery({
		queryKey: [
			"installments-overview",
			organizationId,
			statusFilter,
			debouncedSearch,
			dueBefore,
			dueAfter,
			planCode,
		],
		queryFn: async () => {
			if (!organizationId) return { items: [], total: 0 };
			return client.installments.adminOverview({
				organizationId,
				status: statusFilter,
				limit: 50,
				offset: 0,
				search: debouncedSearch || undefined,
				dueBefore: dueBefore ? new Date(dueBefore).toISOString() : undefined,
				dueAfter: dueAfter ? new Date(dueAfter).toISOString() : undefined,
				paymentPlanCode: planCode,
			});
		},
		enabled: !!organizationId,
	});

	const instances: InstallmentOverviewItem[] = overviewData?.items ?? [];

	const { data: installments = [] } = useQuery({
		queryKey: [
			"installments-by-instance",
			organizationId,
			selectedInstance?.id,
		],
		queryFn: async (): Promise<Installment[]> => {
			if (!organizationId || !selectedInstance?.id) return [];
			return client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId: selectedInstance.id,
			});
		},
		enabled: !!organizationId && !!selectedInstance?.id,
	});

	// Fetch suggested refund when the refund dialog opens
	const suggestRefundQuery = useQuery({
		queryKey: ["installments", "suggestRefund", selectedInstance?.id],
		queryFn: (): Promise<SuggestRefundResult> =>
			client.installments.suggestRefund({
				organizationId: userContext?.currentOrganizationId ?? "",
				packageInstanceId: selectedInstance?.id ?? "",
			}),
		enabled:
			showRefundDialog &&
			!!selectedInstance?.id &&
			!!userContext?.currentOrganizationId,
	});

	// Note: refund amount is now managed by RequestRefundDialog via suggestedAmountCents prop

	// ── Form reset helper (hoisted before mutation hook) ─────────────────────────

	function resetConfirmForm() {
		setPaymentMethod("manual_transfer");
		setNotes("");
		setNextIntervalDays("");
	}

	// ── Mutations ────────────────────────────────────────────────────────────────

	/**
	 * Note: installments.processRefund is deprecated in favour of the new refunds
	 * workflow (request → approve → process). The UI now opens RequestRefundDialog
	 * which calls refunds.request to create a Pending row for review.
	 */
	const { confirmPaymentMutation, manualUnlockMutation, adjustCreditsMutation, setOverdraftMutation, rescheduleMutation, waiveMutation, resetOverrideMutation } =
		useInstallmentMutations({
			organizationId,
			selectedInstance,
			setSelectedInstance,
			setConfirmInstallment,
			resetConfirmForm,
			setShowUnlockDialog,
			setUnlockReason,
			setShowAdjustCreditsDialog,
			setAdjustUnlocked,
			setAdjustUsed,
			setAdjustReason,
			setShowOverdraftDialog,
			setOverdraftReason,
			setRescheduleInstallment,
			setWaiveInstallment,
		});

	function openSheet(instance: InstallmentOverviewItem) {
		setSelectedInstance(instance);
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setSelectedInstance(null);
		setShowUnlockDialog(false);
		setShowRefundDialog(false);
		setShowAdjustCreditsDialog(false);
		setShowOverdraftDialog(false);
		setConfirmInstallment(null);
		resetConfirmForm();
		setUnlockReason("");
		setAdjustUnlocked("");
		setAdjustUsed("");
		setAdjustReason("");
		setOverdraftReason("");
	}

	// Handler: open the request-refund dialog when user clicks "Request Refund" in the sheet
	const handleOpenRefundDialog = useCallback(() => {
		setShowRefundDialog(true);
	}, []);

	// ── Active filter count ───────────────────────────────────────────────────────

	const activeFilterCount = [searchQuery, dueBefore, dueAfter, planCode].filter(Boolean).length;

	// ── Guard ─────────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-60 items-center justify-center text-muted-foreground">
				Select an organization to view installment packages.
			</div>
		);
	}

	// ── Render ────────────────────────────────────────────────────────────────────

	return (
		<>
			<InstallmentsTable
				instances={instances}
				isLoading={isLoading}
				plansMap={plansMap}
				plans={plans}
				statusFilter={statusFilter}
				setStatusFilter={setStatusFilter}
				showFilters={showFilters}
				setShowFilters={setShowFilters}
				searchQuery={searchQuery}
				setSearchQuery={setSearchQuery}
				dueBefore={dueBefore}
				setDueBefore={setDueBefore}
				dueAfter={dueAfter}
				setDueAfter={setDueAfter}
				planCode={planCode}
				setPlanCode={setPlanCode}
				activeFilterCount={activeFilterCount}
				onRowClick={openSheet}
			/>

			<PackageDetailDialog
				open={sheetOpen}
				selectedInstance={selectedInstance}
				installments={installments}
				onClose={closeSheet}
				onConfirmInstallment={setConfirmInstallment}
				onReschedule={setRescheduleInstallment}
				onWaive={setWaiveInstallment}
				onOpenUnlockDialog={() => setShowUnlockDialog(true)}
				onOpenOverdraftDialog={() => setShowOverdraftDialog(true)}
				onOpenAdjustCreditsDialog={() => {
					setAdjustUnlocked(String(selectedInstance?.creditsUnlocked ?? selectedInstance?.creditsTotal ?? 0));
					setAdjustUsed(String(selectedInstance?.creditsUsed ?? 0));
					setShowAdjustCreditsDialog(true);
				}}
				onOpenRefundDialog={handleOpenRefundDialog}
			/>

			<ConfirmPaymentDialog
				confirmInstallment={confirmInstallment}
				selectedInstance={selectedInstance}
				paymentMethod={paymentMethod}
				setPaymentMethod={setPaymentMethod}
				notes={notes}
				setNotes={setNotes}
				nextIntervalDays={nextIntervalDays}
				setNextIntervalDays={setNextIntervalDays}
				onClose={() => {
					setConfirmInstallment(null);
					resetConfirmForm();
				}}
				confirmPaymentMutation={confirmPaymentMutation}
			/>

			<ManualUnlockDialog
				open={showUnlockDialog}
				selectedInstance={selectedInstance}
				unlockReason={unlockReason}
				setUnlockReason={setUnlockReason}
				onClose={() => {
					setShowUnlockDialog(false);
					setUnlockReason("");
				}}
				manualUnlockMutation={manualUnlockMutation}
			/>

			<AdjustCreditsDialog
				open={showAdjustCreditsDialog}
				selectedInstance={selectedInstance}
				adjustUnlocked={adjustUnlocked}
				setAdjustUnlocked={setAdjustUnlocked}
				adjustUsed={adjustUsed}
				setAdjustUsed={setAdjustUsed}
				adjustReason={adjustReason}
				setAdjustReason={setAdjustReason}
				onClose={() => {
					setShowAdjustCreditsDialog(false);
					setAdjustUnlocked("");
					setAdjustUsed("");
					setAdjustReason("");
				}}
				adjustCreditsMutation={adjustCreditsMutation}
				resetOverrideMutation={resetOverrideMutation}
			/>

			<OverdraftDialog
				open={showOverdraftDialog}
				selectedInstance={selectedInstance}
				organizationId={organizationId ?? ""}
				overdraftReason={overdraftReason}
				setOverdraftReason={setOverdraftReason}
				onClose={() => {
					setShowOverdraftDialog(false);
					setOverdraftReason("");
				}}
				setOverdraftMutation={setOverdraftMutation}
			/>

			{/* ── Request Refund Dialog (replaces deprecated installments.processRefund UI) ── */}
			{organizationId && selectedInstance && (
				<RequestRefundDialog
					open={showRefundDialog}
					onOpenChange={setShowRefundDialog}
					organizationId={organizationId}
					packageInstanceId={selectedInstance.id}
					suggestedAmountCents={
						suggestRefundQuery.data?.suggestedRefund ?? undefined
					}
				/>
			)}

			<RescheduleDialog
				rescheduleInstallment={rescheduleInstallment}
				onClose={() => setRescheduleInstallment(null)}
				rescheduleMutation={rescheduleMutation}
			/>

			<WaiveDialog
				waiveInstallment={waiveInstallment}
				onClose={() => setWaiveInstallment(null)}
				waiveMutation={waiveMutation}
			/>

		</>
	);
}
