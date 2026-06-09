import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { UserCard } from "./UserCard";
import type { UserForAssignment, RoleResponse } from "./types";

interface MembersGridProps {
	filteredUsers: UserForAssignment[];
	roles: RoleResponse[];
	selectedUsers: Set<string>;
	searchQuery: string;
	roleFilter: string;
	statusFilter: string;
	isMobile: boolean;
	isSaving: boolean;
	retryingGhlSyncMemberId: string | null;
	canMoveBranchFn: (userId: string) => boolean;
	onUserSelect: (userId: string, selected: boolean) => void;
	onEditRoles: (user: UserForAssignment) => void;
	onEditDetails: (user: UserForAssignment) => void;
	onMoveBranch: (user: UserForAssignment) => void;
	onDeactivate: (userId: string) => void;
	onSoftDelete: (userId: string) => void;
	onRestore: (userId: string) => void;
	onRetryGhlSync: (userId: string) => void;
	onInviteClick: () => void;
}

export function MembersGrid({
	filteredUsers,
	roles,
	selectedUsers,
	searchQuery,
	roleFilter,
	statusFilter,
	isMobile,
	isSaving,
	retryingGhlSyncMemberId,
	canMoveBranchFn,
	onUserSelect,
	onEditRoles,
	onEditDetails,
	onMoveBranch,
	onDeactivate,
	onSoftDelete,
	onRestore,
	onRetryGhlSync,
	onInviteClick,
}: MembersGridProps) {
	return (
		<>
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
						canMoveBranch={canMoveBranchFn(user.id)}
						onSelect={(selected) => onUserSelect(user.id, selected)}
						onEditRoles={() => onEditRoles(user)}
						onEditDetails={() => onEditDetails(user)}
						onMoveBranch={() => onMoveBranch(user)}
						onDeactivate={() => onDeactivate(user.id)}
						onSoftDelete={() => onSoftDelete(user.id)}
						onRestore={() => onRestore(user.id)}
						onRetryGhlSync={() => onRetryGhlSync(user.id)}
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
									onClick: onInviteClick,
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
		</>
	);
}
