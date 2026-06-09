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
import { BranchCombobox } from "@/components/ui/branch-combobox";
import type { UserForAssignment } from "./types";

interface MoveBranchDialogProps {
	movingUser: UserForAssignment | null;
	moveBranchId: string;
	moveCurrentBranchId: string;
	isMovingBranch: boolean;
	organizationId: string | null;
	onMoveBranchIdChange: (id: string) => void;
	onClose: () => void;
	onConfirm: () => void;
}

export function MoveBranchDialog({
	movingUser,
	moveBranchId,
	moveCurrentBranchId,
	isMovingBranch,
	organizationId,
	onMoveBranchIdChange,
	onClose,
	onConfirm,
}: MoveBranchDialogProps) {
	return (
		<Dialog
			open={!!movingUser}
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
								onChange={onMoveBranchIdChange}
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
					<Button variant="outline" onClick={onClose} disabled={isMovingBranch}>
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
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
	);
}
