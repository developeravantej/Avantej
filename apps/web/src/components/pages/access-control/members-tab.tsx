import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

type MemberApiItem = Awaited<ReturnType<typeof client.members.list>>[number];
type RoleApiItem = Awaited<ReturnType<typeof client.roles.list>>[number];
const EMPTY_MEMBERS: MemberApiItem[] = [];
const EMPTY_ROLES: RoleApiItem[] = [];
import {
	Search,
	Users,
	Shield,
	UserPlus,
	MoreVertical,
	Edit,
	Trash2,
	Mail,
	Calendar,
	MoveRight,
	Undo2,
} from "lucide-react";
import { GhlSyncBadge } from "@/components/ghl-sync-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BranchCombobox } from "@/components/ui/branch-combobox";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { UserForAssignment, RoleResponse } from "@/types/user-assignment";
import { toast } from "sonner";

interface UserCardProps {
	user: UserForAssignment;
	roles: RoleResponse[];
	canMoveBranch?: boolean;
	onEditRoles: () => void;
	onEditDetails: () => void;
	onMoveBranch?: () => void;
	onDeactivate: () => void;
	onSoftDelete: () => void;
	onRestore: () => void;
	onRetryGhlSync: () => void;
	onSelect?: (selected: boolean) => void;
	isSelected?: boolean;
	isLoading?: boolean;
	isRetryingGhlSync?: boolean;
}

// react-doctor-disable-next-line react-doctor/no-many-boolean-props -- TODO: refactor to discriminated union (mode: "view" | "edit" | "syncing") once role-editor backlog clears
function UserCard({
	user,
	roles,
	canMoveBranch,
	onEditRoles,
	onEditDetails,
	onMoveBranch,
	onDeactivate,
	onSoftDelete,
	onRestore,
	onRetryGhlSync,
	onSelect,
	isSelected,
	isLoading: _isLoading,
	isRetryingGhlSync,
}: UserCardProps) {
	const userRoles = roles.filter((role) => user.roles.includes(role.id));
	const highestRole = userRoles.reduce(
		(highest, current) =>
			current.priority < highest.priority ? current : highest,
		userRoles[0],
	);

	const formatLastLogin = (dateString?: string) => {
		if (!dateString) return "Never";
		const date = new Date(dateString);
		const now = new Date();
		const diffDays = Math.floor(
			(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	};

	const getPriorityColor = (priority: number) => {
		switch (priority) {
			case 1:
				return "bg-rose-50 text-rose-600 border-rose-200";
			case 2:
				return "bg-amber-100 text-amber-800 border-amber-300";
			case 3:
				return "bg-primary/10 text-primary border-primary/30";
			default:
				return "bg-brand-secondary-3 text-brand-primary-1 border-brand-secondary-3";
		}
	};

	return (
		<Card
			className={cn(
				"transition-all duration-200 hover:shadow-md",
				!user.isActive && "opacity-60",
				isSelected && "ring-2 ring-primary ring-offset-2",
			)}
		>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-start gap-3 flex-1">
						{onSelect && (
							<Checkbox
								checked={isSelected}
								onCheckedChange={onSelect}
								className="mt-1"
							/>
						)}
						<Avatar className="size-10">
							<AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
						</Avatar>
						<div className="space-y-1 flex-1">
							<div className="flex items-center gap-2">
								<CardTitle className="text-base">{user.name}</CardTitle>
								{user.isDeleted ? (
									<Badge
										variant="destructive"
										className="text-xs"
										data-testid="member-deleted-badge"
									>
										Deleted
									</Badge>
								) : (
									!user.isActive && (
										<Badge variant="secondary" className="text-xs">
											Inactive
										</Badge>
									)
								)}
							</div>
							<div className="flex items-center gap-1 text-sm text-[#737373]">
								<Mail className="size-3" />
								<span>{user.email}</span>
							</div>
							{user.department && (
								<div className="text-xs text-[#737373]">
									{user.department} Department
								</div>
							)}
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="size-8 p-0">
								<MoreVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem
								onClick={onEditRoles}
								className="cursor-pointer"
							>
								<Shield className="size-4 mr-2" />
								Edit Roles
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={onEditDetails}
								className="cursor-pointer"
							>
								<Edit className="size-4 mr-2" />
								Edit User
							</DropdownMenuItem>
							{canMoveBranch && onMoveBranch && (
								<DropdownMenuItem
									onClick={onMoveBranch}
									className="cursor-pointer"
									aria-label={`Move ${user.name} to a different branch`}
								>
									<MoveRight className="size-4 mr-2" />
									Move to branch
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={onDeactivate}
								className="cursor-pointer text-rose-600 focus:text-rose-600"
							>
								<Trash2 className="size-4 mr-2" />
								{user.isActive ? "Deactivate" : "Activate"} User
							</DropdownMenuItem>
							{user.isDeleted ? (
								<DropdownMenuItem
									onClick={onRestore}
									className="cursor-pointer"
									data-testid="member-restore-action"
								>
									<Undo2 className="size-4 mr-2" />
									Restore
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={onSoftDelete}
									className="cursor-pointer text-rose-600 focus:text-rose-600"
									data-testid="member-delete-action"
								>
									<Trash2 className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					{highestRole && (
						<Badge
							variant="outline"
							className={cn("text-xs", getPriorityColor(highestRole.priority))}
						>
							{highestRole.name}
						</Badge>
					)}
					{userRoles.length > 1 && (
						<Badge variant="secondary" className="text-xs">
							+{userRoles.length - 1} more
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<span className="text-[#737373]">Last Login</span>
						<div className="flex items-center gap-1">
							<Calendar className="size-3 text-[#737373]" />
							<span>{formatLastLogin(user.lastLogin)}</span>
						</div>
					</div>

					<div className="space-y-1">
						<span className="text-sm font-medium text-[#737373]">
							Assigned Roles
						</span>
						<div className="flex flex-wrap gap-1">
							{userRoles.map((role) => (
								<Badge key={role.id} variant="outline" className="text-xs">
									{role.name}
								</Badge>
							))}
							{userRoles.length === 0 && (
								<span className="text-xs text-[#737373]">
									No roles assigned
								</span>
							)}
						</div>
					</div>

					<div className="flex items-center justify-between text-sm pt-1">
						<span className="text-[#737373]">GHL Sync</span>
						<GhlSyncBadge
							ghlSync={user.ghlSync}
							onRetry={onRetryGhlSync}
							isRetrying={!!isRetryingGhlSync}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

type SystemRole = "admin" | "trainer" | "staff" | "client";

const SYSTEM_ROLES: {
	value: SystemRole;
	label: string;
	description: string;
}[] = [
	{
		value: "admin",
		label: "Admin",
		description: "Full access to all organization features",
	},
	{
		value: "trainer",
		label: "Trainer",
		description: "Can manage appointments and client sessions",
	},
	{
		value: "staff",
		label: "Staff",
		description: "General staff with limited access",
	},
	{
		value: "client",
		label: "Client",
		description: "End-user/customer access only",
	},
];

interface RoleAssignmentSheetProps {
	user: UserForAssignment | null;
	roles: RoleResponse[];
	onSave: (newRole: SystemRole) => Promise<void>;
	onClose: () => void;
	isOpen: boolean;
	isLoading?: boolean;
}

function RoleAssignmentSheet({
	user,
	onSave,
	onClose,
	isOpen,
	isLoading,
}: RoleAssignmentSheetProps) {
	const [selectedRole, setSelectedRole] = useState<SystemRole>("staff");

	const handleSave = async () => {
		try {
			await onSave(selectedRole);
			onClose();
		} catch (error) {
			console.error("Failed to save role:", error);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						ACCESS CONTROL
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Assign Role to {user?.name}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Select a role and branch for this member.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="mt-2 space-y-4">
						<div className="space-y-2">
							<label
								htmlFor="member-system-role"
								className="text-sm font-medium"
							>
								System Role
							</label>
							<Select
								value={selectedRole}
								onValueChange={(value) => setSelectedRole(value as SystemRole)}
							>
								<SelectTrigger id="member-system-role">
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
								<SelectContent>
									{SYSTEM_ROLES.map((role) => (
										<SelectItem key={role.value} value={role.value}>
											<div>
												<div className="font-medium">{role.label}</div>
												<div className="text-xs text-[#737373]">
													{role.description}
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							{SYSTEM_ROLES.map((role) => (
								<Card
									key={role.value}
									className={cn(
										"p-3 cursor-pointer transition-colors",
										selectedRole === role.value &&
											"border-primary bg-primary/5",
									)}
									onClick={() => setSelectedRole(role.value)}
								>
									<div className="flex items-center gap-3">
										<div
											className={cn(
												"size-4 rounded-full border-2 flex-shrink-0",
												selectedRole === role.value
													? "border-primary bg-primary"
													: "border-[#737373]",
											)}
										/>
										<div>
											<div className="font-medium text-sm">{role.label}</div>
											<div className="text-xs text-[#737373]">
												{role.description}
											</div>
										</div>
									</div>
								</Card>
							))}
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={isLoading}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isLoading ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface InviteUserDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onInvite: (email: string, role: SystemRole) => Promise<void>;
	isLoading?: boolean;
}

function InviteUserDialog({
	isOpen,
	onClose,
	onInvite,
	isLoading,
}: InviteUserDialogProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<SystemRole>("staff");

	const handleSubmit = async () => {
		if (!email) {
			toast.error("Please enter an email address");
			return;
		}

		await onInvite(email, role);

		// Reset form
		setEmail("");
		setRole("staff");
	};

	const handleClose = () => {
		setEmail("");
		setRole("staff");
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						ACCESS CONTROL
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Invite User
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Send an invitation email to a new user.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="mt-2 space-y-4">
						<div className="space-y-2">
							<label
								htmlFor="invite-user-email"
								className="text-sm font-medium"
							>
								Email
							</label>
							<Input
								id="invite-user-email"
								type="email"
								placeholder="Enter user email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<label htmlFor="invite-user-role" className="text-sm font-medium">
								Role
							</label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as SystemRole)}
							>
								<SelectTrigger id="invite-user-role">
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
								<SelectContent>
									{SYSTEM_ROLES.map((r) => (
										<SelectItem key={r.value} value={r.value}>
											<div>
												<div className="font-medium">{r.label}</div>
												<div className="text-xs text-[#737373]">
													{r.description}
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isLoading}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isLoading ? "Sending..." : "Send Invitation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function MembersTabPage() {
	const isMobile = useIsMobile();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const currentOrg = userContext?.organizations.find(
		(org) => org.id === organizationId,
	);
	const inviterHierarchyScopeId =
		currentOrg?.hierarchy.member?.hierarchyScopeId ?? null;

	const [showDeleted, setShowDeleted] = useState(false);

	const { data: membersApiData = EMPTY_MEMBERS, isLoading: membersLoading } =
		useQuery({
			...orpc.members.list.queryOptions({
				input: { organizationId: organizationId!, includeDeleted: showDeleted },
			}),
			enabled: !!organizationId,
		});

	const { data: rolesApiData = EMPTY_ROLES, isLoading: rolesLoading } =
		useQuery({
			...orpc.roles.list.queryOptions({
				input: { organizationId: organizationId! },
			}),
			enabled: !!organizationId,
		});

	const { data: hierarchyData } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});
	type HierarchyNode = {
		id: string;
		name: string;
		type: string;
		depth: number;
		parentId: string | null;
		address: string | null;
		picUserId: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	const hierarchyNodes: HierarchyNode[] = (hierarchyData?.nodes ??
		[]) as HierarchyNode[];

	const isLoading = membersLoading || rolesLoading;

	const roles: RoleResponse[] = (rolesApiData as RoleApiItem[]).map((r) => ({
		id: r.id,
		name: r.name,
		description: r.description ?? undefined,
		priority: r.priority,
	}));

	// Derive `users` directly from query data. Previously this used
	// useState + useEffect to mirror the API response, which caused an
	// infinite render loop while the query was loading: the destructuring
	// default `data: membersApiData = []` returns a fresh array each render,
	// the effect's dep `[membersApiData]` therefore changed every render,
	// `setUsers` fired on every render, and React threw "Maximum update
	// depth exceeded".
	const users = useMemo<UserForAssignment[]>(
		() =>
			(membersApiData as MemberApiItem[]).map((m) => ({
				id: m.id,
				name: m.name,
				firstName: m.name.split(" ")[0] ?? m.name,
				lastName: m.name.split(" ").slice(1).join(" ") ?? "",
				email: m.email,
				roles: rolesApiData
					? (rolesApiData as RoleApiItem[]).flatMap((r) =>
							r.name.toLowerCase() === (m.role ?? "").toLowerCase()
								? [r.id]
								: [],
						)
					: [],
				isActive: m.status === "active",
				isDeleted: m.deletedAt != null,
				ghlSync: m.ghlSync ?? null,
			})),
		[membersApiData, rolesApiData],
	);

	const [isSaving, setIsSaving] = useState(false);
	const [retryingGhlSyncMemberId, setRetryingGhlSyncMemberId] = useState<
		string | null
	>(null);

	const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [editingUser, setEditingUser] = useState<UserForAssignment | null>(
		null,
	);
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const [editingUserDetails, setEditingUserDetails] =
		useState<UserForAssignment | null>(null);
	const [editRole, setEditRole] = useState<SystemRole>("staff");
	// Wave 3a Agent 2.1 (Journey J1): tracks selected custom role row id (or "" = none/legacy text only).
	const [editRoleId, setEditRoleId] = useState<string>("");
	const [editHierarchyScopeId, setEditHierarchyScopeId] = useState<string>("");
	const [movingUser, setMovingUser] = useState<UserForAssignment | null>(null);
	const [moveBranchId, setMoveBranchId] = useState<string>("");
	const [moveCurrentBranchId, setMoveCurrentBranchId] = useState<string>("");
	const [isMovingBranch, setIsMovingBranch] = useState(false);

	const filteredUsers = users.filter((user) => {
		const matchesSearch =
			user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
			user.department?.toLowerCase().includes(searchQuery.toLowerCase());

		const matchesRole =
			roleFilter === "all" ||
			user.roles.includes(roleFilter) ||
			(roleFilter === "none" && user.roles.length === 0);

		const matchesStatus =
			statusFilter === "all" ||
			(statusFilter === "active" && user.isActive) ||
			(statusFilter === "inactive" && !user.isActive);

		return matchesSearch && matchesRole && matchesStatus;
	});

	const handleUserSelect = (userId: string, selected: boolean) => {
		setSelectedUsers((prev) => {
			const newSet = new Set(prev);
			if (selected) {
				newSet.add(userId);
			} else {
				newSet.delete(userId);
			}
			return newSet;
		});
	};

	const handleSelectAll = (selected: boolean) => {
		if (selected) {
			setSelectedUsers(new Set(filteredUsers.map((user) => user.id)));
		} else {
			setSelectedUsers(new Set());
		}
	};

	const handleEditUserRoles = (user: UserForAssignment) => {
		setEditingUser(user);
	};

	const handleSaveUserRoles = async (newRole: SystemRole) => {
		if (!editingUser || !organizationId) return;
		setIsSaving(true);
		try {
			await client.members.updateRole({
				organizationId,
				memberId: editingUser.id,
				newRole,
			});
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
			toast.success(`Successfully updated role for ${editingUser.name}`);
			setEditingUser(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update user role",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDeactivateUser = async (userId: string) => {
		if (!organizationId) return;
		const user = users.find((u) => u.id === userId);
		if (!user) return;
		setIsSaving(true);
		try {
			if (user.isActive) {
				await client.members.deactivate({ organizationId, memberId: userId });
				toast.success(`Successfully deactivated ${user.name}`);
			} else {
				await client.members.reactivate({ organizationId, memberId: userId });
				toast.success(`Successfully reactivated ${user.name}`);
			}
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update user status",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleSoftDeleteUser = async (userId: string) => {
		if (!organizationId) return;
		const user = users.find((u) => u.id === userId);
		if (!user) return;
		setIsSaving(true);
		try {
			await client.members.softDelete({ organizationId, memberId: userId });
			toast.success(`${user.name} deleted`);
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete user",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleRestoreUser = async (userId: string) => {
		if (!organizationId) return;
		const user = users.find((u) => u.id === userId);
		if (!user) return;
		setIsSaving(true);
		try {
			await client.members.restore({ organizationId, memberId: userId });
			toast.success(`${user.name} restored`);
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to restore user",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleInviteUser = async (email: string, role: SystemRole) => {
		if (!organizationId) return;
		if (!inviterHierarchyScopeId) {
			toast.error(
				"Unable to determine your hierarchy scope. Please refresh and try again.",
			);
			return;
		}
		setIsSaving(true);
		try {
			const result = await client.invitations.create({
				organizationId,
				email,
				role,
				hierarchyScopeId: inviterHierarchyScopeId,
			});

			try {
				await client.invitations.sendEmail({
					invitation: {
						token: result.invitation.token,
						email: result.invitation.email ?? "",
						role: result.invitation.role,
					},
					organizationId,
					organizationName: result.organizationName,
					inviterName: result.inviterName,
				});
				toast.success(`Invitation sent to ${email}`);
			} catch (emailError) {
				toast.warning(
					"Invitation created but the email failed to send. You can resend it from the invitations page.",
					{ duration: 8000 },
				);
				console.error("Email send failed:", emailError);
			}

			setShowInviteDialog(false);
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch (createError) {
			toast.error(
				createError instanceof Error
					? createError.message
					: "Failed to create invitation",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleRetryGhlSync = async (memberId: string) => {
		if (!organizationId) return;
		setRetryingGhlSyncMemberId(memberId);
		try {
			const result = await client.members.retryGhlSync({
				organizationId,
				memberId,
			});
			const status = result?.ghlSync?.status;
			if (status === "synced") {
				toast.success("GHL sync succeeded");
			} else if (status === "skipped") {
				toast.info(
					`GHL sync skipped${
						result?.ghlSync?.reason ? `: ${result.ghlSync.reason}` : ""
					}`,
				);
			} else {
				toast.error(
					`GHL sync failed${
						result?.ghlSync?.error ? `: ${result.ghlSync.error}` : ""
					}`,
				);
			}
			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to retry GHL sync",
			);
		} finally {
			setRetryingGhlSyncMemberId(null);
		}
	};

	const getMemberRole = (
		userId: string,
	): "admin" | "trainer" | "staff" | "client" | undefined => {
		const memberRaw = (membersApiData as MemberApiItem[]).find(
			(m) => m.id === userId,
		);
		return (memberRaw as { role?: "admin" | "trainer" | "staff" | "client" })
			?.role;
	};

	const canMoveBranch = (userId: string) => {
		const role = getMemberRole(userId);
		return role === "admin" || role === "trainer" || role === "staff";
	};

	const handleOpenMoveBranch = (user: UserForAssignment) => {
		const memberRaw = (membersApiData as MemberApiItem[]).find(
			(m) => m.id === user.id,
		);
		const currentScope =
			(memberRaw as { hierarchyScopeId?: string })?.hierarchyScopeId ?? "";
		setMovingUser(user);
		setMoveCurrentBranchId(currentScope);
		setMoveBranchId(currentScope);
	};

	const handleCloseMoveBranch = () => {
		if (isMovingBranch) return;
		setMovingUser(null);
		setMoveBranchId("");
		setMoveCurrentBranchId("");
	};

	const handleConfirmMoveBranch = async () => {
		if (!movingUser || !organizationId || !moveBranchId) return;
		if (moveBranchId === moveCurrentBranchId) return;
		setIsMovingBranch(true);
		try {
			const result = await client.members.updateScope({
				organizationId,
				memberId: movingUser.id,
				newHierarchyScopeId: moveBranchId,
			});

			const branchName =
				hierarchyNodes.find((n) => n.id === moveBranchId)?.name ?? "branch";
			toast.success(`${movingUser.name} moved to ${branchName}`);

			if (result?.ghlSync?.status === "error") {
				toast.warning(
					`GHL sync failed${
						result.ghlSync.error ? `: ${result.ghlSync.error}` : ""
					}`,
					{ duration: 8000 },
				);
			}

			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
			setMovingUser(null);
			setMoveBranchId("");
			setMoveCurrentBranchId("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to move member",
			);
		} finally {
			setIsMovingBranch(false);
		}
	};

	const handleOpenEditUser = (user: UserForAssignment) => {
		const memberRaw = (membersApiData as MemberApiItem[]).find(
			(m) => m.id === user.id,
		);
		const currentRole = memberRaw?.role as SystemRole | undefined;
		const currentRoleId = memberRaw?.roleId;
		const currentScope = memberRaw?.hierarchyScopeId;
		setEditingUserDetails(user);
		setEditRole(currentRole ?? "staff");
		setEditRoleId(currentRoleId ?? "");
		setEditHierarchyScopeId(currentScope ?? "");
	};

	const handleSaveUserDetails = async () => {
		if (!editingUserDetails || !organizationId) return;
		setIsSaving(true);
		try {
			await client.members.updateRole({
				organizationId,
				memberId: editingUserDetails.id,
				newRole: editRole,
				// Wave 3a Agent 2.1 (Journey J1): pass the selected custom role row id
				// alongside the legacy text role. Empty string == clear FK (null).
				roleId: editRoleId || null,
			});

			if (editHierarchyScopeId) {
				await client.hierarchy.reassignMember({
					organizationId,
					memberId: editingUserDetails.id,
					newHierarchyScopeId: editHierarchyScopeId,
				});
			}

			await queryClient.invalidateQueries(
				orpc.members.list.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
			toast.success(`Updated details for ${editingUserDetails.name}`);
			setEditingUserDetails(null);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update user details",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const selectedCount = selectedUsers.size;
	const allSelected =
		selectedCount === filteredUsers.length && filteredUsers.length > 0;
	const someSelected =
		selectedCount > 0 && selectedCount < filteredUsers.length;

	const getActiveUserCount = () => users.filter((user) => user.isActive).length;
	const getUsersWithoutRoles = () =>
		users.filter((user) => user.roles.length === 0).length;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold font-heading">
						User Role Assignment
					</h1>
					<p className="text-brand-secondary-1">
						Assign roles and permissions to users
					</p>
				</div>

				<Button onClick={() => setShowInviteDialog(true)}>
					<UserPlus className="size-4 mr-2" />
					Invite User
				</Button>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{users.length}</div>
							<div className="text-sm text-[#737373]">Total Users</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{getActiveUserCount()}</div>
							<div className="text-sm text-[#737373]">Active Users</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{getUsersWithoutRoles()}</div>
							<div className="text-sm text-[#737373]">No Roles</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{roles.length}</div>
							<div className="text-sm text-[#737373]">Available Roles</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filters */}
			<Card>
				<CardContent className="py-4">
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
						<div className="relative flex-1 max-w-md">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#737373] size-4" />
							<Input
								placeholder="Search users..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10"
							/>
						</div>

						<div className="flex gap-2">
							<Select value={roleFilter} onValueChange={setRoleFilter}>
								<SelectTrigger className="w-40">
									<SelectValue placeholder="Filter by role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Roles</SelectItem>
									<SelectItem value="none">No Roles</SelectItem>
									{roles.map((role) => (
										<SelectItem key={role.id} value={role.id}>
											{role.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select value={statusFilter} onValueChange={setStatusFilter}>
								<SelectTrigger className="w-32">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Status</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="inactive">Inactive</SelectItem>
								</SelectContent>
							</Select>

							<label
								htmlFor="members-show-deleted"
								className="flex items-center gap-2 text-sm"
							>
								<Checkbox
									id="members-show-deleted"
									checked={showDeleted}
									onCheckedChange={(v) => setShowDeleted(v === true)}
									data-testid="show-deleted-members-toggle"
								/>
								<span>Show deleted</span>
							</label>
						</div>

						{selectedCount > 0 && (
							<div className="flex items-center gap-2">
								<Badge variant="secondary">{selectedCount} selected</Badge>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="sm">
											<MoreVertical className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent>
										<DropdownMenuItem disabled title="Bulk actions coming soon">
											Bulk Assign Role
										</DropdownMenuItem>
										<DropdownMenuItem disabled title="Bulk actions coming soon">
											Bulk Remove Role
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											disabled
											title="Bulk actions coming soon"
											className="text-rose-600"
										>
											Deactivate Selected
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					</div>

					{/* Bulk Selection */}
					{filteredUsers.length > 0 && (
						<div className="flex items-center gap-2 mt-4">
							<Checkbox
								checked={
									allSelected ? true : someSelected ? "indeterminate" : false
								}
								onCheckedChange={handleSelectAll}
							/>
							<span className="text-sm text-[#737373]">
								{allSelected
									? "Deselect all"
									: someSelected
										? `${selectedCount} selected`
										: "Select all"}
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			{/* User Grid */}
			<div
				className={cn(
					"grid gap-4",
					isMobile
						? "grid-cols-1"
						: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
				)}
			>
				{filteredUsers.map((user) => (
					<UserCard
						key={user.id}
						user={user}
						roles={roles}
						isSelected={selectedUsers.has(user.id)}
						canMoveBranch={canMoveBranch(user.id)}
						onSelect={(selected) => handleUserSelect(user.id, selected)}
						onEditRoles={() => handleEditUserRoles(user)}
						onEditDetails={() => handleOpenEditUser(user)}
						onMoveBranch={() => handleOpenMoveBranch(user)}
						onDeactivate={() => handleDeactivateUser(user.id)}
						onSoftDelete={() => handleSoftDeleteUser(user.id)}
						onRestore={() => handleRestoreUser(user.id)}
						onRetryGhlSync={() => handleRetryGhlSync(user.id)}
						isLoading={isSaving}
						isRetryingGhlSync={retryingGhlSyncMemberId === user.id}
					/>
				))}
			</div>

			{filteredUsers.length === 0 && (
				<EmptyState
					icon={Users}
					title="No members found"
					description={
						searchQuery || roleFilter !== "all" || statusFilter !== "all"
							? "No users match your current filters."
							: "Get started by inviting your first user."
					}
					action={
						!searchQuery && roleFilter === "all" && statusFilter === "all"
							? {
									label: "Invite User",
									onClick: () => setShowInviteDialog(true),
								}
							: undefined
					}
					context={
						searchQuery || roleFilter !== "all" || statusFilter !== "all"
							? "search"
							: undefined
					}
				/>
			)}

			{/* Role Assignment Sheet */}
			<RoleAssignmentSheet
				user={editingUser}
				roles={roles}
				onSave={handleSaveUserRoles}
				onClose={() => setEditingUser(null)}
				isOpen={!!editingUser}
				isLoading={isSaving}
			/>

			{/* Invite User Dialog */}
			<InviteUserDialog
				isOpen={showInviteDialog}
				onClose={() => setShowInviteDialog(false)}
				onInvite={handleInviteUser}
				isLoading={isSaving}
			/>

			{/* Edit User Details Dialog */}
			<Dialog
				open={!!editingUserDetails}
				onOpenChange={(open) => {
					if (!open) setEditingUserDetails(null);
				}}
			>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							ACCESS CONTROL
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Edit User: {editingUserDetails?.name}
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Update this user's profile details.
						</DialogDescription>
					</DialogHeader>

					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="space-y-4 py-2">
							<div className="space-y-2">
								<Label htmlFor="edit-role">Role</Label>
								<Select
									value={editRole}
									onValueChange={(value) => setEditRole(value as SystemRole)}
								>
									<SelectTrigger id="edit-role">
										<SelectValue placeholder="Select a role" />
									</SelectTrigger>
									<SelectContent>
										{SYSTEM_ROLES.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												<div>
													<div className="font-medium">{r.label}</div>
													<div className="text-xs text-[#737373]">
														{r.description}
													</div>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Wave 3a Agent 2.1 (Journey J1): custom-role assignment.
								 The legacy "Role" select above sets the text fast-path; this select
								 binds the member to a row in the `roles` table so custom roles
								 (e.g. "Yoga Lead") created on the roles page are actually
								 assignable end-to-end. "None" clears the FK. */}
							<div className="space-y-2">
								<Label htmlFor="edit-custom-role">Custom Role (optional)</Label>
								<Select
									value={editRoleId || "__none__"}
									onValueChange={(value) =>
										setEditRoleId(value === "__none__" ? "" : value)
									}
								>
									<SelectTrigger id="edit-custom-role">
										<SelectValue placeholder="None — use system role only" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">
											<div>
												<div className="font-medium">None</div>
												<div className="text-xs text-[#737373]">
													Use legacy system role only
												</div>
											</div>
										</SelectItem>
										{roles.map((r) => (
											<SelectItem key={r.id} value={r.id}>
												<div>
													<div className="font-medium">{r.name}</div>
													{r.description && (
														<div className="text-xs text-[#737373]">
															{r.description}
														</div>
													)}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-[#737373]">
									Custom roles are managed on the Roles tab. Assigning one here
									grants its specific permissions (in addition to the system
									role above).
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="edit-hierarchy">Hierarchy Scope</Label>
								<Select
									value={editHierarchyScopeId}
									onValueChange={setEditHierarchyScopeId}
								>
									<SelectTrigger id="edit-hierarchy">
										<SelectValue placeholder="Select a location" />
									</SelectTrigger>
									<SelectContent>
										{hierarchyNodes.map((node) => (
											<SelectItem key={node.id} value={node.id}>
												<div>
													<div className="font-medium">{node.name}</div>
													<div className="text-xs text-[#737373] capitalize">
														{node.type}{" "}
														{node.depth > 0 ? `(depth ${node.depth})` : ""}
													</div>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-[#737373]">
									Determines which parts of the hierarchy this member can
									access.
								</p>
							</div>
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => setEditingUserDetails(null)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSaveUserDetails}
							disabled={isSaving}
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						>
							{isSaving ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Move to Branch Dialog */}
			<Dialog
				open={!!movingUser}
				onOpenChange={(open) => {
					if (!open) handleCloseMoveBranch();
				}}
			>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							BRANCH MANAGEMENT
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Move {movingUser?.name ?? "member"} to a different branch
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Select the destination branch for this member.
						</DialogDescription>
					</DialogHeader>

					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="space-y-3 py-2">
							<Label htmlFor="move-branch-picker">Destination branch</Label>
							{organizationId && (
								<BranchCombobox
									organizationId={organizationId}
									value={moveBranchId}
									onChange={setMoveBranchId}
									placeholder="Select branch..."
									disabled={isMovingBranch}
								/>
							)}
							<p className="text-xs text-[#737373]">
								The member will be reassigned to the selected branch. GHL sync
								runs automatically.
							</p>
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={handleCloseMoveBranch}
							disabled={isMovingBranch}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmMoveBranch}
							disabled={
								isMovingBranch ||
								!moveBranchId ||
								moveBranchId === moveCurrentBranchId
							}
							aria-label="Confirm move to branch"
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						>
							{isMovingBranch ? "Moving..." : "Move member"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{isLoading && (
				<div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
					<div className="text-center">
						<div className="animate-spin rounded-full size-8 border-b-2 border-primary mx-auto mb-2" />
						<p className="text-sm text-[#737373]">Loading…</p>
					</div>
				</div>
			)}
		</div>
	);
}
