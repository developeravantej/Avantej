import { Megaphone } from "lucide-react";

// ─── Empty state for the announcements list ───────────────────────────────────

interface AnnouncementsEmptyStateProps {
	hasSearch: boolean;
}

export function AnnouncementsEmptyState({
	hasSearch,
}: AnnouncementsEmptyStateProps) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white flex flex-col items-center justify-center py-16 text-[#737373]">
			<Megaphone className="h-8 w-8 mb-3 opacity-30" />
			<p className="text-sm font-medium">No announcements</p>
			<p className="text-xs mt-1">
				{hasSearch
					? "No results for your search."
					: "No announcements match the current filters."}
			</p>
		</div>
	);
}
