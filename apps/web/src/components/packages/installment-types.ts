import { client } from "@/utils/orpc";

// ── Inferred types shared across installment components ──────────────────────

export type InstallmentOverviewItem = Awaited<
	ReturnType<typeof client.installments.adminOverview>
>["items"][number];

export type Installment = Awaited<
	ReturnType<typeof client.installments.listByPackageInstance>
>[number];

export type SuggestRefundResult = Awaited<
	ReturnType<typeof client.installments.suggestRefund>
>;
