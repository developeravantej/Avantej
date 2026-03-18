import { ChevronsUpDown, Clock, User, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { mapApiAppointmentToCalendar, getTodayRange } from "@/lib/appointment-mapper";

export function AppointmentsWidget() {
	const navigate = useNavigate();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { startFrom, startTo } = getTodayRange();

	const { data: apiAppointments = [], isLoading } = useQuery({
		queryKey: ["appointments-today", organizationId, startFrom, startTo],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.appointments.list({
				organizationId,
				startFrom,
				startTo,
				limit: 10,
			});
		},
		enabled: !!organizationId,
		staleTime: 2 * 60 * 1000,
	});

	const appointments = useMemo(
		() => apiAppointments.map(mapApiAppointmentToCalendar),
		[apiAppointments]
	);

	const handleWidgetClick = () => {
		navigate({
			to: "/appointment/view",
			search: { view: "weekly" },
		});
	};

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	const getStatusColor = (status: "confirmed" | "pending" | "cancelled") => {
		switch (status) {
			case "confirmed":
				return "bg-green-100 text-green-800 border-green-200";
			case "pending":
				return "bg-yellow-100 text-yellow-800 border-yellow-200";
			case "cancelled":
				return "bg-red-100 text-red-800 border-red-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	const formatDuration = (start: Date, end: Date) => {
		const durationMs = end.getTime() - start.getTime();
		const durationMinutes = Math.round(durationMs / (1000 * 60));
		const hours = Math.floor(durationMinutes / 60);
		const minutes = durationMinutes % 60;
		if (hours > 0) {
			return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
		}
		return `${minutes}m`;
	};

	return (
		<Card
			className="h-full cursor-pointer hover:shadow-md transition-shadow"
			onClick={handleWidgetClick}
		>
			<CardContent>
				<div className="flex flex-col h-[220px] overflow-y-auto pr-4 -mr-4 [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
					<div className="flex justify-between items-center p-2 mb-2">
						<h1 className="font-heading font-bold text-2xl">Appointments Today</h1>
						<ChevronsUpDown className="mr-3 h-4 w-4" />
					</div>

					{!organizationId ? (
						<div className="text-center py-8 text-muted-foreground text-sm">
							Select an organization to see appointments.
						</div>
					) : isLoading ? (
						<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
							Loading…
						</div>
					) : appointments.length === 0 ? (
						<div className="text-center py-8 text-gray-500">
							<Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
							<p className="text-lg font-medium">No appointments today</p>
							<p className="text-sm">You're all caught up!</p>
						</div>
					) : (
						<div className="space-y-3">
							{appointments.map((appointment, index) => (
								<div
									key={appointment.id}
									className={cn(
										"flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 relative",
										getStatusColor(appointment.status)
									)}
								>
									<div className="flex-shrink-0 w-16 text-center">
										<div className="text-sm font-medium text-gray-900">
											{formatTime(appointment.start)}
										</div>
										<div className="text-xs text-gray-500">
											{formatTime(appointment.end)}
										</div>
									</div>
									<div className="flex-shrink-0 w-4 flex flex-col items-center">
										<div className="w-3 h-3 rounded-full bg-blue-500" />
										{index < appointments.length - 1 && (
											<div className="w-0.5 h-8 bg-gray-300 mt-1" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-start justify-between">
											<div className="flex-1 min-w-0">
												<h3 className="text-sm font-medium text-gray-900 truncate">
													{appointment.title}
												</h3>
												<div className="flex items-center gap-1 mt-1">
													<User className="h-3 w-3 text-gray-400" />
													<p className="text-xs text-gray-600 truncate">
														{appointment.clientName}
													</p>
												</div>
												<div className="flex items-center gap-1 mt-1">
													<Clock className="h-3 w-3 text-gray-400" />
													<p className="text-xs text-gray-500 truncate">
														{appointment.service} • {formatDuration(appointment.start, appointment.end)}
													</p>
												</div>
											</div>
											<Badge
												variant="secondary"
												className={cn(
													"ml-2 text-xs",
													appointment.status === "confirmed" && "bg-green-100 text-green-800",
													appointment.status === "pending" && "bg-yellow-100 text-yellow-800",
													appointment.status === "cancelled" && "bg-red-100 text-red-800"
												)}
											>
												{appointment.status}
											</Badge>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
