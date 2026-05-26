import { createFileRoute } from "@tanstack/react-router";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrainerSidebar } from "@/components/calendar/trainer-sidebar";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { requirePermission } from "@/lib/route-guards";
import { client } from "@/utils/orpc";
import {
	mapApiAppointmentToCalendar,
	getAppointmentQueryRange,
} from "@/lib/appointment-mapper";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/view",
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "appointment_management", action: "read" },
			"/dashboard",
		);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberRole = currentOrg?.hierarchy?.member?.role?.toLowerCase();
	const memberId = (currentOrg?.hierarchy?.member as any)?.id;
	const canViewAllTrainers =
		memberRole === "admin" || memberRole === "staff";

	const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(null);
	const selectedTrainerId = canViewAllTrainers
		? sidebarSelectedId
		: (memberId ?? null);

	const { startFrom, startTo } = getAppointmentQueryRange();

	const {
		data: apiAppointments = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"appointments",
			organizationId,
			selectedTrainerId,
			startFrom,
			startTo,
		],
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
		[apiAppointments],
	);

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-sm text-[#737373]">
				Select an organization to view appointments.
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-96 flex-col items-center justify-center px-6">
				<p className="text-sm font-medium text-[#0a0a0a]">Failed to load appointments</p>
				<p className="mt-1 text-xs text-[#737373]">
					{error instanceof Error ? error.message : "Please try again."}
				</p>
			</div>
		);
	}

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Appointments</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Schedule</span>
				</div>
			</header>

			{/* ── Split-pane content ── */}
			<div className="mx-6 my-6 flex-1 min-h-0 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				{canViewAllTrainers ? (
					/* Admin/Staff: Trainer sidebar + agenda in a horizontal split */
					<div className="flex h-full min-h-0 overflow-hidden">
						{/* Sidebar: fixed 280 px column */}
						<aside className="w-[280px] shrink-0 overflow-hidden">
							<TrainerSidebar
								organizationId={organizationId}
								selectedTrainerId={sidebarSelectedId}
								onSelectTrainer={setSidebarSelectedId}
								totalCount={appointments.length}
							/>
						</aside>

						{/* Main: toolbar + scrollable agenda */}
						<div className="flex flex-1 min-w-0 flex-col overflow-hidden border-l border-[#e5e5e5]">
							<AppointmentList
								appointments={appointments}
								isLoading={isLoading}
								defaultTrainerId={selectedTrainerId}
							/>
						</div>
					</div>
				) : (
					/* Trainer: no sidebar, full width */
					<div className="flex h-full min-h-0 flex-col overflow-hidden">
						<AppointmentList
							appointments={appointments}
							isLoading={isLoading}
							defaultTrainerId={selectedTrainerId}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
