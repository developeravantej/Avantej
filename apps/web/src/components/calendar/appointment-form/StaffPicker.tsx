import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Trainer = {
	id: string;
	name: string;
	role: string;
	department: string;
};

export type CommissionSlot = {
	slotIndex: number;
	label: string;
	weightageBasisPoints: number;
};

type StaffPickerProps = {
	trainers: Trainer[];
	commissionSlots: CommissionSlot[];
	employeeId: string;
	additionalSlotTrainers: string[];
	onChangeEmployeeId: (trainerId: string) => void;
	onChangeAdditionalTrainer: (idx: number, trainerId: string) => void;
	trainerPlaceholder: string;
	/** When true, disable the trainer select (e.g. no room chosen yet) */
	disableWhenNoRoom?: boolean;
	roomId?: string;
};

export function StaffPicker({
	trainers,
	commissionSlots,
	employeeId,
	additionalSlotTrainers,
	onChangeEmployeeId,
	onChangeAdditionalTrainer,
	trainerPlaceholder,
	disableWhenNoRoom = false,
	roomId,
}: StaffPickerProps) {
	const isRoomMissing = disableWhenNoRoom && !roomId;

	return (
		<div className={commissionSlots.length > 1 ? "space-y-3 md:col-span-2" : "space-y-2"}>
			<Label className="text-sm font-medium text-brand-primary-1">
				{commissionSlots.length > 1 ? "Staff Slots" : "Trainer"}
			</Label>

			{commissionSlots.length > 1 ? (
				// Slot-based picker: one row per commission slot
				commissionSlots.map((slot, idx) => (
					<div key={slot.slotIndex} className="space-y-1">
						<div className="flex items-center gap-2 text-xs">
							<span className="font-medium text-brand-primary-1">{slot.label}</span>
							<span className="text-muted-foreground">({(slot.weightageBasisPoints / 100).toFixed(0)}%)</span>
						</div>
						<Select
							value={idx === 0 ? employeeId : (additionalSlotTrainers[idx - 1] ?? "")}
							onValueChange={(value) => {
								if (idx === 0) {
									onChangeEmployeeId(value);
								} else {
									onChangeAdditionalTrainer(idx - 1, value);
								}
							}}
						>
							<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
								<SelectValue placeholder={`Select ${slot.label} (optional)`} />
							</SelectTrigger>
							<SelectContent className="z-[10001]">
								{trainers.map((trainer) => (
									<SelectItem key={trainer.id} value={trainer.id}>
										{trainer.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				))
			) : (
				// Single trainer picker
				<>
					{commissionSlots.length === 1 && (
						<div className="text-xs text-muted-foreground mb-1">
							{commissionSlots[0].label} ({(commissionSlots[0].weightageBasisPoints / 100).toFixed(0)}%)
						</div>
					)}
					<Select
						value={employeeId}
						onValueChange={onChangeEmployeeId}
						disabled={isRoomMissing}
					>
						<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
							<SelectValue placeholder={trainerPlaceholder} />
						</SelectTrigger>
						<SelectContent className="z-[10001]">
							{trainers.map((trainer) => (
								<SelectItem key={trainer.id} value={trainer.id}>
									{trainer.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</>
			)}
		</div>
	);
}
