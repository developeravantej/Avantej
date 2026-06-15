import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ClassSlotRow, EditFormState } from "./types";

interface Member {
	id: string;
	name: string;
}

interface EditClassSlotDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editingSlot: ClassSlotRow | null;
	membersData: Member[];
	editForm: EditFormState;
	setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
	isPending: boolean;
	onSubmit: (id: string, form: EditFormState) => void;
}

export function EditClassSlotDialog({
	open,
	onOpenChange,
	editingSlot,
	membersData,
	editForm,
	setEditForm,
	isPending,
	onSubmit,
}: EditClassSlotDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Edit Class Slot</DialogTitle>
					<DialogDescription>
						Update the details for this class slot.
					</DialogDescription>
				</DialogHeader>

				<Separator className="my-4" />

				<div className="space-y-4 px-1">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-start">Start Time</Label>
						<Input
							id="edit-start"
							type="time"
							value={editForm.startTime}
							onChange={(e) =>
								setEditForm((prev) => ({
									...prev,
									startTime: e.target.value,
								}))
							}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-end">End Time</Label>
						<Input
							id="edit-end"
							type="time"
							value={editForm.endTime}
							onChange={(e) =>
								setEditForm((prev) => ({
									...prev,
									endTime: e.target.value,
								}))
							}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-capacity">Capacity</Label>
						<Input
							id="edit-capacity"
							type="number"
							min={1}
							value={editForm.capacity}
							onChange={(e) =>
								setEditForm((prev) => ({
									...prev,
									capacity: e.target.value,
								}))
							}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-instructor">Instructor</Label>
						<Select
							value={editForm.instructorId}
							onValueChange={(v) =>
								setEditForm((prev) => ({ ...prev, instructorId: v }))
							}
						>
							<SelectTrigger id="edit-instructor" className="w-full">
								<SelectValue placeholder="None" />
							</SelectTrigger>
							<SelectContent>
								{membersData.map((m) => (
									<SelectItem key={m.id} value={m.id}>
										{m.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-location">Location</Label>
						<Input
							id="edit-location"
							type="text"
							placeholder="e.g. Studio A"
							value={editForm.location}
							onChange={(e) =>
								setEditForm((prev) => ({
									...prev,
									location: e.target.value,
								}))
							}
						/>
					</div>
				</div>

				<DialogFooter className="mt-6">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							if (editingSlot) {
								onSubmit(editingSlot.id, editForm);
							}
						}}
						disabled={isPending || !editingSlot}
					>
						{isPending ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
