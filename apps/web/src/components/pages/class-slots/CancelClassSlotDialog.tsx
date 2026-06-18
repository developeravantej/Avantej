import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import type { ClassSlotRow } from "./types";

interface CancelClassSlotDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cancellingSlot: ClassSlotRow | null;
	cancellationReason: string;
	setCancellationReason: (reason: string) => void;
	isPending: boolean;
	onConfirm: (id: string, reason: string) => void;
}

export function CancelClassSlotDialog({
	open,
	onOpenChange,
	cancellingSlot,
	cancellationReason,
	setCancellationReason,
	isPending,
	onConfirm,
}: CancelClassSlotDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Cancel Class Slot</DialogTitle>
					<DialogDescription>
						{cancellingSlot
							? `Are you sure you want to cancel the class on ${new Date(cancellingSlot.date).toLocaleDateString()} at ${cancellingSlot.startTime}? This action cannot be undone.`
							: "Are you sure you want to cancel this class slot?"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-1.5 py-2">
					<Label htmlFor="cancel-reason">Cancellation reason (optional)</Label>
					<Textarea
						id="cancel-reason"
						placeholder="e.g. Instructor unavailable"
						value={cancellationReason}
						onChange={(e) => setCancellationReason(e.target.value)}
						rows={3}
					/>
				</div>

				<DialogFooter className="gap-2">
					<DialogClose asChild>
						<Button variant="outline">Keep Class</Button>
					</DialogClose>
					<Button
						variant="destructive"
						disabled={isPending}
						onClick={() => {
							if (cancellingSlot) {
								onConfirm(cancellingSlot.id, cancellationReason);
							}
						}}
					>
						{isPending ? "Cancelling..." : "Cancel Class"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
