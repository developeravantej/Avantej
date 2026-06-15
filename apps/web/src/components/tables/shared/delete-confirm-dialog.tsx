import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface DeleteConfirmDialogProps {
	entityName: string;
	itemLabel: string;
	isMutating?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

export function DeleteConfirmDialog({
	entityName,
	itemLabel,
	isMutating,
	onCancel,
	onConfirm,
}: DeleteConfirmDialogProps) {
	return (
		<Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						CONFIRM DELETE
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Delete {entityName}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Are you sure you want to delete the {entityName.toLowerCase()}{" "}
						&ldquo;
						{itemLabel}&rdquo;? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						className="bg-red-600 hover:bg-red-700 text-white"
						disabled={isMutating}
						onClick={onConfirm}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
