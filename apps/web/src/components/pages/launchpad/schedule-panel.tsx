import { AppointmentList } from "@/components/appointments/appointment-list";
import { TrainerSidebar } from "@/components/calendar/trainer-sidebar";
import { useTrainerSchedule } from "@/hooks/useTrainerSchedule";

/**
 * Embedded trainer schedule for the Dashboard launchpad. Mirrors the schedule
 * tab of /appointment/view, sharing its data layer via useTrainerSchedule and
 * reusing TrainerSidebar + AppointmentList.
 */
export function SchedulePanel({ organizationId }: { organizationId: string }) {
	const {
		canViewAllTrainers,
		sidebarSelectedId,
		setSidebarSelectedId,
		selectedTrainerId,
		appointments,
		isLoading,
		error,
	} = useTrainerSchedule({ organizationId });

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
