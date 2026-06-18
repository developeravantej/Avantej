import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { Plus, Search } from "lucide-react";
import { useState, useMemo } from "react";
import type { MemberRow } from "./types";
import { ROLE_GROUPS } from "./constants";
import { RoleGroup } from "./RoleGroup";

// ─── Page ────────────────────────────────────────────────────────────────────
export function UserViewPage() {
	const { data: userContext, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const callerIsAdmin = hasRole(["admin"]);
	const qc = useQueryClient();

	const [search, setSearch] = useState("");
	const [inviteOpen, setInviteOpen] = useState(false);

	const { data: members = [], isLoading } = useQuery({
		...orpc.members.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const memberRows = members as unknown as MemberRow[];

	const filtered = useMemo(() => {
		if (!search.trim()) return memberRows;
		const q = search.toLowerCase();
		return memberRows.filter(
			(m) =>
				(m.name ?? "").toLowerCase().includes(q) ||
				(m.email ?? "").toLowerCase().includes(q),
		);
	}, [memberRows, search]);

	const grouped = ROLE_GROUPS.map((rg) => ({
		roleConfig: rg,
		members: filtered.filter((m) => m.role === rg.role),
	})).filter((g) => g.members.length > 0);

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-[#737373] text-sm">
				Select an organization to view members.
			</div>
		);
	}

	return (
		<Skeleton name="user-view" loading={isLoading} fallback={<PageLoader />}>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<span className="text-muted-foreground">Users</span>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold">Members</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
							<Search className="h-4 w-4 text-[#737373] flex-shrink-0" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search…"
								className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a] w-40"
							/>
						</div>
						<button
							type="button"
							onClick={() => setInviteOpen(true)}
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
						>
							<Plus className="h-3.5 w-3.5" />
							Invite
						</button>
					</div>
				</header>
				<div className="px-6 py-6">
					{/* Role groups card */}
					<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
						{grouped.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
								<Search className="h-8 w-8 mb-3 opacity-30" />
								<p className="text-sm font-medium text-[#0a0a0a]">
									{search ? "No employees match your search" : "No members yet"}
								</p>
								<p className="text-xs mt-1">
									{search
										? "Try clearing the search or using a different term."
										: "Invite your first team member to get started."}
								</p>
							</div>
						) : (
							grouped.map(({ roleConfig, members: groupMembers }, idx) => (
								<RoleGroup
									// When a search is active, force-remount each group so collapsed
									// groups become visible on filtered results. Without the search
									// suffix, defaultOpen={idx === 0} from initial mount sticks even
									// after the visible groups change (e.g., searching "trainer"
									// while the Trainers group was collapsed = no results visible).
									key={`${roleConfig.role}-${search ? "search" : "browse"}`}
									roleConfig={roleConfig}
									members={groupMembers}
									callerIsAdmin={callerIsAdmin}
									organizationId={organizationId}
									defaultOpen={!!search || idx === 0}
								/>
							))
						)}
					</div>

					{/* Invite dialog */}
					{organizationId && (
						<CreateInvitationDialog
							open={inviteOpen}
							onOpenChange={setInviteOpen}
							organizationId={organizationId}
							onSuccess={() => {
								qc.invalidateQueries(
									orpc.members.list.queryOptions({ input: { organizationId } }),
								);
							}}
						/>
					)}
				</div>
			</div>
		</Skeleton>
	);
}
