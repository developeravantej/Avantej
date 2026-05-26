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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete {entityName}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete the {entityName.toLowerCase()} &ldquo;
						{itemLabel}&rdquo;? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="destructive" disabled={isMutating} onClick={onConfirm}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
