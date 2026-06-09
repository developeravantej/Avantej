import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ClassSlotsPage } from "@/components/pages/class-slots/class-slots-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/class-slots/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		view: (search.view === "flat" ? "flat" : "grouped") as "grouped" | "flat",
	}),
	beforeLoad: async () => {
		await requirePermission("class_slot_management:read");
	},
	component: ClassSlotsPage,
});
