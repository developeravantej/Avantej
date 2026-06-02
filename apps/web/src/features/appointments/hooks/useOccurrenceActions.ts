import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";
import type { OccurrenceEditAction } from "@/types/appointments";
import type { Appointment } from "../types";

interface UseOccurrenceActionsOptions {
	organizationId: string;
	onEditAll: (parentId: string) => void;
	onDialogClose: () => void;
}

export function useOccurrenceActions({
	organizationId,
	onEditAll,
	onDialogClose,
}: UseOccurrenceActionsOptions) {
	const queryClient = useQueryClient();

	const handleOccurrenceAction = async (
		action: OccurrenceEditAction,
		appt: Appointment,
	) => {
		if (!appt.isVirtual && !appt.parentId) return;
		const parentId = appt.parentId ?? appt.id;
		const occurrenceDate =
			appt.start instanceof Date
				? appt.start.toISOString().split("T")[0]!
				: new Date(appt.start).toISOString().split("T")[0]!;
		onDialogClose();
		try {
			if (action === "cancel_this") {
				await client.appointments.materializeOccurrence({
					organizationId,
					parentId,
					occurrenceDate,
					updates: { status: "cancelled" },
				});
				toast.success("Occurrence cancelled");
				queryClient.invalidateQueries(
					orpc.appointments.list.queryOptions({ input: { organizationId } }),
				);
			} else if (action === "cancel_future") {
				await client.appointments.cancelFuture({
					organizationId,
					parentId,
					fromDate: occurrenceDate,
				});
				toast.success("Future occurrences cancelled");
				queryClient.invalidateQueries(
					orpc.appointments.list.queryOptions({ input: { organizationId } }),
				);
			} else if (action === "cancel_all") {
				await client.appointments.cancelSeries({ organizationId, parentId });
				toast.success("Series cancelled");
				queryClient.invalidateQueries(
					orpc.appointments.list.queryOptions({ input: { organizationId } }),
				);
			} else if (action === "edit_this") {
				await client.appointments.materializeOccurrence({
					organizationId,
					parentId,
					occurrenceDate,
				});
				queryClient.invalidateQueries(
					orpc.appointments.list.queryOptions({ input: { organizationId } }),
				);
				toast.success("Occurrence created — refresh to edit");
			} else if (action === "edit_future") {
				await client.appointments.splitSeries({
					organizationId,
					parentId,
					fromDate: occurrenceDate,
				});
				toast.success(
					"Series split — future occurrences can now be edited independently",
				);
				queryClient.invalidateQueries(
					orpc.appointments.list.queryOptions({ input: { organizationId } }),
				);
			} else if (action === "edit_all") {
				onEditAll(parentId);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Action failed");
		}
	};

	return { handleOccurrenceAction };
}
