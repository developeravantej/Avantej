import { createFileRoute } from "@tanstack/react-router";
import { ReceiptPrintPage } from "@/components/pages/payment/print/receipt-print-page";

export const Route = createFileRoute("/_print/print/receipt/$invoiceId")({
	component: ReceiptPrintRoute,
});

function ReceiptPrintRoute() {
	const { invoiceId } = Route.useParams();
	return <ReceiptPrintPage invoiceId={invoiceId} />;
}
