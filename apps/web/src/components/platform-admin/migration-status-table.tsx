/**
 * Platform Admin — Migration Status Table (Plan F.4 — Agent Mi).
 *
 * Stateless read-only table joining drizzle journal + applied tracking-table
 * rows into a single per-tag view. Click a row to view the migration SQL via
 * the parent's `onRowClick` handler (opens a Dialog with the .sql content).
 *
 * NO apply button. Surface only. Applying migrations remains a CLI-only path.
 */

import { GitCommitHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

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
			return "outline";
		case "orphaned":
			return "destructive";
		case "pending":
		default:
			return "outline";
	}
}

function classFor(state: MigrationStatusRow["state"]): string {
	switch (state) {
		case "applied":
			return "border-green-200 bg-green-50 text-green-700";
		case "orphaned":
			return "";
		case "pending":
		default:
			return "border-yellow-200 bg-yellow-50 text-yellow-800";
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
		<div
			className="flex h-full flex-col"
			data-testid="migration-status-table"
		>
			<div className="flex-1 overflow-y-auto">
				<Table>
					<TableHeader>
						<TableRow className="sticky top-0 z-10 bg-white hover:bg-white">
							<TableHead className="w-16 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Idx
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Tag
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								State
							</TableHead>
							<TableHead className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
								In journal
							</TableHead>
							<TableHead className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Applied in DB
							</TableHead>
							<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
								View SQL
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell
									className="px-6 py-6 text-center text-muted-foreground"
									colSpan={6}
								>
									Loading…
								</TableCell>
							</TableRow>
						) : status.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="p-0">
									<EmptyState
										icon={GitCommitHorizontal}
										title="No migrations recorded"
										data-testid="migration-status-empty"
									/>
								</TableCell>
							</TableRow>
						) : (
							status.map((r) => (
								<TableRow
									key={r.tag}
									className="cursor-pointer hover:bg-muted/30"
									data-testid="migration-status-row"
									onClick={() => onRowClick?.(r.tag)}
								>
									<TableCell className="px-6 py-4 font-mono text-sm tabular-nums whitespace-nowrap text-muted-foreground">
										{r.inJournal ? r.idx : "—"}
									</TableCell>
									<TableCell className="px-6 py-4 font-mono text-sm whitespace-nowrap">
										{r.tag}
									</TableCell>
									<TableCell className="px-6 py-4 whitespace-nowrap">
										<Badge
											variant={variantFor(r.state)}
											className={classFor(r.state)}
											data-testid={`migration-state-${r.state}`}
										>
											{r.state}
										</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-center text-sm whitespace-nowrap">
										{r.inJournal ? "✓" : "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-center text-sm whitespace-nowrap">
										{r.appliedInDb ? "✓" : "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-right whitespace-nowrap">
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												onRowClick?.(r.tag);
											}}
											data-testid={`migration-view-${r.tag}`}
										>
											View
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
