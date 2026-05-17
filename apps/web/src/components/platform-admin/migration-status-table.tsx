/**
 * Platform Admin — Migration Status Table (Plan F.4 — Agent Mi).
 *
 * Stateless read-only table joining drizzle journal + applied tracking-table
 * rows into a single per-tag view. Click a row to view the migration SQL via
 * the parent's `onRowClick` handler (opens a Dialog with the .sql content).
 *
 * NO apply button. Surface only. Applying migrations remains a CLI-only path.
 */

import { Badge } from "@/components/ui/badge";

export type MigrationStatusRow = {
	idx: number;
	tag: string;
	inJournal: boolean;
	appliedInDb: boolean;
	state: "applied" | "pending" | "orphaned";
};

function variantFor(state: MigrationStatusRow["state"]):
	| "default"
	| "destructive"
	| "outline"
	| "secondary" {
	switch (state) {
		case "applied":
			return "default";
		case "orphaned":
			return "destructive";
		case "pending":
		default:
			return "secondary";
	}
}

function classFor(state: MigrationStatusRow["state"]): string {
	switch (state) {
		case "applied":
			return "text-emerald-700 dark:text-emerald-400";
		case "orphaned":
			return "text-red-700 dark:text-red-400";
		case "pending":
		default:
			return "text-amber-700 dark:text-amber-400";
	}
}

export function MigrationStatusTable({
	status,
	isLoading = false,
	onRowClick,
}: {
	status: MigrationStatusRow[];
	isLoading?: boolean;
	onRowClick?: (tag: string) => void;
}) {
	return (
		<div className="space-y-3" data-testid="migration-status-table">
			<div className="overflow-x-auto rounded border">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
						<tr>
							<th className="px-3 py-2 text-left w-16">Idx</th>
							<th className="px-3 py-2 text-left">Tag</th>
							<th className="px-3 py-2 text-left">State</th>
							<th className="px-3 py-2 text-center">In journal</th>
							<th className="px-3 py-2 text-center">Applied in DB</th>
							<th className="px-3 py-2 text-right">View SQL</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td
									className="px-3 py-6 text-center text-muted-foreground"
									colSpan={6}
								>
									Loading…
								</td>
							</tr>
						) : status.length === 0 ? (
							<tr>
								<td
									className="px-3 py-6 text-center text-muted-foreground"
									colSpan={6}
									data-testid="migration-status-empty"
								>
									No migrations recorded.
								</td>
							</tr>
						) : (
							status.map((r) => (
								<tr
									key={r.tag}
									className="border-t hover:bg-muted/30 cursor-pointer"
									data-testid="migration-status-row"
									onClick={() => onRowClick?.(r.tag)}
								>
									<td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
										{r.inJournal ? r.idx : "—"}
									</td>
									<td className="px-3 py-2 font-mono text-xs">{r.tag}</td>
									<td className="px-3 py-2 whitespace-nowrap">
										<Badge
											variant={variantFor(r.state)}
											className={classFor(r.state)}
											data-testid={`migration-state-${r.state}`}
										>
											{r.state}
										</Badge>
									</td>
									<td className="px-3 py-2 text-center text-xs">
										{r.inJournal ? "✓" : "—"}
									</td>
									<td className="px-3 py-2 text-center text-xs">
										{r.appliedInDb ? "✓" : "—"}
									</td>
									<td className="px-3 py-2 text-right">
										<button
											type="button"
											className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
											onClick={(e) => {
												e.stopPropagation();
												onRowClick?.(r.tag);
											}}
											data-testid={`migration-view-${r.tag}`}
										>
											View
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
