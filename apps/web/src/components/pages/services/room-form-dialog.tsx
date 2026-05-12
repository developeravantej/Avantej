import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const TYPE_OPTIONS = [
	{ value: "consultation", label: "Consultation" },
	{ value: "group_session", label: "Group Session" },
	{ value: "private", label: "Private" },
	{ value: "training", label: "Training" },
	{ value: "individual", label: "Individual" },
] as const;

type RoomType = (typeof TYPE_OPTIONS)[number]["value"];

type RoomFormState = {
	name: string;
	type: RoomType | "";
	capacity: string;
	branchId: string;
	isActive: boolean;
};

type Branch = { id: string; name: string; type: string };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editingRoom: boolean;
	form: RoomFormState;
	setForm: Dispatch<SetStateAction<RoomFormState>>;
	branches: Branch[];
	branchCombobox: (props: {
		id: string;
		value: string;
		onChange: (id: string) => void;
		branches: Branch[];
		placeholder: string;
	}) => React.ReactNode;
	onCancel: () => void;
	onSubmit: () => void;
	isBusy: boolean;
};

export function RoomFormDialog({
	open,
	onOpenChange,
	editingRoom,
	form,
	setForm,
	branches,
	branchCombobox,
	onCancel,
	onSubmit,
	isBusy,
}: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{editingRoom ? "Edit Room" : "Create Room"}
					</DialogTitle>
					<DialogDescription>
						{editingRoom
							? "Update the room details below."
							: "Fill in the details to create a new room."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 px-4 py-2">
					<div className="flex flex-col gap-1.5">
						<label htmlFor="room-name" className="text-sm font-medium">
							Name <span className="text-destructive">*</span>
						</label>
						<Input
							id="room-name"
							value={form.name}
							onChange={(e) =>
								setForm((prev) => ({ ...prev, name: e.target.value }))
							}
							placeholder="e.g. Studio A"
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="room-type" className="text-sm font-medium">
							Type <span className="text-destructive">*</span>
						</label>
						<Select
							value={form.type}
							onValueChange={(val) =>
								setForm((prev) => ({ ...prev, type: val as RoomType }))
							}
						>
							<SelectTrigger id="room-type">
								<SelectValue placeholder="Select a type" />
							</SelectTrigger>
							<SelectContent>
								{TYPE_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="room-capacity" className="text-sm font-medium">
							Capacity <span className="text-destructive">*</span>
						</label>
						<Input
							id="room-capacity"
							type="number"
							min={1}
							value={form.capacity}
							onChange={(e) =>
								setForm((prev) => ({ ...prev, capacity: e.target.value }))
							}
							placeholder="e.g. 10"
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="room-branch" className="text-sm font-medium">
							Branch <span className="text-destructive">*</span>
						</label>
						{branches.length === 0 ? (
							<p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
								No branches found. Create a branch first.
							</p>
						) : (
							branchCombobox({
								id: "room-branch",
								value: form.branchId,
								onChange: (id) =>
									setForm((prev) => ({ ...prev, branchId: id })),
								branches,
								placeholder: "Search branch...",
							})
						)}
					</div>

					{editingRoom && (
						<div className="flex items-center gap-3">
							<input
								id="room-active"
								type="checkbox"
								checked={form.isActive}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										isActive: e.target.checked,
									}))
								}
								className="size-4 rounded border-border text-primary focus:ring-primary"
							/>
							<label htmlFor="room-active" className="text-sm font-medium">
								Active
							</label>
						</div>
					)}
				</div>

				<DialogFooter className="px-4">
					<Button variant="outline" onClick={onCancel} disabled={isBusy}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={isBusy}>
						{isBusy
							? editingRoom
								? "Saving..."
								: "Creating..."
							: editingRoom
								? "Save Changes"
								: "Create Room"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
