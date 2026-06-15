import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";

// ─── Delete confirmation dialog ───────────────────────────────────────────────

interface AnnouncementDeleteDialogProps {
	open: boolean;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

export function AnnouncementDeleteDialog({
	open,
	isPending,
	onCancel,
	onConfirm,
}: AnnouncementDeleteDialogProps) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INTERNAL COMMUNICATIONS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Confirm Delete
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Are you sure you want to delete this announcement? This action
						cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Deleting…" : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
