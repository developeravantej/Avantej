import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requirePermission } from "@/lib/route-guards";
import { ReportsIndexPage } from "@/components/pages/reports/ReportsIndexPage";

const reportsSearchSchema = z.object({
	tab: z.string().catch("overview"),
	from: z.string().catch(""),
	to: z.string().catch(""),
	taxBasis: z.enum(["pre_tax", "tax_inclusive"]).catch("tax_inclusive"),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/reports/view",
)({
	beforeLoad: async () => {
		await requirePermission("reports:read");
	},
	validateSearch: reportsSearchSchema,
	component: ReportsIndexPage,
});
