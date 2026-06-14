import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { TrainerSidebar } from "@/components/calendar/trainer-sidebar";
import {
	getAppointmentQueryRange,
	mapApiAppointmentToCalendar,
} from "@/lib/appointment-mapper";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";

/**
 * Embedded trainer schedule for the Dashboard launchpad. Mirrors the schedule
 * tab of /appointment/view, reusing the same TrainerSidebar + AppointmentList
 * with local state (no route coupling).
 */
export function SchedulePanel({ organizationId }: { organizationId: string }) {
	const { data: userContext } = useUserContext();
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberRole = currentOrg?.hierarchy?.member?.role?.toLowerCase();
	const memberId = currentOrg?.hierarchy?.member?.id;
	const canViewAllTrainers = memberRole === "admin" || memberRole === "staff";

	const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(
		null,
	);
	const selectedTrainerId = canViewAllTrainers
		? sidebarSelectedId
		: (memberId ?? null);

	const { startFrom, startTo } = getAppointmentQueryRange();

	const {
		data: apiAppointments = [],
		isLoading,
		error,
	} = useQuery({
		...orpc.appointments.list.queryOptions({
			input: {
				organizationId,
				trainerId: selectedTrainerId ?? undefined,
				startFrom,
				startTo,
				limit: 200,
			},
		}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const appointments = useMemo(
		() => apiAppointments.map(mapApiAppointmentToCalendar),
		[apiAppointments],
	);

	if (error) {
		return (
			<div className="flex h-full min-h-[460px] flex-col items-center justify-center">
				<p className="text-sm font-medium text-[#0a0a0a]">
					Failed to load appointments
				</p>
				<p className="mt-1 text-xs text-[#737373]">
					{error instanceof Error ? error.message : "Please try again."}
				</p>
			</div>
		);
	}

	return (
		<div className="-mx-6 -my-6 flex h-full min-h-[460px] overflow-hidden">
			{canViewAllTrainers ? (
				<>
					<aside className="w-[260px] shrink-0 overflow-hidden">
						<TrainerSidebar
							organizationId={organizationId}
							selectedTrainerId={sidebarSelectedId}
							onSelectTrainer={setSidebarSelectedId}
							totalCount={appointments.length}
						/>
					</aside>
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-[#e8ebf0]">
						<AppointmentList
							appointments={appointments}
							isLoading={isLoading}
							defaultTrainerId={selectedTrainerId}
						/>
					</div>
				</>
			) : (
				<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
					<AppointmentList
						appointments={appointments}
						isLoading={isLoading}
						defaultTrainerId={selectedTrainerId}
					/>
				</div>
			)}
		</div>
	);
}
