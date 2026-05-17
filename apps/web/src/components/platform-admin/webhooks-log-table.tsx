/**
 * Platform Admin — Webhooks Log Table (Plan F.4 — Agent Wh).
 *
 * Stateless paginated table for processed_webhook_events. Parent owns
 * fetching, filter state, and pagination handlers.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

function statusVariant(
	status: "succeeded" | "failed" | "pending",
): "default" | "destructive" | "outline" | "secondary" {
	switch (status) {
		case "succeeded":
			return "default";
		case "failed":
			return "destructive";
		case "pending":
		default:
			return "secondary";
	}
}

function statusClass(status: "succeeded" | "failed" | "pending"): string {
	switch (status) {
		case "succeeded":
			return "text-emerald-700 dark:text-emerald-400";
		case "failed":
			return "text-red-700 dark:text-red-400";
		case "pending":
		default:
			return "text-amber-700 dark:text-amber-400";
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
			<div className="overflow-x-auto rounded border">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
						<tr>
							<th className="px-3 py-2 text-left">Received</th>
							<th className="px-3 py-2 text-left">Event type</th>
							<th className="px-3 py-2 text-left">Source</th>
							<th className="px-3 py-2 text-left">Status</th>
							<th className="px-3 py-2 text-right">Attempts</th>
							<th className="px-3 py-2 text-left">Event ID</th>
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
						) : rows.length === 0 ? (
							<tr>
								<td
									className="px-3 py-6 text-center text-muted-foreground"
									colSpan={6}
									data-testid="webhooks-log-empty"
								>
									No webhook events match the current filters.
								</td>
							</tr>
						) : (
							rows.map((r) => (
								<tr
									key={r.eventId}
									className="border-t hover:bg-muted/30"
									data-testid="webhooks-log-row"
								>
									<td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
										{fmtDate(r.receivedAt)}
									</td>
									<td className="px-3 py-2 whitespace-nowrap">
										{r.eventType}
									</td>
									<td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
										{r.source}
									</td>
									<td className="px-3 py-2 whitespace-nowrap">
										<Badge
											variant={statusVariant(r.status)}
											className={statusClass(r.status)}
										>
											{r.status}
										</Badge>
										{r.error ? (
											<div
												className="mt-0.5 text-[11px] text-red-700 dark:text-red-400 truncate max-w-[24ch]"
												title={r.error}
											>
												{r.error}
											</div>
										) : null}
									</td>
									<td className="px-3 py-2 text-right tabular-nums">
										{r.attempts}
									</td>
									<td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate max-w-[22ch]">
										{r.eventId}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
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
