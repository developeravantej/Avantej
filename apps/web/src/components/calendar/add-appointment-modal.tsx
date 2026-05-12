/**
 * AddAppointmentModal — thin shell.
 *
 * All state, hooks, and handlers live in useAppointmentFormState.
 * All JSX lives in AppointmentFormContent.
 */
import { useAppointmentFormState } from "@/hooks/useAppointmentFormState";
import { AppointmentFormContent } from "./appointment-form/AppointmentFormContent";
import type { TeamMember, OnSubmitPayload } from "@/types/appointments";


// ─── Props ────────────────────────────────────────────────────────────────────

interface AddAppointmentModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (appointment: OnSubmitPayload) => void;
	teamMembers: TeamMember[];
	selectedDate?: Date;
	defaultTrainerId?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddAppointmentModal({
	isOpen,
	onClose,
	onSubmit,
	teamMembers,
	selectedDate,
	defaultTrainerId,
}: AddAppointmentModalProps) {
	const formState = useAppointmentFormState({
		selectedDate,
		defaultTrainerId,
		teamMembers,
		onSubmit,
		onClose,
	});

	if (!isOpen) return null;
	if (!teamMembers || !Array.isArray(teamMembers)) return null;

	return (
		<AppointmentFormContent
			{...formState}
			teamMembers={teamMembers}
			onSubmit={onSubmit}
			onClose={onClose}
		/>
	);
}
