import { createFileRoute } from "@tanstack/react-router";
import { CommissionCyclesPage } from "@/components/pages/settings/commission-cycles/CommissionCyclesPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/commission-cycles",
)({
	component: CommissionCyclesPage,
});
