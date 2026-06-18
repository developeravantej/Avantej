import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SYSTEM_ROLES } from "./types";
import type { SystemRole, UserForAssignment, RoleResponse } from "./types";

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

interface EditUserDialogProps {
	editingUserDetails: UserForAssignment | null;
	editRole: SystemRole;
	editRoleId: string;
	editHierarchyScopeId: string;
	roles: RoleResponse[];
	hierarchyNodes: HierarchyNode[];
	isSaving: boolean;
	onEditRoleChange: (role: SystemRole) => void;
	onEditRoleIdChange: (roleId: string) => void;
	onEditHierarchyScopeIdChange: (scopeId: string) => void;
	onSave: () => void;
	onClose: () => void;
}

export function EditUserDialog({
	editingUserDetails,
	editRole,
	editRoleId,
	editHierarchyScopeId,
	roles,
	hierarchyNodes,
	isSaving,
	onEditRoleChange,
	onEditRoleIdChange,
	onEditHierarchyScopeIdChange,
	onSave,
	onClose,
}: EditUserDialogProps) {
	return (
		<Dialog
			open={!!editingUserDetails}
			onOpenChange={(open) => {
				if (!open) onClose();
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
								onValueChange={(value) => onEditRoleChange(value as SystemRole)}
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
									onEditRoleIdChange(value === "__none__" ? "" : value)
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
								grants its specific permissions (in addition to the system role
								above).
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-hierarchy">Hierarchy Scope</Label>
							<Select
								value={editHierarchyScopeId}
								onValueChange={onEditHierarchyScopeIdChange}
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
								Determines which parts of the hierarchy this member can access.
							</p>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button
						onClick={onSave}
						disabled={isSaving}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
