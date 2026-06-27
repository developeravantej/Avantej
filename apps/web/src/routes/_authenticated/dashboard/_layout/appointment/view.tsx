import { createFileRoute } from "@tanstack/react-router";
import { useUserContext } from "@/hooks/useUserContext";
import { useState } from "react";
import { TrainerSidebar } from "@/components/calendar/trainer-sidebar";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { requirePermission } from "@/lib/route-guards";
import { useTrainerSchedule } from "@/hooks/useTrainerSchedule";
import type { mapApiAppointmentToCalendar } from "@/lib/appointment-mapper";
import { AttendanceTab } from "@/components/attendance/attendance-tab";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

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

type Tab = "schedule" | "attendance";

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<Tab>("schedule");

	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const {
		canViewAllTrainers,
		sidebarSelectedId,
		setSidebarSelectedId,
		selectedTrainerId,
		appointments,
		isLoading,
		error,
	} = useTrainerSchedule({
		organizationId,
		enabled: activeTab === "schedule",
	});

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			{/* ── Header with tabs ── */}
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7 gap-6">
				<span className="text-sm text-muted-foreground shrink-0">
					Appointments
				</span>
				<nav className="flex items-center gap-1 h-full">
					{(["schedule", "attendance"] as Tab[]).map((tab) => (
						<button
							key={tab}
							type="button"
							onClick={() => setActiveTab(tab)}
							className={[
								"relative h-full px-3 text-sm font-medium transition-colors capitalize",
								activeTab === tab
									? "text-[#0a0a0a] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#0a0a0a] after:rounded-t"
									: "text-[#737373] hover:text-[#0a0a0a]",
							].join(" ")}
						>
							{tab === "schedule" ? "Schedule" : "Attendance"}
						</button>
					))}
				</nav>

				{/* Scope switcher narrows the Schedule tab's appointment query. */}
				{activeTab === "schedule" && <ScopeSwitcher className="ml-auto w-56" />}
			</header>

			{/* ── Tab content ── */}
			{activeTab === "schedule" ? (
				<ScheduleTab
					organizationId={organizationId}
					canViewAllTrainers={canViewAllTrainers}
					sidebarSelectedId={sidebarSelectedId}
					setSidebarSelectedId={setSidebarSelectedId}
					selectedTrainerId={selectedTrainerId}
					appointments={appointments}
					isLoading={isLoading}
					error={error}
				/>
			) : (
				<div className="flex-1 overflow-y-auto">
					<AttendanceTab />
				</div>
			)}
		</div>
	);
}

// ─── Schedule tab content ──────────────────────────────────────────────────────

interface ScheduleTabProps {
	organizationId: string | null;
	canViewAllTrainers: boolean;
	sidebarSelectedId: string | null;
	setSidebarSelectedId: (id: string | null) => void;
	selectedTrainerId: string | null;
	appointments: ReturnType<typeof mapApiAppointmentToCalendar>[];
	isLoading: boolean;
	error: Error | null;
}

function ScheduleTab({
	organizationId,
	canViewAllTrainers,
	sidebarSelectedId,
	setSidebarSelectedId,
	selectedTrainerId,
	appointments,
	isLoading,
	error,
}: ScheduleTabProps) {
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
		<div className="mx-6 my-6 flex-1 min-h-0 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			{canViewAllTrainers ? (
				<div className="flex h-full min-h-0 overflow-hidden">
					<aside className="w-[280px] shrink-0 overflow-hidden">
						<TrainerSidebar
							organizationId={organizationId}
							selectedTrainerId={sidebarSelectedId}
							onSelectTrainer={setSidebarSelectedId}
							totalCount={appointments.length}
						/>
					</aside>
					<div className="flex flex-1 min-w-0 flex-col overflow-hidden border-l border-[#e5e5e5]">
						<AppointmentList
							appointments={appointments}
							isLoading={isLoading}
							defaultTrainerId={selectedTrainerId}
						/>
					</div>
				</div>
			) : (
				<div className="flex h-full min-h-0 flex-col overflow-hidden">
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
