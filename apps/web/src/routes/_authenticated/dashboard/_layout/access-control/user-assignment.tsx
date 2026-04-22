import { createFileRoute } from "@tanstack/react-router";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { MembersTabPage } from "@/components/pages/access-control/members-tab";
import { InvitationsTabPage } from "@/components/pages/access-control/invitations-tab";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/user-assignment",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "members",
	}),
	component: StaffAccessPage,
});

function StaffAccessPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ConsolidatedTabs
			value={tab}
			onValueChange={(v) => navigate({ search: { tab: v } })}
			tabs={[
				{ id: "members", label: "Members", content: <MembersTabPage /> },
				{ id: "invitations", label: "Invitations", content: <InvitationsTabPage /> },
			]}
		/>
	);
}
