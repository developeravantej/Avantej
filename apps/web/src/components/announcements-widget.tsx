import { ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";

function formatAnnouncementDate(date: Date | string | null | undefined): string {
	if (!date) return "";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return "";
	}
}

export function AnnouncementsWidget() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: announcements = [], isLoading } = useQuery({
		queryKey: ["announcements-active", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.announcements.listActive({ organizationId });
		},
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	return (
		<Card className="h-full">
			<CardContent>
				<div className="flex flex-col h-[220px] overflow-y-auto pr-4 -mr-4 [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
					<div className="flex justify-between items-center p-2">
						<h1 className="font-heading font-bold text-2xl">Announcements</h1>
						<ChevronsUpDown className="mr-3 h-4 w-4" />
					</div>

					{!organizationId ? (
						<div className="text-center py-6 text-muted-foreground text-sm">
							Select an organization to see announcements.
						</div>
					) : isLoading ? (
						<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
							Loading…
						</div>
					) : announcements.length === 0 ? (
						<div className="text-center py-6 text-muted-foreground text-sm">
							No announcements right now.
						</div>
					) : (
						<>
							{announcements.map((a) => (
								<div
									key={a.id}
									className="flex flex-col border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0"
								>
									<div className="flex items-center">
										<div className="text-lg font-bold">{a.title}</div>
										<div className="text-sm pl-1 text-muted-foreground">
											({formatAnnouncementDate(a.createdAt)})
										</div>
									</div>
									<div className="mt-1 text-sm text-gray-600">
										{a.message}
									</div>
								</div>
							))}
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
