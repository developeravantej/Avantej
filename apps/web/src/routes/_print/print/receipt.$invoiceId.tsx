import { createFileRoute } from "@tanstack/react-router";
import { ReceiptPrintPage } from "@/components/pages/payment/print/receipt-print-page";

export const Route = createFileRoute("/_print/print/receipt/$invoiceId")({
	component: () => <ReceiptPrintPage invoiceId={Route.useParams().invoiceId} />,
});
