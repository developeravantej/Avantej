import { createFileRoute } from "@tanstack/react-router";
import { InvoicePrintPage } from "@/components/pages/payment/print/invoice-print-page";

export const Route = createFileRoute("/_print/print/invoice/$id")({
	component: InvoicePrintRoute,
});

function InvoicePrintRoute() {
	const { id } = Route.useParams();
	return <InvoicePrintPage invoiceId={id} />;
}
