import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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

const TABS = [
	{ id: "members", label: "Members" },
	{ id: "invitations", label: "Invitations" },
];

function StaffAccessPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [showInvite, setShowInvite] = useState(false);

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			{/* ── Page header ─────────────────────────────────────────────── */}
			<div className="shrink-0 px-6 pt-6 pb-4">
				<div className="mb-4 flex items-end justify-between">
					<div>
						<p className="mb-1 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							ACCESS CONTROL
						</p>
						<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
							Staff Access
						</h1>
						<p className="mt-1 text-sm text-[#737373]">
							Manage roles and branch assignments for your team.
						</p>
					</div>

					{/* Invite Staff button — only meaningful on Members tab */}
					{tab === "members" && (
						<button
							type="button"
							onClick={() => setShowInvite(true)}
							className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
						>
							<svg
								width="14"
								height="14"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth="2.5"
							>
								<path d="M12 5v14M5 12h14" />
							</svg>
							Invite Staff
						</button>
					)}
				</div>

				{/* ── Pill tabs ─────────────────────────────────────────────── */}
				<div className="flex flex-wrap items-center gap-2">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={
								tab === t.id
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
							}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>

			{/* ── Tab content card ──────────────────────────────────────────── */}
			<div className="mx-6 mb-6 flex-1 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<div className="flex h-full min-h-0 flex-col overflow-hidden">
					{tab === "invitations" ? (
						<div className="flex-1 overflow-y-auto p-6">
							<InvitationsTabPage />
						</div>
					) : (
						<MembersTabPage
							onInviteOpen={() => setShowInvite(true)}
							showInviteDialog={showInvite}
							onInviteClose={() => setShowInvite(false)}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
