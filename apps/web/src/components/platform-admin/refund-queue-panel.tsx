/**
 * Platform Admin — Refund queue panel (Plan F.3.5 — Agent G).
 *
 * Stateless table of recent tenant-invoice refunds, joined to org + actor.
 * Source: `admin_session_actions` rows where `action_type = 'tenant_invoice_refund'`.
 */

import { Link } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

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

function reasonClass(reason: string): string {
	if (reason === "fraudulent") return "border-red-200 bg-red-50 text-red-700";
	if (reason === "duplicate")
		return "border-yellow-200 bg-yellow-50 text-yellow-800";
	return "border-border bg-muted text-muted-foreground";
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
			<EmptyState
				icon={Undo2}
				title="No refunds"
				description="No refunds issued in the platform audit log."
				data-testid="refund-queue-empty"
			/>
		);
	}
	return (
		<div
			className="overflow-hidden rounded-xl border border-border bg-card"
			data-testid="refund-queue-panel"
		>
			<Table>
				<TableHeader>
					<TableRow className="bg-white">
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Tenant
						</TableHead>
						<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Amount
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Reason
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Refunded by
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							When
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{refunds.map((r) => (
						<TableRow
							key={r.refundId}
							className="hover:bg-muted/30"
							data-testid={`refund-row-${r.refundId}`}
						>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<Link
									to="/dashboard/platform-admin/tenants/$id"
									params={{ id: r.orgId }}
									className="hover:underline truncate"
									data-testid={`refund-org-link-${r.refundId}`}
								>
									{r.orgName}
								</Link>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right font-mono tabular-nums text-red-700">
								-{fmtCents(r.amountCents)}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<Badge variant="outline" className={reasonClass(r.reason)}>
									{r.reason.replace(/_/g, " ")}
								</Badge>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-muted-foreground truncate">
								{r.actorEmail ?? "—"}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-muted-foreground">
								{fmtDate(r.refundedAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
