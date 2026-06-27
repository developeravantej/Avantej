import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { client, orpc } from "@/utils/orpc";

type MemberApiItem = Awaited<ReturnType<typeof client.members.list>>[number];
type RoleApiItem = Awaited<ReturnType<typeof client.roles.list>>[number];
const EMPTY_MEMBERS: MemberApiItem[] = [];
const EMPTY_ROLES: RoleApiItem[] = [];
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { UserForAssignment, RoleResponse } from "@/types/user-assignment";
import { toast } from "sonner";

import { MembersStatsBar } from "./members/MembersStatsBar";
import { MembersFiltersBar } from "./members/MembersFiltersBar";
import { MembersGrid } from "./members/MembersGrid";
import { RoleAssignmentSheet } from "./members/RoleAssignmentSheet";
import { InviteUserDialog } from "./members/InviteUserDialog";
import { EditUserDialog } from "./members/EditUserDialog";
import { MoveBranchDialog } from "./members/MoveBranchDialog";
import type { SystemRole } from "./members/types";

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function MembersTabPage() {
	const isMobile = useIsMobile();
	const { data: userContext } = useUserContext();
	const { scopeNodeId } = useScope();
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
				input: {
					organizationId: organizationId!,
					includeDeleted: showDeleted,
					hierarchyScopeId: scopeNodeId,
				},
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

				<div className="flex items-center gap-3">
					<ScopeSwitcher />
					<Button onClick={() => setShowInviteDialog(true)}>
						<UserPlus className="size-4 mr-2" />
						Invite User
					</Button>
				</div>
			</div>

			{/* Stats */}
			<MembersStatsBar
				totalUsers={users.length}
				activeUsers={getActiveUserCount()}
				usersWithoutRoles={getUsersWithoutRoles()}
				availableRoles={roles.length}
			/>

			{/* Filters */}
			<MembersFiltersBar
				searchQuery={searchQuery}
				roleFilter={roleFilter}
				statusFilter={statusFilter}
				showDeleted={showDeleted}
				selectedCount={selectedCount}
				allSelected={allSelected}
				someSelected={someSelected}
				filteredUsersCount={filteredUsers.length}
				roles={roles}
				onSearchChange={setSearchQuery}
				onRoleFilterChange={setRoleFilter}
				onStatusFilterChange={setStatusFilter}
				onShowDeletedChange={setShowDeleted}
				onSelectAll={handleSelectAll}
			/>

			{/* User Grid */}
			<MembersGrid
				filteredUsers={filteredUsers}
				roles={roles}
				selectedUsers={selectedUsers}
				searchQuery={searchQuery}
				roleFilter={roleFilter}
				statusFilter={statusFilter}
				isMobile={isMobile}
				isSaving={isSaving}
				retryingGhlSyncMemberId={retryingGhlSyncMemberId}
				canMoveBranchFn={canMoveBranch}
				onUserSelect={handleUserSelect}
				onEditRoles={handleEditUserRoles}
				onEditDetails={handleOpenEditUser}
				onMoveBranch={handleOpenMoveBranch}
				onDeactivate={handleDeactivateUser}
				onSoftDelete={handleSoftDeleteUser}
				onRestore={handleRestoreUser}
				onRetryGhlSync={handleRetryGhlSync}
				onInviteClick={() => setShowInviteDialog(true)}
			/>

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
			<EditUserDialog
				editingUserDetails={editingUserDetails}
				editRole={editRole}
				editRoleId={editRoleId}
				editHierarchyScopeId={editHierarchyScopeId}
				roles={roles}
				hierarchyNodes={hierarchyNodes}
				isSaving={isSaving}
				onEditRoleChange={setEditRole}
				onEditRoleIdChange={setEditRoleId}
				onEditHierarchyScopeIdChange={setEditHierarchyScopeId}
				onSave={handleSaveUserDetails}
				onClose={() => setEditingUserDetails(null)}
			/>

			{/* Move to Branch Dialog */}
			<MoveBranchDialog
				movingUser={movingUser}
				moveBranchId={moveBranchId}
				moveCurrentBranchId={moveCurrentBranchId}
				isMovingBranch={isMovingBranch}
				organizationId={organizationId}
				onMoveBranchIdChange={setMoveBranchId}
				onClose={handleCloseMoveBranch}
				onConfirm={handleConfirmMoveBranch}
			/>

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
