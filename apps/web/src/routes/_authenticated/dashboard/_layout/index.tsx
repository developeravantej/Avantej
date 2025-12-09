import { createFileRoute } from "@tanstack/react-router";
import { AppointmentsWidget } from "@/components/appointments-widget";
import { AnnouncementsWidget } from "@/components/announcements-widget";
import { TeamDashboard } from "@/components/team-dashboard";
import {
	SingleTeamDashboard,
	type TeamData,
} from "@/components/single-team-dashboard";
import { PayrollWidget } from "@/components/payroll-widget";
import { ClaimsWidget } from "@/components/claims-widget";

// Sample data - you can replace this with your actual data source
const teams: TeamData[] = [
	{
		id: "team1",
		name: "Team 1",
		teamData: [
			{
				name: "Custom Data 1",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
			{
				name: "Custom Data 21",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
		],
	},
	{
		id: "team2",
		name: "Team 2",
		teamData: [
			{
				name: "Custom Data 1",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
		],
	},
];

const beanchs: TeamData[] = [
	{
		id: "beanch1",
		name: "Branch 1",
		teamData: [
			{
				name: "Custom Data 1",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
			{
				name: "Custom Data 21",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
		],
	},
	{
		id: "beanch 2",
		name: "Branch 2",
		teamData: [
			{
				name: "Custom Data 1",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
		],
	},
];

const individuals: TeamData[] = [
	{
		id: "Individual1",
		name: "Name A",
		teamData: [
			{
				name: "Custom Data 1",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
			{
				name: "Custom Data 21",
				data: [
					{
						target: "Target A",
						score: 85,
					},
					{
						target: "Target B",
						score: 92,
					},
					{
						target: "Target C",
						score: 92,
					},
				],
			},
		],
	},
];

/**
 * Dashboard Route
 * 
 * Main dashboard page - uses dashboard/_layout
 */
export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	component: DashboardComponent,
});

function DashboardComponent() {
	return (
		<div className="space-y-6">
			{/* Dashboard Content */}
			<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
				{/* Top row */}
				<div className="md:col-span-4">
					<AppointmentsWidget />
				</div>
				<div className="md:col-span-8">
					<AnnouncementsWidget />
				</div>

				{/* Middle row */}
				<div className="md:col-span-4">
					<TeamDashboard teams={teams} initialTeam={teams[0]} />
				</div>
				<div className="md:col-span-4">
					<TeamDashboard teams={beanchs} initialTeam={beanchs[0]} />
				</div>
				<div className="md:col-span-4">
					<SingleTeamDashboard team={individuals[0]} />
				</div>

				{/* Bottom row */}
				<div className="md:col-span-4">
					<PayrollWidget />
				</div>
				<div className="md:col-span-8">
					<ClaimsWidget />
				</div>
			</div>
		</div>
	);
}

