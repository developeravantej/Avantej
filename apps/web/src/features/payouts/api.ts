import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, queryClient } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const payoutKeys = {
	all: (orgId: string) => ["payouts", orgId] as const,
	list: (orgId: string) => ["payouts", orgId, "list"] as const,
	preview: (orgId: string, params: PreviewBatchParams) =>
		["payouts", orgId, "preview", params] as const,
	recipientSummary: (orgId: string, recipientId: string) =>
		["payouts", orgId, "recipientSummary", recipientId] as const,
};

export const commissionKeys = {
	liability: (orgId: string, filters?: Record<string, unknown>) =>
		["commissionLiability", orgId, filters] as const,
};

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

export function usePayoutsList(organizationId: string | null) {
	return useQuery({
		queryKey: payoutKeys.list(organizationId ?? ""),
		queryFn: () =>
			client.payouts.list({
				organizationId: organizationId ?? "",
				limit: 100,
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
		queryKey: commissionKeys.liability(organizationId ?? "", { from, to }),
		queryFn: () =>
			client.commissionSplits.liabilitySummary({
				organizationId: organizationId ?? "",
				from,
				to,
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
		queryKey: payoutKeys.preview(organizationId ?? "", params),
		queryFn: () =>
			client.payouts.previewBatch({
				organizationId: organizationId ?? "",
				staffIds: params.staffIds,
				periodStart: new Date(params.periodStart),
				periodEnd: new Date(params.periodEnd),
				branchId: params.branchId,
			}) as Promise<PreviewBatchResult>,
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
		queryKey: payoutKeys.recipientSummary(
			organizationId ?? "",
			recipientId ?? "",
		),
		queryFn: () =>
			client.payouts.recipientSummary({
				organizationId: organizationId ?? "",
				recipientId: recipientId ?? "",
			}) as Promise<RecipientSummaryResult>,
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
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
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
			queryClient.invalidateQueries({ queryKey: payoutKeys.all(organizationId) });
			queryClient.invalidateQueries({ queryKey: ["commissionLiability"] });
		},
	});
}

export function invalidatePayouts(organizationId: string) {
	queryClient.invalidateQueries({ queryKey: payoutKeys.all(organizationId) });
	queryClient.invalidateQueries({ queryKey: ["commissionLiability"] });
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
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
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
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
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
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
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
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
		],
	});
}

// ---------------------------------------------------------------------------
// Partner Stripe Connect — S-partner-stripe-onboarding (PR #32)
// ---------------------------------------------------------------------------

export const partnerStripeKeys = {
	status: (orgId: string, partnerId: string) =>
		["partnerStripe", orgId, "status", partnerId] as const,
};

export type PartnerStripeStatus = {
	partnerId: string;
	stripeAccountId: string | null;
	connectStatus: string;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	onboardingCompletedAt: Date | null;
	countryCode: string | null;
	defaultCurrency: string | null;
	requirementsCurrentlyDue: string[];
	requirementsDisabledReason: string | null;
	connectAccountUpdatedAt: Date | null;
};

/** Read the cached partner_stripe_accounts row for one staff member. */
export function usePartnerStripeStatus(
	organizationId: string | null,
	partnerId: string | null,
) {
	return useQuery<PartnerStripeStatus>({
		queryKey: partnerStripeKeys.status(organizationId ?? "", partnerId ?? ""),
		queryFn: () =>
			client.partnerStripe.getStatus({
				organizationId: organizationId ?? "",
				partnerId: partnerId ?? "",
			}) as unknown as Promise<PartnerStripeStatus>,
		enabled: !!organizationId && !!partnerId,
		staleTime: 30_000,
	});
}

export type CreateOnboardingUrlParams = {
	organizationId: string;
	partnerId: string;
	countryCode?: string;
};

/** Build a Stripe Connect OAuth URL + redirect to it so the operator
 * completes Stripe-hosted onboarding under their own login. */
export function useCreatePartnerOnboardingUrl(organizationId: string) {
	return useApiMutation<{ onboardingUrl: string; partnerId: string }, CreateOnboardingUrlParams>({
		mutationFn: (params) =>
			client.partnerStripe.createOnboardingUrl({
				organizationId: params.organizationId,
				partnerId: params.partnerId,
				countryCode: params.countryCode,
			}),
		errorMessage: (err) => err.message || "Failed to start Stripe onboarding.",
		invalidate: [],
		onSuccess: (result) => {
			if (typeof window !== "undefined") {
				window.location.assign(result.onboardingUrl);
			}
		},
	});
}

/** Re-pull capability state from Stripe. */
export function useRefreshPartnerStripe(organizationId: string) {
	return useApiMutation<
		{ status: string; payoutsEnabled: boolean; detailsSubmitted: boolean },
		{ organizationId: string; partnerId: string }
	>({
		mutationFn: (params) =>
			client.partnerStripe.refresh({
				organizationId: params.organizationId,
				partnerId: params.partnerId,
			}),
		successMessage: "Stripe Connect status refreshed.",
		errorMessage: (err) => err.message || "Failed to refresh from Stripe.",
		invalidate: [["partnerStripe", organizationId]],
	});
}

export type ConfirmViaStripeParams = {
	organizationId: string;
	payoutId: string;
};

/** Fire `stripe.transfers.create` for a pending stripe_connect payout.
 * Idempotent via `confirm-payout:<id>` key on Stripe's side. */
export function useConfirmPayoutViaStripe(organizationId: string) {
	return useApiMutation<
		{ payoutId: string; stripeTransferId: string; status: "paid" },
		ConfirmViaStripeParams
	>({
		mutationFn: (params) =>
			client.partnerStripe.confirmViaStripe({
				organizationId: params.organizationId,
				payoutId: params.payoutId,
			}),
		successMessage: (result) => `Stripe transfer ${result.stripeTransferId} created.`,
		errorMessage: (err) => err.message || "Failed to confirm via Stripe.",
		invalidate: [
			payoutKeys.list(organizationId),
			commissionKeys.liability(organizationId, {}),
			["commissions"],
			["commissionLiability"],
		],
	});
}
