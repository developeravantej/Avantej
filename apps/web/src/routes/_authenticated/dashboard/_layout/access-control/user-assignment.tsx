import { createFileRoute } from "@tanstack/react-router";
import { MembersTabPage } from "@/components/pages/access-control/members-tab";
import { InvitationsTabPage } from "@/components/pages/access-control/invitations-tab";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/user-assignment",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "members",
	}),
	component: StaffAccessPage,
});

const TABS = [
	{ id: "members", label: "Members" },
	{ id: "invitations", label: "Invitations" },
];

function StaffAccessPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	const content =
		tab === "invitations" ? <InvitationsTabPage /> : <MembersTabPage />;

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<UserPlus className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Staff Access</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Invite, assign roles, and manage staff access
						</p>
					</div>
				</div>
			</div>

			{/* Tab band */}
			<div className="shrink-0 border-b border-border/40 px-6">
				<div className="flex h-10 items-end gap-0">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`px-4 pb-2 pt-0 text-sm font-medium border-b-2 transition-colors ${
								tab === t.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-hidden">{content}</div>
		</div>
	);
}
