import { createFileRoute } from "@tanstack/react-router";
import { AppointmentCalendar } from "@/components/calendar/appointment";
import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useMemo } from "react";
import {
	mapApiAppointmentToCalendar,
	getAppointmentQueryRange,
} from "@/lib/appointment-mapper";

/**
 * Appointment View Route
 *
 * Calendar view for managing appointments with monthly and weekly views.
 * Requires: appointment_management:read permission
 */
export const Route = createFileRoute("/_authenticated/appointment/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "appointment_management", action: "read" },
			"/dashboard"
		);
	},
	component: AppointmentViewComponent,
});

function AppointmentViewComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { startFrom, startTo } = getAppointmentQueryRange();

	const {
		data: apiAppointments = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ["appointments", organizationId, startFrom, startTo],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.appointments.list({
				organizationId,
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

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-semibold">Appointments</h1>
				<p className="text-muted-foreground">No organization selected. Please select an organization first.</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-semibold">Appointments</h1>
				<p className="text-destructive">{error instanceof Error ? error.message : "Failed to load appointments"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Appointments</h1>
			</div>
			{isLoading ? (
				<div className="flex items-center justify-center py-24 text-muted-foreground">
					Loading appointments…
				</div>
			) : (
				<AppointmentCalendar appointments={appointments} />
			)}
		</div>
	);
}
