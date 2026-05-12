import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { StatusTimeline } from "@/components/ui/status-timeline";

export function AppointmentStatusHistory({
	organizationId,
	appointmentId,
}: {
	organizationId: string;
	appointmentId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["appointments", "statusHistory", appointmentId],
		queryFn: () =>
			client.appointments.statusHistory({ organizationId, appointmentId }),
	});
	return (
		<StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />
	);
}
