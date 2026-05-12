import { client } from "@/utils/orpc";

// ── Inferred types ─────────────────────────────────────────────────────────────

export type InstallmentOverviewItem = Awaited<
	ReturnType<typeof client.installments.adminOverview>
>["items"][number];

export type InstallmentPlan = Awaited<
	ReturnType<typeof client.installmentPlans.list>
>[number];

export type Installment = Awaited<
	ReturnType<typeof client.installments.listByPackageInstance>
>[number];

export type SuggestRefundResult = Awaited<
	ReturnType<typeof client.installments.suggestRefund>
>;
