import { createFileRoute } from "@tanstack/react-router";
import { AppointmentCalendar } from "@/components/calendar/appointment";
import { requirePermission } from "@/lib/route-guards";

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
	// TODO: Replace with actual API call when backend is ready
	// const { data: appointments } = useQuery(apiClient.getListAppointments.queryOptions());
	
	// Mock data for UI development
	const mockAppointments = [
		{
			id: "1",
			title: "Personal Training",
			start: new Date(2024, 0, 15, 10, 0),
			end: new Date(2024, 0, 15, 11, 0),
			status: "confirmed" as const,
			clientName: "John Client",
			service: "Personal Training Session",
			assignedTo: {
				id: "1",
				name: "John Doe",
				email: "john@example.com",
				color: "#3b82f6",
			},
		},
		{
			id: "2",
			title: "Group Class",
			start: new Date(2024, 0, 15, 14, 0),
			end: new Date(2024, 0, 15, 15, 0),
			status: "pending" as const,
			clientName: "Jane Client",
			service: "Group Fitness Class",
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Appointments</h1>
			</div>
			<AppointmentCalendar appointments={mockAppointments} />
		</div>
	);
}

