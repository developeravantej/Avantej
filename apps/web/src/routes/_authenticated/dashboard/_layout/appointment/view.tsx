import { createFileRoute } from "@tanstack/react-router";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { TrainerSidebar } from "@/components/calendar/trainer-sidebar";
import { requirePermission } from "@/lib/route-guards";
import { client } from "@/utils/orpc";
import {
	mapApiAppointmentToCalendar,
	getAppointmentQueryRange,
} from "@/lib/appointment-mapper";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/view"
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "appointment_management", action: "read" },
			"/dashboard"
		);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find((o) => o.id === organizationId);
	const memberRole = currentOrg?.hierarchy?.member?.role?.toLowerCase();
	const memberId = currentOrg?.hierarchy?.member?.id;
	const canViewAllTrainers = memberRole === "admin" || memberRole === "staff";

	const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(null);
	const selectedTrainerId = canViewAllTrainers ? sidebarSelectedId : (memberId ?? null);

	const { startFrom, startTo } = getAppointmentQueryRange();

	const {
		data: apiAppointments = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ["appointments", organizationId, selectedTrainerId, startFrom, startTo],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.appointments.list({
				organizationId,
				trainerId: selectedTrainerId ?? undefined,
				startFrom,
				startTo,
				limit: 200,
			});
		},
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const appointments = useMemo(
		() => apiAppointments.map(mapApiAppointmentToCalendar),
		[apiAppointments]
	);

	if (!organizationId) return <p className="text-muted-foreground">No organization selected.</p>;

	if (error) return <p className="text-destructive">{error instanceof Error ? error.message : "Failed to load appointments"}</p>;

	return (
		<div className="flex gap-4 h-[calc(100vh-3rem)]">
			{canViewAllTrainers && (
				<div className="w-60 shrink-0 h-full">
					<TrainerSidebar
						organizationId={organizationId}
						selectedTrainerId={sidebarSelectedId}
						onSelectTrainer={setSidebarSelectedId}
					/>
				</div>
			)}
			<div className="flex-1 min-w-0 h-full">
				<AppointmentList
					appointments={appointments}
					isLoading={isLoading}
					defaultTrainerId={selectedTrainerId}
				/>
			</div>
		</div>
	);
}
