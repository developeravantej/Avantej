import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ClassSlotsPage } from "@/components/pages/class-slots/class-slots-page";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/class-slots/view",
)({
	validateSearch: z.object({
		view: z.enum(["grouped", "flat"]).catch("grouped"),
	}),
	beforeLoad: async () => {
		await requirePermission("class_slot_management:read");
	},
	component: ClassSlotsPage,
});
