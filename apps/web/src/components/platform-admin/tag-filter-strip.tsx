/**
 * Platform Admin — Tag Filter Strip (Plan F.1).
 *
 * Horizontal strip of distinct tag labels (from tags.list). Clicking a
 * chip toggles it in the active filter set. Filter state is owned by
 * the parent (tenants.tsx) which round-trips via URL search params so
 * filters survive reload.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { TagChip } from "./tag-chip";

export interface TagFilterStripProps {
	activeLabels: string[];
	onToggle: (label: string) => void;
	onClear: () => void;
}

export function TagFilterStrip({
	activeLabels,
	onToggle,
	onClear,
}: TagFilterStripProps) {
	const { data, isLoading } = useQuery({
		queryKey: ["platformAdminTenants", "tags", "list"],
		queryFn: () => client.platformAdminTenants.tags.list({}),
	});
	const tags = data?.tags ?? [];
	const activeSet = new Set(activeLabels);

	if (isLoading) {
		return (
			<div
				className="text-xs text-muted-foreground"
				data-testid="tag-filter-strip-loading"
			>
				Loading tags…
			</div>
		);
	}

	if (tags.length === 0) {
		return (
			<div
				className="text-xs text-muted-foreground"
				data-testid="tag-filter-strip-empty"
			>
				No tags yet — apply one from the bulk actions bar.
			</div>
		);
	}

	return (
		<div
			className="flex flex-wrap gap-2 items-center"
			data-testid="tag-filter-strip"
		>
			<span className="text-xs text-muted-foreground mr-1">Filter by tag:</span>
			{tags.map((t) => (
				<button
					key={t.label}
					type="button"
					onClick={() => onToggle(t.label)}
					className="focus:outline-none"
					data-testid={`tag-filter-${t.label}`}
				>
					<TagChip
						label={`${t.label} (${t.orgCount})`}
						color={t.color}
						active={activeSet.has(t.label)}
					/>
				</button>
			))}
			{activeLabels.length > 0 && (
				<button
					type="button"
					onClick={onClear}
					className="text-xs text-muted-foreground underline ml-2"
					data-testid="tag-filter-clear"
				>
					Clear ({activeLabels.length})
				</button>
			)}
		</div>
	);
}
