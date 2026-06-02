import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import {
	Plus,
	Search,
	Shield,
	Settings,
	Users,
	Database,
	FileText,
	Trash2,
	X,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { RoleEditor } from "@/components/access-control/editors/RoleEditor";
import { EnhancedPermissionMatrix } from "@/components/access-control/permission-matrix/EnhancedPermissionMatrix";
import type {
	Role,
	PermissionResource,
} from "@/components/access-control/permission-matrix/permission-matrix.types";
import { useRoles } from "@/hooks/useRoles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const RESOURCE_ICON_MAP: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	user_management: Users,
	users: Users,
	role_management: Shield,
	roles: Shield,
	hierarchy_management: Database,
	branches: Settings,
	reports: FileText,
};

export type RolesViewMode = "matrix" | "cards" | "enhanced" | "wizard";

export interface RolesTabPageProps {
	view?: RolesViewMode;
	onViewChange?: (mode: RolesViewMode) => void;
}

export function RolesTabPage({
	onViewChange: _onViewChange,
}: RolesTabPageProps = {}) {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	type PermissionItem = Awaited<
		ReturnType<typeof client.permissions.list>
	>[number];
	type RoleItem = Awaited<ReturnType<typeof client.roles.list>>[number];
	type MemberItem = Awaited<ReturnType<typeof client.members.list>>[number];

	const { data: permissionsData = [] as PermissionItem[] } = useQuery({
		...orpc.permissions.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const { data: rolesApiData = [] as RoleItem[], isLoading: rolesLoading } =
		useQuery({
			...orpc.roles.list.queryOptions({
				input: { organizationId: organizationId! },
			}),
			enabled: !!organizationId,
		});

	const { data: membersData = [] as MemberItem[] } = useQuery({
		...orpc.members.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const resources = useMemo<PermissionResource[]>(() => {
		const grouped = new Map<string, PermissionResource>();
		for (const perm of permissionsData) {
			let res = grouped.get(perm.resource);
			if (!res) {
				res = {
					id: perm.resource,
					name: perm.resource
						.split("_")
						.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(" "),
					description: `${perm.resource
						.split("_")
						.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(" ")} permissions`,
					icon: RESOURCE_ICON_MAP[perm.resource] || Settings,
					actions: [],
				};
				grouped.set(perm.resource, res);
			}
			res.actions.push({
				id: perm.action,
				name: perm.action.charAt(0).toUpperCase() + perm.action.slice(1),
				description: perm.description ?? undefined,
			});
		}
		return Array.from(grouped.values());
	}, [permissionsData]);

	const displayRoles = useMemo<Role[]>(() => {
		return rolesApiData.map((r: RoleItem) => ({
			id: r.id,
			name: r.name,
			description: r.description ?? undefined,
			priority: r.priority,
			permissions: [],
		}));
	}, [rolesApiData]);

	const userCounts = useMemo<Record<string, number>>(() => {
		const counts: Record<string, number> = {};
		for (const member of membersData) {
			const role = member.role;
			if (role) {
				const matched = displayRoles.find(
					(r) => r.name.toLowerCase() === role.toLowerCase(),
				);
				if (matched) {
					counts[matched.id] = (counts[matched.id] ?? 0) + 1;
				}
			}
		}
		return counts;
	}, [membersData, displayRoles]);

	const { createRole, addPermission, removePermission, deleteRole } = useRoles(
		organizationId ?? "",
	);

	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [deleteConfirmRole, setDeleteConfirmRole] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
	const [wizardPermissions] = useState<Record<string, boolean>>({});

	const filteredRoles = displayRoles.filter(
		(role) =>
			role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			role.description?.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	// Auto-select first role when list loads
	const activeRoleId = selectedRoleId ?? filteredRoles[0]?.id ?? null;
	const activeRole =
		displayRoles.find((r: Role) => r.id === activeRoleId) ?? null;
	const activeApiRole =
		rolesApiData.find((r: RoleItem) => r.id === activeRoleId) ?? null;

	const handleDeleteRole = (roleId: string) => {
		const roleItem = rolesApiData.find((r: RoleItem) => r.id === roleId);
		if (!roleItem || roleItem.isSystem) return;
		setDeleteConfirmRole({ id: roleId, name: roleItem.name });
	};

	const confirmDelete = async () => {
		if (!deleteConfirmRole) return;
		try {
			await deleteRole.mutateAsync(deleteConfirmRole.id);
			toast.success(`Role "${deleteConfirmRole.name}" deleted.`);
			if (selectedRoleId === deleteConfirmRole.id) setSelectedRoleId(null);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete role.",
			);
		} finally {
			setDeleteConfirmRole(null);
		}
	};

	const handleSaveRole = async (
		roleData: { name: string; description?: string; priority: number },
		rolePerms: Role["permissions"],
	) => {
		if (!organizationId) {
			toast.error("No organization selected.");
			return;
		}
		try {
			const newRole = await createRole.mutateAsync({
				name: roleData.name,
				description: roleData.description,
				priority: roleData.priority,
			});
			for (const perm of rolePerms) {
				const matched = permissionsData.find(
					(p: PermissionItem) =>
						p.resource === perm.resourceId && p.action === perm.actionId,
				);
				if (!matched) continue;
				await addPermission.mutateAsync({
					roleId: newRole.id,
					permissionId: matched.id,
				});
			}
			toast.success("Role created.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save role");
			return;
		}
		setIsCreating(false);
		setEditingRole(null);
	};

	const handlePermissionChange = async (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
	) => {
		if (!organizationId) return;
		const updateKey = `${roleId}-${resourceId}-${actionId}`;
		const perm = permissionsData.find(
			(p: PermissionItem) => p.resource === resourceId && p.action === actionId,
		);
		if (!perm) {
			toast.error(`Could not find permission for ${actionId} on ${resourceId}`);
			return;
		}
		try {
			setPendingUpdates((prev) => new Set([...prev, updateKey]));
			if (enabled) {
				await addPermission.mutateAsync({ roleId, permissionId: perm.id });
			} else {
				await removePermission.mutateAsync({ roleId, permissionId: perm.id });
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update permission",
			);
		} finally {
			setPendingUpdates((prev) => {
				const s = new Set(prev);
				s.delete(updateKey);
				return s;
			});
		}
	};

	return (
		<div className="flex h-full overflow-hidden">
			{/* ── Left: Role List ─────────────────────────────────────────── */}
			<div className="flex w-[240px] shrink-0 flex-col border-r border-[#edede4]">
				{/* Search + New */}
				<div className="flex items-center gap-2 border-b border-[#edede4] px-3 py-2">
					<div className="flex flex-1 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3] px-2.5 py-1.5">
						<Search className="h-3 w-3 shrink-0 text-[#6b7170]" />
						<input
							className="w-full bg-transparent text-xs outline-none placeholder:text-[#6b7170]"
							placeholder="Search roles…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
					<button
						type="button"
						onClick={() => {
							setEditingRole(null);
							setIsCreating(true);
						}}
						className="flex items-center justify-center rounded-lg bg-[#0a0a0a] p-1.5 text-white hover:opacity-85"
						title="New Role"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>

				{/* Section label */}
				<div className="px-4 pt-2 pb-1">
					<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a8f91]">
						Roles
					</span>
				</div>

				{/* Role items */}
				<div className="flex-1 overflow-y-auto">
					{rolesLoading ? (
						<div className="space-y-1 px-3 py-2">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="h-10 animate-pulse rounded-lg bg-[#f3f3f3]"
								/>
							))}
						</div>
					) : filteredRoles.length === 0 ? (
						<div className="px-4 py-6 text-center text-xs text-[#6b7170]">
							{searchQuery ? "No roles match." : "No roles yet."}
						</div>
					) : (
						filteredRoles.map((role) => {
							const count = userCounts[role.id];
							const isActive = role.id === activeRoleId;
							const isSystem =
								rolesApiData.find((r: RoleItem) => r.id === role.id)
									?.isSystem ?? false;
							return (
								<div
									key={role.id}
									className={cn(
										"group cursor-pointer border-b border-[#edede4] px-4 py-3 last:border-b-0",
										isActive ? "bg-[#f3f3f3]" : "hover:bg-[#fafafa]",
									)}
									onClick={() => setSelectedRoleId(role.id)}
								>
									<div className="flex items-center justify-between">
										<span className="text-sm font-semibold text-[#0a0a0a]">
											{role.name}
										</span>
										<div className="flex items-center gap-1">
											{count !== undefined && (
												<span
													className={cn(
														"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
														isSystem
															? "bg-[#000] text-white"
															: "border border-[#edede4] bg-[#f1efe9] text-[#6b7170]",
													)}
												>
													{count}
												</span>
											)}
											{!isSystem && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteRole(role.id);
													}}
													className="hidden rounded p-0.5 text-[#6b7170] hover:text-red-600 group-hover:flex"
													title="Delete role"
												>
													<Trash2 className="h-3 w-3" />
												</button>
											)}
										</div>
									</div>
									{role.description && (
										<p className="mt-0.5 text-xs text-[#6b7170] line-clamp-1">
											{role.description}
										</p>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* ── Right: Permission Matrix ─────────────────────────────────── */}
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				{activeRole ? (
					<>
						{/* Role header bar */}
						<div className="flex shrink-0 items-center justify-between border-b border-[#edede4] px-5 py-3">
							<div className="flex items-center gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] text-xs font-bold text-white">
									{activeRole.name.charAt(0).toUpperCase()}
								</div>
								<div>
									<div className="text-sm font-semibold text-[#0a0a0a]">
										{activeRole.name}
									</div>
									<div className="text-xs text-[#6b7170]">
										{userCounts[activeRole.id] !== undefined
											? `${userCounts[activeRole.id]} member${userCounts[activeRole.id] !== 1 ? "s" : ""} · `
											: ""}
										{activeRole.description ?? "No description"}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{pendingUpdates.size > 0 && (
									<span className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
										<span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
										{pendingUpdates.size} saving…
									</span>
								)}
								{/* Legend */}
								<div className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3] px-2.5 py-1 text-xs text-[#737373]">
									<span className="inline-block h-2.5 w-2.5 rounded-sm border border-green-300 bg-green-100" />
									Granted
									<span className="ml-2 inline-block h-2.5 w-2.5 rounded-sm border border-[#e5e5e5] bg-[#f3f3f3]" />
									Denied
								</div>
							</div>
						</div>

						{/* Matrix body */}
						<div className="min-h-0 flex-1 overflow-auto">
							<EnhancedPermissionMatrix
								roles={[activeRole]}
								resources={resources}
								onPermissionChange={handlePermissionChange}
								selectedRoles={[activeRole.id]}
								maxVisibleRoles={1}
								hideControls={true}
							/>
						</div>

						{/* Footer */}
						<div className="flex shrink-0 items-center justify-between border-t border-[#edede4] px-5 py-2">
							<div className="flex items-center gap-4 text-xs text-[#737373]">
								<span className="flex items-center gap-1.5">
									<span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-green-400 bg-green-100">
										<svg
											width="8"
											height="8"
											viewBox="0 0 12 12"
											fill="none"
											stroke="#16a34a"
											strokeWidth="2.5"
										>
											<path d="M2 6l3 3 5-5" />
										</svg>
									</span>
									Granted
								</span>
								<span className="flex items-center gap-1.5">
									<span className="inline-block h-3.5 w-3.5 rounded-sm border border-[#d4d4d4] bg-white" />
									Denied
								</span>
							</div>
							<div className="text-xs text-[#737373]">
								{resources.length} resources ·{" "}
								{activeApiRole?.isSystem ? "System role" : "Custom role"}
							</div>
						</div>
					</>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
						<Shield className="h-10 w-10 text-[#d9d9ca]" />
						<div>
							<p className="text-sm font-medium text-[#0a0a0a]">
								{rolesLoading ? "Loading roles…" : "Select a role"}
							</p>
							<p className="mt-1 text-xs text-[#737373]">
								{rolesLoading
									? "Please wait"
									: "Choose a role from the left panel to view its permissions"}
							</p>
						</div>
					</div>
				)}
			</div>

			{/* ── Create Role Dialog ──────────────────────────────────────── */}
			<Dialog
				open={isCreating || !!editingRole}
				onOpenChange={(open) => {
					if (!open) {
						setIsCreating(false);
						setEditingRole(null);
					}
				}}
			>
				<DialogContent
					className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden flex max-h-[85vh] flex-col"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5] shrink-0">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							ROLES & PERMISSIONS
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							{editingRole ? "Edit Role" : "Create New Role"}
						</DialogTitle>
						{!editingRole && (
							<DialogDescription className="text-sm text-[#737373]">
								Create a new role to define what users can access and do in your
								system.
							</DialogDescription>
						)}
					</DialogHeader>
					<div className="px-6 pt-4 pb-2 overflow-y-auto min-h-0 flex-1">
						<RoleEditor
							role={editingRole || undefined}
							resources={resources}
							initialPermissions={
								isCreating
									? Object.entries(wizardPermissions)
											.filter(([, enabled]) => enabled)
											.map(([key]) => {
												const [resourceId, actionId] = key.split(":");
												return { resourceId, actionId, scope: "own" as const };
											})
									: undefined
							}
							onSave={handleSaveRole}
							onCancel={() => {
								setIsCreating(false);
								setEditingRole(null);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			{/* ── Delete Confirm Dialog ────────────────────────────────────── */}
			<Dialog
				open={!!deleteConfirmRole}
				onOpenChange={(open) => {
					if (!open) setDeleteConfirmRole(null);
				}}
			>
				<DialogContent
					className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							ROLES & PERMISSIONS
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Delete role?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This will permanently delete{" "}
							<strong>{deleteConfirmRole?.name}</strong> and remove it from all
							assigned members. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setDeleteConfirmRole(null)}
							disabled={deleteRole.isPending}
							className="rounded-lg border border-[#edede4] px-3 py-2 text-sm font-medium hover:bg-[#f3f3f3] disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={confirmDelete}
							disabled={deleteRole.isPending}
							className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
						>
							{deleteRole.isPending ? "Deleting…" : "Delete Role"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
