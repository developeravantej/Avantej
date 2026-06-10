import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { PosWorkflow } from "@/components/pos/pos-workflow";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/create",
)({
	beforeLoad: async () => {
		await requirePermission("pos:create");
	},
	validateSearch: z.object({
		customer: z.string().min(1).optional().catch(undefined),
	}),
	component: PosCreatePage,
});

function PosCreatePage() {
	const { customer } = Route.useSearch();
	return (
		<div className="-m-6 flex h-screen flex-col overflow-hidden">
			<PosWorkflow prefillCustomerId={customer} />
		</div>
	);
}
