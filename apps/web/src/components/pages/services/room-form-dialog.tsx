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
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						SERVICE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{editingRoom ? "Edit Room" : "Create Room"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{editingRoom
							? "Update the room details below."
							: "Fill in the details to create a new room."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<label htmlFor="room-name" className="text-sm font-medium">
								Name <span className="text-rose-600">*</span>
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
								Type <span className="text-rose-600">*</span>
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
								Capacity <span className="text-rose-600">*</span>
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
								Branch <span className="text-rose-600">*</span>
							</label>
							{branches.length === 0 ? (
								<p className="text-sm text-[#737373] border border-dashed rounded-md p-3">
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
									className="size-4 rounded border-[#e5e5e5] text-primary focus:ring-primary"
								/>
								<label htmlFor="room-active" className="text-sm font-medium">
									Active
								</label>
							</div>
						)}
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isBusy}>
						Cancel
					</Button>
					<Button
						onClick={onSubmit}
						disabled={isBusy}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
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
