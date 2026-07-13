import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import {
	classifyPrintError,
	PrintPageError,
	PrintPageLoading,
} from "./print-page-states";
import { ReceiptDocument } from "./receipt-document";

export function ReceiptPrintPage({ invoiceId }: { invoiceId: string }) {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data, isLoading, error } = useQuery({
		...orpc.receipts.getPrintViewForInvoice.queryOptions({
			input: { organizationId: organizationId!, invoiceId },
		}),
		enabled: !!organizationId,
		staleTime: 30_000,
	});

	if (!organizationId || isLoading) return <PrintPageLoading />;
	if (error || !data) {
		const kind = classifyPrintError(error);
		return (
			<PrintPageError
				message={
					kind === "no_payment"
						? "No completed payment is recorded for this invoice yet, so a receipt can't be issued."
						: kind === "not_found"
							? "Invoice not found. It may have been removed."
							: kind === "forbidden"
								? "You don't have access to this invoice — it belongs to a branch outside your scope."
								: "Failed to load the receipt. Please try again."
				}
			/>
		);
	}
	return <ReceiptDocument data={data} />;
}
