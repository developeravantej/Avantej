import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc, queryClient } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Types (mirroring the service layer to avoid cross-package import in web app)
// ---------------------------------------------------------------------------

export type PayoutListItem = {
	id: string;
	recipientId: string;
	recipientName: string;
	amount: number; // net cents — may be negative for reversals
	grossAmountCents: number; // gross before deductions
	deductionsCents: number; // deductions applied
	status: string;
	paidAt: Date | null;
	appointmentId: string | null;
	createdAt: Date;
	batchId: string | null;
	description: string | null; // reference / note stored in description column
	paymentMethod?: string; // payment method used (bank_transfer, cash, etc.)
	// Extended fields from batch payouts (may be absent on legacy rows)
	reference?: string;
	periodStart?: Date | string | null;
	periodEnd?: Date | string | null;
};

export type RecipientSummaryResult = {
	lifetimePaidCents: number;
	avgPerCycleCents: number;
	lastPayoutAt: Date | null;
};

export type PreviewBatchParams = {
	staffIds: string[];
	periodStart: string; // ISO
	periodEnd: string; // ISO
	branchId?: string;
};

export type PreviewStaffEntry = {
	staffId: string;
	staffName: string;
	count: number;
	totalCents: number;
};

export type PreviewBatchResult = {
	count: number;
	totalAmountCents: number;
	truncated: boolean;
	byStaff: PreviewStaffEntry[];
	splits: Array<{
		id: string;
		staffId: string;
		calculatedAmount: number;
		earnedAt: Date | null;
		source: "appointment" | "sales_order" | "package_instance" | "other";
	}>;
};

export type RunBatchParams = {
	organizationId: string;
	staffIds: string[];
	periodStart: string; // ISO — converted to Date before send
	periodEnd: string; // ISO — converted to Date before send
	branchId?: string;
	paymentMethod: "bank_transfer" | "cash" | "check" | "other";
	reference?: string;
	// F-PAY-10: forward confirmImmediately so bank-transfer batches can stay in pending/processing until explicit confirmation
	confirmImmediately?: boolean;
};

export type RunBatchResult = {
	payoutIds: string[];
	totalAmountCents: number;
	splitCount: number;
};

export type ProcessForRecipientParams = {
	organizationId: string;
	recipientId: string;
	paymentMethod: "bank_transfer" | "cash" | "check" | "other";
	reference?: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePayoutsList(
	organizationId: string | null,
	branchId?: string,
) {
	return useQuery({
		// Tenant scope switcher (Phase 1): `branchId` carries the active scope node
		// (any hierarchy level; undefined at "All"). The server expands it to the
		// accessible subtree, so passing undefined preserves the prior org-wide behavior.
		...orpc.payouts.list.queryOptions({
			input: { organizationId: organizationId ?? "", branchId, limit: 100 },
		}),
		enabled: !!organizationId,
		staleTime: 30_000,
	});
}

export function useLiabilitySummary(
	organizationId: string | null,
	from: string,
	to: string,
) {
	return useQuery({
		...orpc.commissionSplits.liabilitySummary.queryOptions({
			input: { organizationId: organizationId ?? "", from, to },
		}),
		enabled: !!organizationId && !!from && !!to,
		staleTime: 30_000,
	});
}

export function usePreviewBatch(
	organizationId: string | null,
	params: PreviewBatchParams,
	enabled: boolean,
) {
	return useQuery<PreviewBatchResult>({
		...orpc.payouts.previewBatch.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				staffIds: params.staffIds,
				periodStart: new Date(params.periodStart),
				periodEnd: new Date(params.periodEnd),
				branchId: params.branchId,
			},
		}),
		enabled:
			!!organizationId &&
			enabled &&
			params.staffIds.length > 0 &&
			!!params.periodStart &&
			!!params.periodEnd,
		staleTime: 0,
		retry: false,
	});
}

/** Fetch lifetime stats for a single recipient. */
export function useRecipientSummary(
	organizationId: string | null,
	recipientId: string | null,
) {
	return useQuery<RecipientSummaryResult>({
		...orpc.payouts.recipientSummary.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				recipientId: recipientId ?? "",
			},
		}),
		enabled: !!organizationId && !!recipientId,
		staleTime: 30_000,
	});
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useRunBatch(organizationId: string) {
	return useApiMutation<RunBatchResult, RunBatchParams>({
		mutationFn: (params: RunBatchParams) =>
			// F-PAY-10: forward confirmImmediately so bank-transfer batches can stay in pending/processing until explicit confirmation
			client.payouts.runBatch({
				organizationId: params.organizationId,
				staffIds: params.staffIds,
				periodStart: new Date(params.periodStart),
				periodEnd: new Date(params.periodEnd),
				paymentMethod: params.paymentMethod,
				reference: params.reference,
				confirmImmediately: params.confirmImmediately ?? true,
			}) as Promise<RunBatchResult>,
		successMessage: (result) =>
			`${result.payoutIds.length} payout${result.payoutIds.length !== 1 ? "s" : ""} created — ${result.splitCount} splits processed.`,
		invalidate: [
			orpc.payouts.list.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
	});
}

/** Process pending splits for a single recipient (current month). */
export function useProcessForRecipient(organizationId: string) {
	return useMutation({
		mutationFn: (params: ProcessForRecipientParams) =>
			client.payouts.processForRecipient({
				organizationId: params.organizationId,
				recipientId: params.recipientId,
				paymentMethod: params.paymentMethod,
				reference: params.reference,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.payouts.key() });
			queryClient.invalidateQueries({
				queryKey: orpc.commissionSplits.liabilitySummary.key(),
			});
		},
	});
}

export function invalidatePayouts(_organizationId: string) {
	queryClient.invalidateQueries({ queryKey: orpc.payouts.key() });
	queryClient.invalidateQueries({
		queryKey: orpc.commissionSplits.liabilitySummary.key(),
	});
}

// ---------------------------------------------------------------------------
// F-PAY-6: per-row state-machine mutation hooks (gated by commission_payout:process)
// ---------------------------------------------------------------------------

export type MarkPaidParams = {
	organizationId: string;
	id: string;
	paymentReference: string;
};

export type MarkFailedParams = {
	organizationId: string;
	id: string;
	reason: string;
};

export type RetryPayoutParams = {
	organizationId: string;
	id: string;
};

export type CancelPayoutParams = {
	organizationId: string;
	id: string;
	reason: string;
};

export function useMarkPayoutPaid(organizationId: string) {
	return useApiMutation<unknown, MarkPaidParams>({
		mutationFn: (params) =>
			client.payouts.markPaid({
				organizationId: params.organizationId,
				id: params.id,
				paymentReference: params.paymentReference,
			}),
		successMessage: "Payout marked as paid",
		errorMessage: (err) => err.message,
		invalidate: [
			orpc.payouts.list.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
	});
}

export function useMarkPayoutFailed(organizationId: string) {
	return useApiMutation<unknown, MarkFailedParams>({
		mutationFn: (params) =>
			client.payouts.markFailed({
				organizationId: params.organizationId,
				id: params.id,
				reason: params.reason,
			}),
		successMessage: "Payout marked as failed",
		errorMessage: (err) => err.message,
		invalidate: [
			orpc.payouts.list.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
	});
}

export function useRetryPayout(organizationId: string) {
	return useApiMutation<unknown, RetryPayoutParams>({
		mutationFn: (params) =>
			client.payouts.retry({
				organizationId: params.organizationId,
				id: params.id,
			}),
		successMessage: "Payout queued for retry",
		errorMessage: (err) => err.message,
		invalidate: [
			orpc.payouts.list.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
	});
}

export function useCancelPayout(organizationId: string) {
	return useApiMutation<unknown, CancelPayoutParams>({
		mutationFn: (params) =>
			client.payouts.cancel({
				organizationId: params.organizationId,
				id: params.id,
				reason: params.reason,
			}),
		successMessage: "Payout cancelled",
		errorMessage: (err) => err.message,
		invalidate: [
			orpc.payouts.list.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
	});
}
