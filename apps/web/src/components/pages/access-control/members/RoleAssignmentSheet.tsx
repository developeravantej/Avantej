import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { SYSTEM_ROLES } from "./types";
import type { SystemRole, UserForAssignment, RoleResponse } from "./types";

interface RoleAssignmentSheetProps {
	user: UserForAssignment | null;
	roles: RoleResponse[];
	onSave: (newRole: SystemRole) => Promise<void>;
	onClose: () => void;
	isOpen: boolean;
	isLoading?: boolean;
}

export function RoleAssignmentSheet({
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
