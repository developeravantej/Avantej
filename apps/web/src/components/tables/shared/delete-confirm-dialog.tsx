import { Button } from "@/components/ui/button";

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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-primary-1/50">
			<div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
				<h3 className="mb-4 text-lg font-semibold text-brand-primary-1">
					Delete {entityName}
				</h3>
				<p className="mb-6 text-brand-secondary-1">
					Are you sure you want to delete the {entityName.toLowerCase()} "
					{itemLabel}"? This action cannot be undone.
				</p>
				<div className="flex justify-end gap-x-3">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="destructive" disabled={isMutating} onClick={onConfirm}>
						Delete
					</Button>
				</div>
			</div>
		</div>
	);
}
