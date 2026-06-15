import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { AnnouncementsViewPage } from "@/components/pages/announcements/AnnouncementsViewPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/announcements/view",
)({
	beforeLoad: async () => {
		await requirePermission("announcement_management:read");
	},
	component: AnnouncementsViewPage,
});
