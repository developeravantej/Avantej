import { Skeleton } from "@/components/ui/skeleton";

export interface StatusTimelineEntry {
	id: string;
	fromStatus: string | null;
	toStatus: string;
	changedByName: string;
	changedAt: Date | string;
	reason: string | null;
	notes: string | null;
}

interface StatusTimelineProps {
	entries: StatusTimelineEntry[];
	statusBadgeRenderer?: (status: string) => React.ReactNode;
	isLoading?: boolean;
}

function DefaultStatusBadge({ status }: { status: string }) {
	const label = status
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return (
		<span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
			{label}
		</span>
	);
}

export function StatusTimeline({
	entries,
	statusBadgeRenderer,
	isLoading,
}: StatusTimelineProps) {
	if (isLoading) {
		return (
			<div className="space-y-3">
				{[1, 2, 3].map((n) => (
					<Skeleton key={`skel-${n}`} className="h-14 w-full" />
				))}
			</div>
		);
	}

	if (!entries.length) {
		return <p className="text-muted-foreground text-sm">No history available.</p>;
	}

	return (
		<ol className="relative border-l border-muted ml-3 space-y-4">
			{entries.map((entry) => (
				<li key={entry.id} className="ml-4">
					<div className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-white bg-muted-foreground" />
					<div className="flex flex-wrap items-center gap-2">
						{entry.fromStatus !== null ? (
							<span className="flex items-center gap-1 text-sm text-muted-foreground">
								{statusBadgeRenderer ? statusBadgeRenderer(entry.fromStatus) : <DefaultStatusBadge status={entry.fromStatus} />}
								<span>→</span>
							</span>
						) : (
							<span className="italic text-muted-foreground text-sm">
								Initial state →
							</span>
						)}
						{statusBadgeRenderer ? statusBadgeRenderer(entry.toStatus) : <DefaultStatusBadge status={entry.toStatus} />}
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{entry.changedByName} &middot;{" "}
						{new Date(entry.changedAt).toLocaleString()}
					</p>
					{entry.reason && (
						<p className="mt-0.5 text-xs text-muted-foreground">
							Reason: {entry.reason}
						</p>
					)}
					{entry.notes && (
						<p className="mt-0.5 text-xs text-muted-foreground">
							Notes: {entry.notes}
						</p>
					)}
				</li>
			))}
		</ol>
	);
}
