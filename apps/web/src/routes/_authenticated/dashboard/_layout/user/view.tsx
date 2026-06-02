import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApiMutation } from "@/hooks/useApiMutation";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { ChevronUp, ChevronDown, Plus, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/user/view",
)({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	component: UserViewPage,
});

type MemberRole = "admin" | "trainer" | "staff" | "client";
type MemberStatus = "active" | "suspended";

interface MemberRow {
	id: string;
	userId: string;
	role: MemberRole;
	hierarchyScopeId: string;
	status: MemberStatus;
	joinedAt: Date | null;
	name: string | null;
	email: string | null;
}

const ROLE_GROUPS: Array<{
	role: MemberRole;
	label: string;
	pluralLabel: string;
}> = [
	{ role: "admin", label: "Admin", pluralLabel: "Admins" },
	{ role: "trainer", label: "Trainer", pluralLabel: "Trainers" },
	{ role: "staff", label: "Staff", pluralLabel: "Staff" },
	{ role: "client", label: "Client", pluralLabel: "Clients" },
];

// Role badge styles matching V2 design tokens
const ROLE_BADGE_STYLES: Record<MemberRole, string> = {
	admin: "bg-[#0a0a0a] text-white border-transparent",
	trainer: "bg-[#f3f3f3] text-[#0a0a0a] border-[#edede4]",
	staff: "bg-white text-[#0a0a0a] border-[#0a0a0a]",
	client: "bg-[#f3f3f3] text-[#0a0a0a] border-[#edede4]",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
	active: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
	suspended: "bg-[#fef2f2] text-[#991b1b] border-[#fecaca]",
};

function getInitials(name: string | null, email: string | null): string {
	const display = name || email || "?";
	return display
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function getDisplayName(member: MemberRow): string {
	if (member.name && member.name !== "Unknown") return member.name;
	if (member.email && member.email !== "No email") return member.email;
	return "Unknown";
}

function formatJoined(joinedAt: Date | null): string {
	if (!joinedAt) return "";
	const d = new Date(joinedAt);
	return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ─── Impersonation dialog ────────────────────────────────────────────────────
function ImpersonateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const displayName = getDisplayName(member);
	const mutation = useApiMutation({
		mutationFn: () =>
			client.tenantAdmin.impersonateMember({
				targetMemberId: member.id,
				organizationId,
			}),
		errorMessage: (err) =>
			err.message || "Failed to start impersonation session",
		onSuccess: (result) => {
			window.location.href = result.redirectTo;
		},
		onError: () => onClose(),
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Log in as {displayName}?</DialogTitle>
					<DialogDescription>
						You will be impersonating this staff member. This session is audited
						and expires in 1 hour. You can return to your own account at any
						time using the banner that appears at the top of the page.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Starting…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Deactivate dialog ───────────────────────────────────────────────────────
function DeactivateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.deactivate({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} deactivated.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to deactivate.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Deactivate {displayName}?</DialogTitle>
					<DialogDescription>
						This revokes all access immediately. Audit history is preserved. You
						can reactivate them at any time.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Deactivating…" : "Deactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Reactivate dialog ───────────────────────────────────────────────────────
function ReactivateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.reactivate({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} reactivated.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to reactivate.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reactivate {displayName}?</DialogTitle>
					<DialogDescription>
						This will restore their access to the organization. They will be
						able to log in and use the platform again.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Reactivating…" : "Reactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Remove dialog ───────────────────────────────────────────────────────────
function RemoveDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.softDelete({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} removed from organization.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to remove member.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove {displayName}?</DialogTitle>
					<DialogDescription>
						This removes them from the organization. Their data is preserved and
						they can be restored later from Staff Access if needed.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Removing…" : "Remove"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Single employee card row ────────────────────────────────────────────────
function MemberCard({
	member,
	callerIsAdmin,
	organizationId,
}: {
	member: MemberRow;
	callerIsAdmin: boolean;
	organizationId: string;
}) {
	const [impersonateOpen, setImpersonateOpen] = useState(false);
	const [deactivateOpen, setDeactivateOpen] = useState(false);
	const [reactivateOpen, setReactivateOpen] = useState(false);
	const [removeOpen, setRemoveOpen] = useState(false);

	const displayName = getDisplayName(member);
	const initials = getInitials(member.name, member.email);
	const joined = formatJoined(member.joinedAt);
	const isInactive = member.status === "suspended";

	return (
		<>
			<div
				className="flex items-center gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4"
				style={isInactive ? { opacity: 0.6 } : undefined}
			>
				{/* Avatar */}
				<Avatar className="h-10 w-10 flex-shrink-0 bg-[#0a0a0a]">
					<AvatarFallback className="bg-[#0a0a0a] text-white text-xs font-semibold">
						{initials}
					</AvatarFallback>
				</Avatar>

				{/* Name + email */}
				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold text-[#0a0a0a] truncate">
						{displayName}
					</div>
					<div className="text-xs text-[#737373] truncate font-mono tabular-nums">
						{member.email ?? "No email"}
					</div>
				</div>

				{/* Status pill */}
				<span
					className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}
				>
					<span
						className={`h-1.5 w-1.5 rounded-full ${member.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`}
					/>
					{member.status === "active" ? "Active" : "Suspended"}
				</span>

				{/* Joined date */}
				{joined && (
					<div className="text-xs text-[#737373] font-mono tabular-nums whitespace-nowrap">
						Joined {joined}
					</div>
				)}

				{/* Action buttons */}
				{callerIsAdmin && (
					<div className="flex items-center gap-1 ml-2">
						{member.role === "staff" && (
							<button
								type="button"
								onClick={() => setImpersonateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Login as
							</button>
						)}
						{member.status === "active" ? (
							<button
								type="button"
								onClick={() => setDeactivateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Deactivate
							</button>
						) : (
							<button
								type="button"
								onClick={() => setReactivateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Reactivate
							</button>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="rounded-lg px-2 py-1 text-xs font-medium text-[#6b7170] hover:bg-[#f3f3f3] transition-colors"
								>
									···
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => setRemoveOpen(true)}
								>
									Remove from org
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</div>

			{impersonateOpen && (
				<ImpersonateDialog
					member={member}
					organizationId={organizationId}
					open={impersonateOpen}
					onClose={() => setImpersonateOpen(false)}
				/>
			)}
			{deactivateOpen && (
				<DeactivateDialog
					member={member}
					organizationId={organizationId}
					open={deactivateOpen}
					onClose={() => setDeactivateOpen(false)}
				/>
			)}
			{reactivateOpen && (
				<ReactivateDialog
					member={member}
					organizationId={organizationId}
					open={reactivateOpen}
					onClose={() => setReactivateOpen(false)}
				/>
			)}
			{removeOpen && (
				<RemoveDialog
					member={member}
					organizationId={organizationId}
					open={removeOpen}
					onClose={() => setRemoveOpen(false)}
				/>
			)}
		</>
	);
}

// ─── Collapsible role group ──────────────────────────────────────────────────
function RoleGroup({
	roleConfig,
	members,
	callerIsAdmin,
	organizationId,
	defaultOpen = true,
}: {
	roleConfig: (typeof ROLE_GROUPS)[number];
	members: MemberRow[];
	callerIsAdmin: boolean;
	organizationId: string;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const { role, label, pluralLabel } = roleConfig;

	return (
		<div className="border-b border-[#edede4] last:border-b-0">
			{/* Group header */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-3 px-6 py-3.5 hover:bg-[#fafaf8] transition-colors select-none"
			>
				<Badge
					className={`text-[11px] font-semibold border ${ROLE_BADGE_STYLES[role]} px-2 py-0.5 rounded-md`}
				>
					{label}
				</Badge>
				<span className="text-sm font-semibold text-[#0a0a0a]">
					{pluralLabel}
				</span>
				<span className="text-xs text-[#6b7170]">
					{members.length} {members.length === 1 ? "member" : "members"}
				</span>
				{open ? (
					<ChevronUp className="ml-auto h-3.5 w-3.5 text-[#6b7170]" />
				) : (
					<ChevronDown className="ml-auto h-3.5 w-3.5 text-[#6b7170]" />
				)}
			</button>

			{/* Member cards */}
			{open && (
				<div className="px-6 pb-4 grid gap-2">
					{members.map((m) => (
						<MemberCard
							key={m.id}
							member={m}
							callerIsAdmin={callerIsAdmin}
							organizationId={organizationId}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Page ────────────────────────────────────────────────────────────────────
function UserViewPage() {
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
