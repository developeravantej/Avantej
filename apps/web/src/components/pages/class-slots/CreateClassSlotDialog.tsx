import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BranchSelector } from "@/components/branch/branch-selector";
import { formatPrice } from "@/lib/money";
import type { CreateFormState } from "./types";

interface Service {
	id: string;
	name: string;
	/** Cents. Shown as a qualifier — services can share a name across price tiers. */
	price?: number | null;
}

interface Member {
	id: string;
	name: string;
}

interface CreateClassSlotDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	services: Service[];
	membersData: Member[];
	createForm: CreateFormState;
	setCreateForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
	isPending: boolean;
	onSubmit: (form: CreateFormState) => void;
}

export function CreateClassSlotDialog({
	open,
	onOpenChange,
	organizationId,
	services,
	membersData,
	createForm,
	setCreateForm,
	isPending,
	onSubmit,
}: CreateClassSlotDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				hideCloseButton
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						CLASS SCHEDULE
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Create Class Slot
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Schedule a new group class slot.
					</DialogDescription>
				</DialogHeader>

				{/* Form body */}
				<div className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[65vh]">
					{/* Service */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-service">
							Service <span className="text-rose-600">*</span>
						</Label>
						<Select
							value={createForm.serviceId}
							onValueChange={(v) =>
								setCreateForm((prev) => ({ ...prev, serviceId: v }))
							}
						>
							<SelectTrigger id="create-service" className="w-full">
								<SelectValue placeholder="Select a service" />
							</SelectTrigger>
							<SelectContent>
								{services.map((svc) => (
									<SelectItem key={svc.id} value={svc.id}>
										{svc.price != null
											? `${svc.name} — ${formatPrice(svc.price, "MYR")}`
											: svc.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Branch */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-branch">
							Branch <span className="text-rose-600">*</span>
						</Label>
						<BranchSelector
							value={createForm.branchId}
							onChange={(v) =>
								setCreateForm((prev) => ({ ...prev, branchId: v }))
							}
							organizationId={organizationId}
							placeholder="Select a branch"
						/>
					</div>

					{/* Date */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-date">
							Date <span className="text-rose-600">*</span>
						</Label>
						<Input
							id="create-date"
							type="date"
							value={createForm.date}
							onChange={(e) =>
								setCreateForm((prev) => ({ ...prev, date: e.target.value }))
							}
						/>
					</div>

					{/* Start + End Time side by side */}
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-start">
								Start Time <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="create-start"
								type="time"
								value={createForm.startTime}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										startTime: e.target.value,
									}))
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-end">
								End Time <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="create-end"
								type="time"
								value={createForm.endTime}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										endTime: e.target.value,
									}))
								}
							/>
						</div>
					</div>

					{/* Capacity */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-capacity">
							Capacity <span className="text-rose-600">*</span>
						</Label>
						<Input
							id="create-capacity"
							type="number"
							min={1}
							value={createForm.capacity}
							onChange={(e) =>
								setCreateForm((prev) => ({
									...prev,
									capacity: e.target.value,
								}))
							}
						/>
					</div>

					{/* Instructor */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-instructor">
							Instructor{" "}
							<span className="text-[#737373] font-normal text-xs">
								(optional)
							</span>
						</Label>
						<Select
							value={createForm.instructorId}
							onValueChange={(v) =>
								setCreateForm((prev) => ({ ...prev, instructorId: v }))
							}
						>
							<SelectTrigger id="create-instructor" className="w-full">
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

					{/* Location */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="create-location">
							Location{" "}
							<span className="text-[#737373] font-normal text-xs">
								(optional)
							</span>
						</Label>
						<Input
							id="create-location"
							type="text"
							placeholder="e.g. Studio A"
							value={createForm.location}
							onChange={(e) =>
								setCreateForm((prev) => ({
									...prev,
									location: e.target.value,
								}))
							}
						/>
					</div>
				</div>

				{/* Footer */}
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] flex justify-end gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => onSubmit(createForm)}
						disabled={
							isPending ||
							!createForm.serviceId ||
							!createForm.branchId ||
							!createForm.date ||
							!createForm.startTime ||
							!createForm.endTime
						}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isPending ? "Creating…" : "Create Slot"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
