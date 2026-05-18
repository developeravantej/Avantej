/**
 * Platform Admin — Refund queue panel (Plan F.3.5 — Agent G).
 *
 * Stateless table of recent tenant-invoice refunds, joined to org + actor.
 * Source: `admin_session_actions` rows where `action_type = 'tenant_invoice_refund'`.
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export type RecentRefund = {
	refundId: string;
	orgId: string;
	orgName: string;
	amountCents: number;
	reason: string;
	refundedAt: Date | string;
	actorEmail: string | null;
};

function fmtCents(cents: number): string {
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function fmtDate(d: Date | string): string {
	const dt = d instanceof Date ? d : new Date(d);
	return dt.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function reasonBadgeClass(reason: string): string {
	if (reason === "fraudulent") return "text-red-700 dark:text-red-400";
	if (reason === "duplicate") return "text-amber-700 dark:text-amber-400";
	return "text-muted-foreground";
}

export function RefundQueuePanel({
	refunds,
	isLoading,
}: {
	refunds: RecentRefund[];
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<div
				className="text-sm text-muted-foreground p-4"
				data-testid="refund-queue-loading"
			>
				Loading refunds…
			</div>
		);
	}
	if (refunds.length === 0) {
		return (
			<div
				className="text-sm text-muted-foreground p-6 border rounded-md text-center"
				data-testid="refund-queue-empty"
			>
				No refunds issued in the platform audit log.
			</div>
		);
	}
	return (
		<div
			className="border rounded-md overflow-hidden"
			data-testid="refund-queue-panel"
		>
			<table className="w-full text-sm">
				<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th className="text-left p-2">Tenant</th>
						<th className="text-right p-2">Amount</th>
						<th className="text-left p-2">Reason</th>
						<th className="text-left p-2">Refunded by</th>
						<th className="text-left p-2">When</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{refunds.map((r) => (
						<tr
							key={r.refundId}
							data-testid={`refund-row-${r.refundId}`}
						>
							<td className="p-2">
								<Link
									to="/dashboard/platform-admin/tenants/$id"
									params={{ id: r.orgId }}
									className="hover:underline truncate"
									data-testid={`refund-org-link-${r.refundId}`}
								>
									{r.orgName}
								</Link>
							</td>
							<td className="p-2 text-right tabular-nums text-red-700 dark:text-red-400">
								-{fmtCents(r.amountCents)}
							</td>
							<td className="p-2">
								<Badge
									variant="outline"
									className={`${reasonBadgeClass(r.reason)} border-current/30`}
								>
									{r.reason.replace(/_/g, " ")}
								</Badge>
							</td>
							<td className="p-2 text-muted-foreground truncate">
								{r.actorEmail ?? "—"}
							</td>
							<td className="p-2 text-muted-foreground">
								{fmtDate(r.refundedAt)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
