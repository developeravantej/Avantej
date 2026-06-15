import { Card, CardContent } from "@/components/ui/card";

interface MembersStatsBarProps {
	totalUsers: number;
	activeUsers: number;
	usersWithoutRoles: number;
	availableRoles: number;
}

export function MembersStatsBar({
	totalUsers,
	activeUsers,
	usersWithoutRoles,
	availableRoles,
}: MembersStatsBarProps) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
			<Card>
				<CardContent className="p-4">
					<div className="text-center">
						<div className="text-2xl font-bold">{totalUsers}</div>
						<div className="text-sm text-[#737373]">Total Users</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-4">
					<div className="text-center">
						<div className="text-2xl font-bold">{activeUsers}</div>
						<div className="text-sm text-[#737373]">Active Users</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-4">
					<div className="text-center">
						<div className="text-2xl font-bold">{usersWithoutRoles}</div>
						<div className="text-sm text-[#737373]">No Roles</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-4">
					<div className="text-center">
						<div className="text-2xl font-bold">{availableRoles}</div>
						<div className="text-sm text-[#737373]">Available Roles</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
