"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, MoreVertical, Users } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MemberApiItem = Awaited<ReturnType<typeof client.members.list>>[number];
type RoleApiItem = Awaited<ReturnType<typeof client.roles.list>>[number];
type SystemRole = "admin" | "trainer" | "staff" | "client";

const EMPTY_MEMBERS: MemberApiItem[] = [];
const EMPTY_ROLES: RoleApiItem[] = [];

const SYSTEM_ROLES: { value: SystemRole; label: string; description: string }[] =
	[
		{ value: "admin", label: "Admin", description: "Full access to all organization features" },
		{ value: "trainer", label: "Trainer", description: "Can manage appointments and client sessions" },
		{ value: "staff", label: "Staff", description: "General staff with limited access" },
		{ value: "client", label: "Client", description: "End-user/customer access only" },
	];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function initials(name: string) {
	const parts = name.trim().split(/\s+/);
	return parts.length >= 2
		? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
		: name.slice(0, 2).toUpperCase();
}

function formatLastActive(date?: Date | string | null): string {
	if (!date) return "—";
	const d = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / 86_400_000);
	if (diffDays === 0) {
		return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	}
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	return d.toLocaleDateString("en-MY", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
	const map: Record<string, { label: string; cls: string }> = {
		active: { label: "Active", cls: "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]" },
		invited: { label: "Invited", cls: "bg-[#fefce8] text-[#854d0e] border border-[#fde68a]" },
		disabled: { label: "Disabled", cls: "bg-[#f5f5f5] text-[#737373] border border-[#e5e5e5]" },
		inactive: { label: "Inactive", cls: "bg-[#f5f5f5] text-[#737373] border border-[#e5e5e5]" },
	};
	const entry = map[status] ?? map.disabled;
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-semibold leading-snug",
				entry.cls,
			)}
		>
			{entry.label}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Inline select: appearance-none, small, brand-styled
// ---------------------------------------------------------------------------
function InlineSelect({
	value,
	onChange,
	options,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
	placeholder?: string;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="appearance-none rounded-[6px] border border-[#edede4] bg-[#fafafa] px-2.5 py-1 pr-6 text-[12px] font-medium text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a] cursor-pointer"
			style={{
				backgroundImage:
					"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7170' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
				backgroundRepeat: "no-repeat",
				backgroundPosition: "right 8px center",
			}}
		>
			{placeholder && (
				<option value="">{placeholder}</option>
			)}
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
function MemberAvatar({ name, pending }: { name: string; pending?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
				pending
					? "border-2 border-dashed border-[#b0b0a0] bg-[#d9d9ca] text-[#6b7170]"
					: "bg-[#000] text-white",
			)}
		>
			{pending ? "✉" : initials(name)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------
interface InviteDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onInvite: (email: string, role: SystemRole, hierarchyScopeId: string) => Promise<void>;
	hierarchyNodes: { id: string; name: string }[];
	isLoading?: boolean;
}

function InviteDialog({ isOpen, onClose, onInvite, hierarchyNodes, isLoading }: InviteDialogProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<SystemRole>("staff");
	const [scopeId, setScopeId] = useState("");

	const handleSubmit = async () => {
		if (!email.trim()) {
			toast.error("Please enter an email address");
			return;
		}
		await onInvite(email.trim(), role, scopeId);
		setEmail("");
		setRole("staff");
		setScopeId("");
	};

	const handleClose = () => {
		setEmail("");
		setRole("staff");
		setScopeId("");
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Invite Staff</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="invite-email">Email</Label>
						<input
							id="invite-email"
							type="email"
							placeholder="staff@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full rounded-[8px] border border-[#edede4] bg-white px-3 py-[9px] text-[13px] text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-role">Role</Label>
						<Select value={role} onValueChange={(v) => setRole(v as SystemRole)}>
							<SelectTrigger id="invite-role">
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								{SYSTEM_ROLES.map((r) => (
									<SelectItem key={r.value} value={r.value}>
										<span className="font-medium">{r.label}</span>
										<span className="ml-1.5 text-xs text-muted-foreground">
											— {r.description}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{hierarchyNodes.length > 0 && (
						<div className="space-y-1.5">
							<Label htmlFor="invite-branch">Branch (optional)</Label>
							<Select value={scopeId} onValueChange={setScopeId}>
								<SelectTrigger id="invite-branch">
									<SelectValue placeholder="All branches" />
								</SelectTrigger>
								<SelectContent>
									{hierarchyNodes.map((n) => (
										<SelectItem key={n.id} value={n.id}>
											{n.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={isLoading}>
						{isLoading ? "Sending…" : "Send Invitation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Edit member dialog (role + branch)
// ---------------------------------------------------------------------------
interface EditMemberDialogProps {
	member: MemberApiItem | null;
	roles: RoleApiItem[];
	hierarchyNodes: { id: string; name: string }[];
	onSave: (memberId: string, role: SystemRole, hierarchyScopeId: string) => Promise<void>;
	onClose: () => void;
	isLoading?: boolean;
}

function EditMemberDialog({
	member,
	roles,
	hierarchyNodes,
	onSave,
	onClose,
	isLoading,
}: EditMemberDialogProps) {
	const [editRole, setEditRole] = useState<SystemRole>("staff");
	const [editScope, setEditScope] = useState("");

	useEffect(() => {
		if (member) {
			setEditRole((member.role as SystemRole) ?? "staff");
			setEditScope(member.hierarchyScopeId ?? "");
		}
	}, [member]);

	const handleSave = async () => {
		if (!member) return;
		await onSave(member.id, editRole, editScope);
	};

	return (
		<Dialog open={!!member} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit — {member?.name}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label>Role</Label>
						<Select value={editRole} onValueChange={(v) => setEditRole(v as SystemRole)}>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								{SYSTEM_ROLES.map((r) => (
									<SelectItem key={r.value} value={r.value}>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{/* Custom role from roles table */}
					{roles.length > 0 && (
						<div className="space-y-1.5">
							<Label>Custom Role (optional)</Label>
							<Select
								value={member?.roleId ?? "__none__"}
								onValueChange={() => {/* handled on save via editRole */}}
								disabled
							>
								<SelectTrigger>
									<SelectValue placeholder="None — use system role only" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">None</SelectItem>
									{roles.map((r) => (
										<SelectItem key={r.id} value={r.id}>
											{r.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Custom roles are managed on the Roles tab.
							</p>
						</div>
					)}
					<div className="space-y-1.5">
						<Label>Branch / Hierarchy Scope</Label>
						<Select value={editScope} onValueChange={setEditScope}>
							<SelectTrigger>
								<SelectValue placeholder="All branches" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">All branches</SelectItem>
								{hierarchyNodes.map((n) => (
									<SelectItem key={n.id} value={n.id}>
										{n.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isLoading}>
						{isLoading ? "Saving…" : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// KPI Strip
// ---------------------------------------------------------------------------
function KpiStrip({
	total,
	active,
	invited,
}: {
	total: number;
	active: number;
	invited: number;
}) {
	const items = [
		{ label: "Total Members", value: total },
		{ label: "Active", value: active },
		{ label: "Invited", value: invited },
		{ label: "Inactive", value: total - active - invited },
	];
	return (
		<div className="grid grid-cols-4 gap-px border-b border-[#edede4] bg-[#edede4]">
			{items.map((item) => (
				<div key={item.label} className="flex flex-col gap-0.5 bg-white px-6 py-3">
					<span className="font-mono text-2xl font-semibold tabular-nums text-[#0a0a0a]">
						{item.value}
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a8f91]">
						{item.label}
					</span>
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export type MembersViewMode = "cards" | "table";

export interface MembersTabPageProps {
	view?: MembersViewMode;
	onViewChange?: (mode: MembersViewMode) => void;
	onInviteOpen?: () => void;
	showInviteDialog?: boolean;
	onInviteClose?: () => void;
}

export function MembersTabPage({
	onInviteOpen,
	showInviteDialog = false,
	onInviteClose,
}: MembersTabPageProps = {}) {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const currentOrg = userContext?.organizations.find((o) => o.id === organizationId);
	const inviterHierarchyScopeId = currentOrg?.hierarchy.member?.hierarchyScopeId ?? null;

	// ── Data ──────────────────────────────────────────────────────────────────
	const { data: membersApiData = EMPTY_MEMBERS, isLoading: membersLoading } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: (): Promise<MemberApiItem[]> => {
			if (!organizationId) return Promise.resolve([]);
			return client.members.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: rolesApiData = EMPTY_ROLES, isLoading: rolesLoading } = useQuery({
		queryKey: ["roles", organizationId],
		queryFn: (): Promise<RoleApiItem[]> => {
			if (!organizationId) return Promise.resolve([]);
			return client.roles.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: hierarchyData } = useQuery({
		queryKey: ["hierarchy", "nodes", organizationId],
		queryFn: () => {
			if (!organizationId) return Promise.resolve({ nodes: [] });
			return client.hierarchy.listNodes({ organizationId });
		},
		enabled: !!organizationId,
	});

	const isLoading = membersLoading || rolesLoading;

	type HNode = { id: string; name: string; type: string; depth: number; parentId: string | null; address: string | null; picUserId: string | null; createdAt: Date; updatedAt: Date };
	const hierarchyNodes = (hierarchyData?.nodes ?? []) as HNode[];

	// ── Local state ───────────────────────────────────────────────────────────
	const [isSaving, setIsSaving] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [branchFilter, setBranchFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState("all");
	const [editingMember, setEditingMember] = useState<MemberApiItem | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// ── Filtered members ──────────────────────────────────────────────────────
	const filtered = (membersApiData as MemberApiItem[]).filter((m) => {
		const q = searchQuery.toLowerCase();
		const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
		const matchRole = roleFilter === "all" || m.role === roleFilter;
		const matchBranch = branchFilter === "all" || m.hierarchyScopeId === branchFilter;
		const memberStatus = m.status === "active" ? "active" : "inactive";
		const matchStatus = statusFilter === "all" || memberStatus === statusFilter;
		return matchSearch && matchRole && matchBranch && matchStatus;
	});

	// ── KPI counts ────────────────────────────────────────────────────────────
	const totalCount = (membersApiData as MemberApiItem[]).length;
	const activeCount = (membersApiData as MemberApiItem[]).filter((m) => m.status === "active").length;
	const invitedCount = 0; // invitations come from invitations tab

	// ── Checkbox ──────────────────────────────────────────────────────────────
	const allSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
	const someSelected = !allSelected && filtered.some((m) => selectedIds.has(m.id));

	const toggleAll = () => {
		setSelectedIds(
			allSelected
				? new Set()
				: new Set(filtered.map((m) => m.id)),
		);
	};

	const toggleOne = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	};

	// ── Inline role change ────────────────────────────────────────────────────
	const handleInlineRoleChange = async (member: MemberApiItem, newRole: string) => {
		if (!organizationId) return;
		try {
			await client.members.updateRole({
				organizationId,
				memberId: member.id,
				newRole: newRole as SystemRole,
			});
			await queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
			toast.success(`Role updated for ${member.name}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update role");
		}
	};

	// ── Inline branch change ──────────────────────────────────────────────────
	const handleInlineBranchChange = async (member: MemberApiItem, newScopeId: string) => {
		if (!organizationId) return;
		try {
			await client.hierarchy.reassignMember({
				organizationId,
				memberId: member.id,
				newHierarchyScopeId: newScopeId,
			});
			await queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
			toast.success(`Branch updated for ${member.name}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update branch");
		}
	};

	// ── Deactivate / reactivate ───────────────────────────────────────────────
	const handleToggleActive = async (member: MemberApiItem) => {
		if (!organizationId) return;
		setIsSaving(true);
		try {
			if (member.status === "active") {
				await client.members.deactivate({ organizationId, memberId: member.id });
				toast.success(`Deactivated ${member.name}`);
			} else {
				await client.members.reactivate({ organizationId, memberId: member.id });
				toast.success(`Reactivated ${member.name}`);
			}
			await queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update status");
		} finally {
			setIsSaving(false);
		}
	};

	// ── Edit save ─────────────────────────────────────────────────────────────
	const handleEditSave = async (memberId: string, role: SystemRole, hierarchyScopeId: string) => {
		if (!organizationId) return;
		setIsSaving(true);
		try {
			await client.members.updateRole({ organizationId, memberId, newRole: role });
			if (hierarchyScopeId) {
				await client.hierarchy.reassignMember({
					organizationId,
					memberId,
					newHierarchyScopeId: hierarchyScopeId,
				});
			}
			await queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
			toast.success("Member updated");
			setEditingMember(null);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setIsSaving(false);
		}
	};

	// ── Invite ────────────────────────────────────────────────────────────────
	const handleInvite = async (email: string, role: SystemRole, scopeId: string) => {
		if (!organizationId) return;
		const hierarchyScopeId = scopeId || inviterHierarchyScopeId;
		if (!hierarchyScopeId) {
			toast.error("Unable to determine hierarchy scope. Please refresh and try again.");
			return;
		}
		setIsSaving(true);
		try {
			const result = await client.invitations.create({
				organizationId,
				email,
				role,
				hierarchyScopeId,
			});
			try {
				await client.invitations.sendEmail({
					invitation: {
						token: result.invitation.token,
						email: result.invitation.email ?? "",
						role: result.invitation.role ?? "",
					},
					organizationId,
					organizationName: result.organizationName,
					inviterName: result.inviterName,
				});
				toast.success(`Invitation sent to ${email}`);
			} catch {
				toast.warning("Invitation created but email failed to send. Resend from the Invitations tab.", {
					duration: 8000,
				});
			}
			onInviteClose?.();
			await queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create invitation");
		} finally {
			setIsSaving(false);
		}
	};

	// ── Role options for inline select ────────────────────────────────────────
	const roleOptions = SYSTEM_ROLES.map((r) => ({ value: r.value, label: r.label }));

	const branchOptions = hierarchyNodes.map((n) => ({ value: n.id, label: n.name }));

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<>
			{/* KPI strip */}
			<KpiStrip total={totalCount} active={activeCount} invited={invitedCount} />

			{/* Filter row */}
			<div className="flex shrink-0 items-center gap-3 border-b border-[#edede4] bg-white px-6 py-3">
				{/* Search */}
				<div className="relative max-w-xs flex-1">
					<Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a8f91]" />
					<input
						type="text"
						placeholder="Search by name or email…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full rounded-[8px] border border-[#edede4] bg-white py-[9px] pl-8 pr-3 text-[13px] text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
					/>
				</div>

				{/* Role filter */}
				<InlineSelect
					value={roleFilter}
					onChange={setRoleFilter}
					options={[{ value: "all", label: "All roles" }, ...roleOptions]}
				/>

				{/* Branch filter */}
				<InlineSelect
					value={branchFilter}
					onChange={setBranchFilter}
					options={[{ value: "all", label: "All branches" }, ...branchOptions]}
				/>

				{/* Status filter */}
				<InlineSelect
					value={statusFilter}
					onChange={setStatusFilter}
					options={[
						{ value: "all", label: "All statuses" },
						{ value: "active", label: "Active" },
						{ value: "inactive", label: "Inactive" },
					]}
				/>

				<span className="ml-auto font-mono text-[12px] tabular-nums text-[#8a8f91]">
					{filtered.length} member{filtered.length !== 1 ? "s" : ""}
				</span>
			</div>

			{/* Table area */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex items-center justify-center py-20">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-[#edede4] border-t-[#000]" />
					</div>
				) : filtered.length === 0 ? (
					<div className="py-12">
						<EmptyState
							icon={Users}
							title="No members found"
							description={
								searchQuery || roleFilter !== "all" || statusFilter !== "all"
									? "No members match your current filters."
									: "Get started by inviting your first staff member."
							}
							action={
								!searchQuery && roleFilter === "all" && statusFilter === "all"
									? { label: "Invite Staff", onClick: () => onInviteOpen?.() }
									: undefined
							}
							context={searchQuery || roleFilter !== "all" || statusFilter !== "all" ? "search" : undefined}
						/>
					</div>
				) : (
					<table
						style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}
					>
						<thead>
							<tr>
								{/* Checkbox */}
								<th
									style={{
										width: 36,
										padding: "10px 16px",
										background: "#f7f5ee",
										borderBottom: "1px solid #edede4",
										textAlign: "left",
									}}
								>
									<CheckboxCell
										checked={allSelected}
										indeterminate={someSelected}
										onChange={toggleAll}
									/>
								</th>
								{(["Member", "Role", "Branch", "Status", "Last Active", ""] as const).map(
									(col, i) => (
										<th
											key={col || `col-${i}`}
											style={{
												padding: "10px 16px",
												background: "#f7f5ee",
												borderBottom: "1px solid #edede4",
												fontSize: 11,
												fontWeight: 700,
												color: "#8a8f91",
												letterSpacing: "0.06em",
												textTransform: "uppercase",
												textAlign: "left",
												width: col === "" ? 48 : undefined,
											}}
										>
											{col}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{filtered.map((member) => {
								const branchNode = hierarchyNodes.find(
									(n) => n.id === member.hierarchyScopeId,
								);
								const isSelected = selectedIds.has(member.id);
								const isPending = member.status !== "active" && member.status !== "inactive";

								return (
									<tr
										key={member.id}
										style={{ opacity: member.status === "inactive" ? 0.6 : 1 }}
										className="group"
									>
										{/* Checkbox */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<CheckboxCell
												checked={isSelected}
												indeterminate={false}
												onChange={() => toggleOne(member.id)}
											/>
										</td>

										{/* Member */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<div className="flex items-center gap-2.5">
												<MemberAvatar name={member.name} pending={isPending} />
												<div>
													<div className="text-[13px] font-semibold text-[#0a0a0a]">
														{member.name}
													</div>
													<div className="text-[11px] text-[#8a8f91]">{member.email}</div>
												</div>
											</div>
										</td>

										{/* Role — inline select */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<InlineSelect
												value={member.role ?? "staff"}
												onChange={(v) => handleInlineRoleChange(member, v)}
												options={roleOptions}
											/>
										</td>

										{/* Branch — inline select */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<InlineSelect
												value={member.hierarchyScopeId ?? ""}
												onChange={(v) => handleInlineBranchChange(member, v)}
												options={branchOptions}
												placeholder="All branches"
											/>
										</td>

										{/* Status */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<StatusBadge status={member.status ?? "inactive"} />
										</td>

										{/* Last Active */}
										<td style={{ padding: "13px 16px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle" }}>
											<span className="font-mono text-[12px] tabular-nums text-[#6b7170]">
												{formatLastActive(null)}
											</span>
										</td>

										{/* Actions */}
										<td style={{ padding: "13px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "middle", width: 48 }}>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#8a8f91] opacity-0 transition-opacity hover:bg-[#f3f3f3] group-hover:opacity-100"
													>
														<MoreVertical className="h-4 w-4" />
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-44">
													<DropdownMenuItem
														onClick={() => setEditingMember(member)}
														className="cursor-pointer"
													>
														Edit details
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => handleToggleActive(member)}
														className="cursor-pointer text-destructive focus:text-destructive"
													>
														{member.status === "active" ? "Deactivate" : "Activate"}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}

				{/* Table footer */}
				{filtered.length > 0 && (
					<div
						style={{
							padding: "12px 20px",
							borderTop: "1px solid #f3f3f3",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<span className="text-[12px] text-[#8a8f91]">
							Showing {filtered.length} of {totalCount} member{totalCount !== 1 ? "s" : ""}
						</span>
					</div>
				)}
			</div>

			{/* Edit dialog */}
			<EditMemberDialog
				member={editingMember}
				roles={rolesApiData as RoleApiItem[]}
				hierarchyNodes={hierarchyNodes}
				onSave={handleEditSave}
				onClose={() => setEditingMember(null)}
				isLoading={isSaving}
			/>

			{/* Invite dialog (controlled from parent via props) */}
			<InviteDialog
				isOpen={showInviteDialog}
				onClose={() => onInviteClose?.()}
				onInvite={handleInvite}
				hierarchyNodes={hierarchyNodes}
				isLoading={isSaving}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Small checkbox component
// ---------------------------------------------------------------------------
function CheckboxCell({
	checked,
	indeterminate,
	onChange,
}: {
	checked: boolean;
	indeterminate: boolean;
	onChange: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onChange}
			className={cn(
				"flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors",
				checked
					? "border-[#000] bg-[#000]"
					: indeterminate
						? "border-[#000] bg-[#000]"
						: "border-[#d9d9ca] bg-white",
			)}
		>
			{checked && (
				<svg width="10" height="8" fill="none" viewBox="0 0 10 8">
					<path
						d="M1 4l3 3 5-6"
						stroke="#fff"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			{!checked && indeterminate && (
				<svg width="8" height="2" fill="none" viewBox="0 0 8 2">
					<path d="M1 1h6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			)}
		</button>
	);
}
