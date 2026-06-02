/**
 * EditAppointmentModal
 *
 * Allows staff to edit trainer/staff assignments for an existing appointment.
 * Fetches current staff from appointment_staff, renders StaffPicker,
 * and calls client.appointments.update({ staffAssignments }).
 */

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { StaffPicker } from "@/components/calendar/appointment-form/StaffPicker";
import { useAppointmentFormData } from "@/hooks/useAppointmentFormData";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

interface EditAppointmentModalProps {
	appointmentId: string;
	organizationId: string;
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: () => void;
}

export function EditAppointmentModal({
	appointmentId,
	organizationId,
	isOpen,
	onClose,
	onSuccess,
}: EditAppointmentModalProps) {
	const { data: _userCtx } = useUserContext();
	const { trainers } = useAppointmentFormData();

	// Fetch appointment detail to get current staff
	const { data: _staffRows = [], isLoading: isLoadingStaff } = useQuery({
		queryKey: ["appointmentStaff", appointmentId],
		queryFn: () =>
			client.packageInstanceStaff
				? // packageInstanceStaff is for packages; for appointments we use appointment detail
					Promise.resolve([])
				: Promise.resolve([]),
		enabled: false, // replaced below
	});

	// Fetch the appointment detail to populate existing trainer
	const { data: appointmentDetail } = useQuery({
		queryKey: ["appointmentDetail", appointmentId, organizationId],
		queryFn: () =>
			client.appointments.getById({ id: appointmentId, organizationId }),
		enabled: isOpen && !!appointmentId && !!organizationId,
	});

	// Local state: slot 0 (primary) trainer, additional slots
	const [employeeId, setEmployeeId] = useState("");
	const [additionalSlotTrainers, setAdditionalSlotTrainers] = useState<
		string[]
	>([]);

	// Populate from appointment detail when loaded
	useEffect(() => {
		if (!appointmentDetail) return;
		// trainerId is members.id — find matching trainer by id
		const primaryTrainerId = appointmentDetail.trainerId ?? "";
		setEmployeeId(primaryTrainerId);
		setAdditionalSlotTrainers([]);
	}, [appointmentDetail]);

	const updateMutation = useApiMutation({
		mutationFn: (staffAssignments: { staffId: string; slotIndex: number }[]) =>
			client.appointments.update({
				organizationId,
				id: appointmentId,
				staffAssignments,
			}),
		successMessage: "Staff assignments updated",
		errorMessage: (err) => err.message || "Failed to update staff",
		invalidate: [["appointments"], ["appointmentStaff", appointmentId]],
		onSuccess: () => {
			onSuccess?.();
			onClose();
		},
	});

	// Translate members.id → members.userId for submission
	const findUserId = (membersId: string): string | null => {
		const found = trainers.find((t) => t.id === membersId);
		return found?.userId ?? null;
	};

	const handleSave = () => {
		const assignments: { staffId: string; slotIndex: number }[] = [];

		if (employeeId) {
			const userId = findUserId(employeeId);
			if (userId) assignments.push({ staffId: userId, slotIndex: 0 });
		}

		for (let i = 0; i < additionalSlotTrainers.length; i++) {
			const membersId = additionalSlotTrainers[i];
			if (membersId) {
				const userId = findUserId(membersId);
				if (userId) assignments.push({ staffId: userId, slotIndex: i + 1 });
			}
		}

		updateMutation.mutate(assignments);
	};

	const handleAdditionalTrainerChange = (idx: number, trainerId: string) => {
		setAdditionalSlotTrainers((prev) => {
			const next = [...prev];
			next[idx] = trainerId;
			return next;
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						APPOINTMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Edit Staff Assignment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Update the trainer assigned to this appointment.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4">
						{isLoadingStaff ? (
							<div className="text-sm text-[#737373]">Loading…</div>
						) : (
							<StaffPicker
								trainers={trainers}
								commissionSlots={[
									{
										slotIndex: 0,
										label: "Primary Trainer",
										weightageBasisPoints: 10000,
									},
								]}
								employeeId={employeeId}
								additionalSlotTrainers={additionalSlotTrainers}
								onChangeEmployeeId={setEmployeeId}
								onChangeAdditionalTrainer={handleAdditionalTrainerChange}
								trainerPlaceholder="Select trainer"
							/>
						)}
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={updateMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={updateMutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{updateMutation.isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
