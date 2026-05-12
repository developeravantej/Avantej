import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RegisteredCustomersPage } from "@/components/pages/customers/registered-page";

const customersSearchSchema = z.object({
	customerId: z.string().optional(),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/view",
)({
	component: CustomersPage,
	validateSearch: customersSearchSchema,
});

function CustomersPage() {
	const { customerId } = Route.useSearch();
	return <RegisteredCustomersPage initialCustomerId={customerId} />;
}
