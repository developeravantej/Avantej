import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { InvoiceDocument } from "./invoice-document";
import {
	classifyPrintError,
	PrintPageError,
	PrintPageLoading,
} from "./print-page-states";

export function InvoicePrintPage({ invoiceId }: { invoiceId: string }) {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data, isLoading, error } = useQuery({
		...orpc.invoices.getPrintView.queryOptions({
			input: { organizationId: organizationId!, id: invoiceId },
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
					kind === "not_found"
						? "Invoice not found. It may have been removed."
						: kind === "forbidden"
							? "You don't have access to this invoice — it belongs to a branch outside your scope."
							: "Failed to load the invoice. Please try again."
				}
			/>
		);
	}
	return <InvoiceDocument data={data} />;
}
