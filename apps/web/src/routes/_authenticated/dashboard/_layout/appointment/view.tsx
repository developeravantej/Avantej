import { createFileRoute, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppointmentCalendar } from "@/components/calendar/appointment";
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
	validateSearch: (search: Record<string, unknown>) => {
		return {
			view: search.view as string | undefined,
		};
	},
});

function RouteComponent() {
	const search = useSearch({ from: "/_authenticated/dashboard/_layout/appointment/view" });
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Role detection — uses hierarchy.member.id and .role
	const currentOrg = userContext?.organizations.find((o) => o.id === organizationId);
	const memberRole = currentOrg?.hierarchy?.member?.role;
	const memberId = currentOrg?.hierarchy?.member?.id;
	const isTrainer = memberRole === "trainer";

	// For admins: selected from sidebar. For trainers: locked to self.
	const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(null);
	const selectedTrainerId = isTrainer ? (memberId ?? null) : sidebarSelectedId;

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

	const handleDateSelect = (date: Date) => {
		toast.info(`Selected date: ${date.toLocaleDateString()}`);
	};

	const handleAppointmentClick = (appointment: { id: string; title: string; clientName: string }) => {
		toast.info(`Appointment: ${appointment.title} with ${appointment.clientName}`);
	};

	const handleAddAppointment = () => {
		// The AppointmentCalendar manages its own modal state internally.
		// This callback fires when the user clicks "Add Appointment" inside the calendar.
	};

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold font-heading">
					{isTrainer ? "My Schedule" : "Appointments"}
				</h1>
				<p className="text-muted-foreground">No organization selected.</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold font-heading">
					{isTrainer ? "My Schedule" : "Appointments"}
				</h1>
				<p className="text-destructive">{error instanceof Error ? error.message : "Failed to load appointments"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold font-heading">
					{isTrainer ? "My Schedule" : "Appointments"}
				</h1>
			</div>

			<div className="flex gap-4">
				{/* Sidebar — hidden for trainers */}
				{!isTrainer && (
					<div className="w-64 shrink-0">
						<TrainerSidebar
							organizationId={organizationId}
							selectedTrainerId={sidebarSelectedId}
							onSelectTrainer={setSidebarSelectedId}
						/>
					</div>
				)}

				{/* Calendar — takes remaining width */}
				<div className="flex-1 min-w-0">
					{isLoading ? (
						<div className="flex items-center justify-center py-24 text-muted-foreground">
							Loading appointments...
						</div>
					) : (
						<AppointmentCalendar
							appointments={appointments}
							onDateSelect={handleDateSelect}
							onAppointmentClick={handleAppointmentClick}
							onAddAppointment={handleAddAppointment}
							initialView={search.view === "weekly" ? "weekly" : "monthly"}
							defaultTrainerId={selectedTrainerId}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
