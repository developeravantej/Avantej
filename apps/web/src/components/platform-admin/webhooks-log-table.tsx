/**
 * Platform Admin — Webhooks Log Table (Plan F.4 — Agent Wh).
 *
 * Stateless paginated table for processed_webhook_events. Parent owns
 * fetching, filter state, and pagination handlers.
 */

import { Webhook } from "lucide-react";
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

export type WebhookLogRow = {
	id: string;
	eventId: string;
	eventType: string;
	source: string;
	receivedAt: string;
	processedAt: string | null;
	attempts: number;
	status: "succeeded" | "failed" | "pending";
	error: string | null;
};

function fmtDate(iso: string): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function statusClass(status: "succeeded" | "failed" | "pending"): string {
	switch (status) {
		case "succeeded":
			return "border-green-300 bg-green-50 text-green-700";
		case "failed":
			return "border-red-200 bg-red-50 text-red-700";
		case "pending":
		default:
			return "border-yellow-300 bg-yellow-50 text-yellow-800";
	}
}

export function WebhooksLogTable({
	rows,
	total,
	page,
	limit,
	isLoading = false,
	onPageChange,
}: {
	rows: WebhookLogRow[];
	total: number;
	page: number;
	limit: number;
	isLoading?: boolean;
	onPageChange?: (page: number) => void;
}) {
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const canPrev = page > 1;
	const canNext = page < totalPages;

	return (
		<div className="space-y-3" data-testid="webhooks-log-table">
			<div className="overflow-hidden rounded-xl border border-brand-secondary-3">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-white">
						<TableRow className="hover:bg-transparent">
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Received
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Event type
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Source
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Status
							</TableHead>
							<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Attempts
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Event ID
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow className="hover:bg-transparent">
								<TableCell
									className="px-6 py-6 text-center text-sm text-muted-foreground"
									colSpan={6}
								>
									Loading…
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow className="hover:bg-transparent">
								<TableCell
									colSpan={6}
									className="p-0"
									data-testid="webhooks-log-empty"
								>
									<EmptyState
										icon={Webhook}
										title="No webhook events"
										description="No events match the current filters."
										context="search"
									/>
								</TableCell>
							</TableRow>
						) : (
							rows.map((r) => (
								<TableRow
									key={r.eventId}
									className="hover:bg-muted/30"
									data-testid="webhooks-log-row"
								>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap font-mono text-xs">
										{fmtDate(r.receivedAt)}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{r.eventType}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-muted-foreground">
										{r.source}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge
											variant="outline"
											className={statusClass(r.status)}
										>
											{r.status}
										</Badge>
										{r.error ? (
											<div
												className="mt-0.5 text-[11px] text-red-700 truncate max-w-[24ch]"
												title={r.error}
											>
												{r.error}
											</div>
										) : null}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm text-right tabular-nums">
										{r.attempts}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm font-mono text-xs text-muted-foreground truncate max-w-[22ch]">
										{r.eventId}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<div data-testid="webhooks-log-total">
					{total === 0
						? "0 events"
						: `Showing ${(page - 1) * limit + 1}–${Math.min(
								page * limit,
								total,
							)} of ${total}`}
				</div>
				<div className="flex items-center gap-2">
					<span>
						Page {page} of {totalPages}
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={!canPrev || isLoading}
						onClick={() => onPageChange?.(page - 1)}
						data-testid="webhooks-log-prev"
					>
						Prev
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={!canNext || isLoading}
						onClick={() => onPageChange?.(page + 1)}
						data-testid="webhooks-log-next"
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
