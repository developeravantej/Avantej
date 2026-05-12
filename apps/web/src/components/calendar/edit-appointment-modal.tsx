/**
 * EditAppointmentModal
 *
 * Allows staff to edit trainer/staff assignments for an existing appointment.
 * Fetches current staff from appointment_staff, renders StaffPicker,
 * and calls client.appointments.update({ staffAssignments }).
 */

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	const { data: userCtx } = useUserContext();
	const { trainers } = useAppointmentFormData();

	// Fetch appointment detail to get current staff
	const { data: staffRows = [], isLoading: isLoadingStaff } = useQuery({
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
		queryFn: () => client.appointments.getById({ id: appointmentId, organizationId }),
		enabled: isOpen && !!appointmentId && !!organizationId,
	});

	// Local state: slot 0 (primary) trainer, additional slots
	const [employeeId, setEmployeeId] = useState("");
	const [additionalSlotTrainers, setAdditionalSlotTrainers] = useState<string[]>([]);

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

	if (!isOpen) return null;

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
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
					<div className="flex items-center gap-2">
						<Users className="size-5 text-muted-foreground" />
						<CardTitle className="text-lg font-semibold">Edit Staff Assignment</CardTitle>
					</div>
					<Button variant="ghost" size="sm" onClick={onClose} className="size-8 p-0">
						<X className="size-4" />
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoadingStaff ? (
						<div className="text-sm text-muted-foreground">Loading…</div>
					) : (
						<StaffPicker
							trainers={trainers}
							commissionSlots={[{ slotIndex: 0, label: "Primary Trainer", weightageBasisPoints: 10000 }]}
							employeeId={employeeId}
							additionalSlotTrainers={additionalSlotTrainers}
							onChangeEmployeeId={setEmployeeId}
							onChangeAdditionalTrainer={handleAdditionalTrainerChange}
							trainerPlaceholder="Select trainer"
						/>
					)}

					<div className="flex gap-3 pt-2 border-t">
						<Button variant="outline" onClick={onClose} className="flex-1" disabled={updateMutation.isPending}>
							Cancel
						</Button>
						<Button onClick={handleSave} className="flex-1" disabled={updateMutation.isPending}>
							{updateMutation.isPending ? "Saving..." : "Save"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
