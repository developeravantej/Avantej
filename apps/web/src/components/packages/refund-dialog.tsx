import { useQuery } from "@tanstack/react-query";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { client } from "@/utils/orpc";
import type { InstallmentOverviewItem, SuggestRefundResult } from "./installment-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface RefundDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	packageInstance: InstallmentOverviewItem | null;
	organizationId: string;
	/** Called after the refund request is submitted (caller handles cache invalidation). */
	onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RefundDialog({
	open,
	onOpenChange,
	packageInstance,
	organizationId,
	onSuccess: _onSuccess,
}: RefundDialogProps) {
	// Fetch suggested refund amount when the dialog is open
	const suggestRefundQuery = useQuery({
		queryKey: [
			"installments",
			"suggestRefund",
			packageInstance?.id,
		],
		queryFn: (): Promise<SuggestRefundResult> =>
			client.installments.suggestRefund({
				organizationId,
				packageInstanceId: packageInstance?.id ?? "",
			}),
		enabled: open && !!packageInstance?.id && !!organizationId,
	});

	if (!organizationId || !packageInstance) return null;

	return (
		<RequestRefundDialog
			open={open}
			onOpenChange={onOpenChange}
			organizationId={organizationId}
			packageInstanceId={packageInstance.id}
			suggestedAmountCents={
				suggestRefundQuery.data?.suggestedRefund ?? undefined
			}
		/>
	);
}
