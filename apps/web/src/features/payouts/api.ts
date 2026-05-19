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
			client.payouts.runBatch({
				organizationId: params.organizationId,
				staffIds: params.staffIds,
				periodStart: new Date(params.periodStart),
				periodEnd: new Date(params.periodEnd),
				paymentMethod: params.paymentMethod,
				reference: params.reference,
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
