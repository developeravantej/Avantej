import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { StatusTimeline } from "@/components/ui/status-timeline";

export function AppointmentStatusHistory({
	organizationId,
	appointmentId,
}: {
	organizationId: string;
	appointmentId: string;
}) {
	const { data, isLoading } = useQuery(
		orpc.appointments.statusHistory.queryOptions({
			input: { organizationId, appointmentId },
		}),
	);
	return <StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />;
}
