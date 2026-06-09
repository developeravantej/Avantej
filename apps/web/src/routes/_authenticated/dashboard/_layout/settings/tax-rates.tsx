import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/tax-rates",
)({
	beforeLoad: async () => {
		await requirePermission("tax_configuration:update");
	},
	validateSearch: z.object({
		filter: z.enum(["all", "active", "inactive"]).optional().default("active"),
	}),
});
