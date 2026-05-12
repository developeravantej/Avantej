import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/utils/orpc";

interface Props {
	organizationId: string | null;
}

function relativeTime(dateStr: string): string {
	const diffMs = Date.now() - new Date(dateStr).getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	if (diffSecs < 60) return "just now";
	const mins = Math.floor(diffSecs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function ActivitySkeleton() {
	return (
		<div className="flex items-start gap-3 py-3">
			<Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
			<div className="flex-1 space-y-1.5">
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-3 w-16" />
			</div>
		</div>
	);
}

export function RecentActivityWidget({ organizationId }: Props) {
	const { data, isLoading } = useQuery({
		queryKey: ["userActivityLog", "list", organizationId],
		queryFn: () =>
			client.userActivityLog.list({
				organizationId: organizationId!,
				limit: 10,
			}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const entries = data ?? [];

	return (
		<Card className="h-full">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-bold uppercase tracking-wide text-brand-secondary-1">
					My Recent Activity
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="divide-y divide-brand-secondary-3">
						<ActivitySkeleton />
						<ActivitySkeleton />
						<ActivitySkeleton />
					</div>
				) : entries.length === 0 ? (
					<p className="py-4 text-center text-sm text-brand-secondary-1">
						No recent activity
					</p>
				) : (
					<div className="divide-y divide-brand-secondary-3">
						{entries.slice(0, 10).map((entry) => (
							<div key={entry.id} className="flex items-start gap-3 py-3">
								<ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-brand-secondary-1" />
								<div className="flex-1 min-w-0">
									<p className="truncate text-sm text-brand-primary-1">
										{entry.description}
									</p>
									<p className="text-xs text-brand-secondary-1">
										{relativeTime(entry.createdAt as any)}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
