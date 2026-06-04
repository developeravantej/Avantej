/**
 * Platform Admin — Recent invoices (cross-tenant) panel (Plan F.3.5 — Agent G).
 *
 * Stateless table. Parent passes the projected invoices and owns the loading
 * / error / empty states.
 */

import { Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
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

export type CrossTenantInvoice = {
	orgId: string;
	orgName: string;
	invoiceId: string;
	invoiceNumber: string | null;
	amountPaid: number;
	status: string | null;
	currency: string;
	createdAt: Date | string;
};

function fmtCents(cents: number, currency: string): string {
	const sign = cents < 0 ? "-" : "";
	return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})} ${currency.toUpperCase()}`;
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

function statusClass(status: string | null): string {
	if (status === "paid") return "border-green-200 bg-green-50 text-green-700";
	if (status === "open" || status === "uncollectible")
		return "border-yellow-200 bg-yellow-50 text-yellow-800";
	return "border-border bg-muted text-muted-foreground";
}

export function RecentInvoicesPanel({
	invoices,
	isLoading,
}: {
	invoices: CrossTenantInvoice[];
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<div
				className="text-sm text-muted-foreground p-4"
				data-testid="recent-invoices-loading"
			>
				Loading invoices…
			</div>
		);
	}
	if (invoices.length === 0) {
		return (
			<EmptyState
				icon={Receipt}
				title="No recent invoices"
				description="Either no tenants have charged Stripe yet, or Stripe is unavailable in this environment."
				data-testid="recent-invoices-empty"
			/>
		);
	}
	return (
		<div
			className="overflow-hidden rounded-xl border border-border bg-card"
			data-testid="recent-invoices-panel"
		>
			<Table>
				<TableHeader>
					<TableRow className="bg-white">
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Tenant
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Invoice
						</TableHead>
						<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Amount
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Status
						</TableHead>
						<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							When
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{invoices.map((inv) => (
						<TableRow
							key={inv.invoiceId}
							className="hover:bg-muted/30"
							data-testid={`recent-invoice-row-${inv.invoiceId}`}
						>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<Link
									to="/dashboard/platform-admin/tenants/$id"
									params={{ id: inv.orgId }}
									className="hover:underline truncate"
									data-testid={`recent-invoice-org-link-${inv.invoiceId}`}
								>
									{inv.orgName}
								</Link>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap font-mono text-xs">
								{inv.invoiceNumber ?? inv.invoiceId}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right font-mono tabular-nums">
								{fmtCents(inv.amountPaid, inv.currency)}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<Badge variant="outline" className={statusClass(inv.status)}>
									{inv.status ?? "—"}
								</Badge>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-muted-foreground">
								{fmtDate(inv.createdAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
