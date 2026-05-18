/**
 * Platform Admin — Recent invoices (cross-tenant) panel (Plan F.3.5 — Agent G).
 *
 * Stateless table. Parent passes the projected invoices and owns the loading
 * / error / empty states.
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

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

function statusBand(status: string | null): string {
	if (!status) return "text-muted-foreground";
	if (status === "paid") return "text-emerald-700 dark:text-emerald-400";
	if (status === "open" || status === "uncollectible")
		return "text-amber-700 dark:text-amber-400";
	if (status === "void") return "text-muted-foreground";
	return "text-foreground";
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
			<div
				className="text-sm text-muted-foreground p-6 border rounded-md text-center"
				data-testid="recent-invoices-empty"
			>
				No recent invoices. Either no tenants have charged Stripe yet, or
				Stripe is unavailable in this environment.
			</div>
		);
	}
	return (
		<div
			className="border rounded-md overflow-hidden"
			data-testid="recent-invoices-panel"
		>
			<table className="w-full text-sm">
				<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th className="text-left p-2">Tenant</th>
						<th className="text-left p-2">Invoice</th>
						<th className="text-right p-2">Amount</th>
						<th className="text-left p-2">Status</th>
						<th className="text-left p-2">When</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{invoices.map((inv) => (
						<tr
							key={inv.invoiceId}
							data-testid={`recent-invoice-row-${inv.invoiceId}`}
						>
							<td className="p-2">
								<Link
									to="/dashboard/platform-admin/tenants/$id"
									params={{ id: inv.orgId }}
									className="hover:underline truncate"
									data-testid={`recent-invoice-org-link-${inv.invoiceId}`}
								>
									{inv.orgName}
								</Link>
							</td>
							<td className="p-2 font-mono text-xs">
								{inv.invoiceNumber ?? inv.invoiceId}
							</td>
							<td className="p-2 text-right tabular-nums">
								{fmtCents(inv.amountPaid, inv.currency)}
							</td>
							<td className="p-2">
								<Badge
									variant="outline"
									className={`${statusBand(inv.status)} border-current/30`}
								>
									{inv.status ?? "—"}
								</Badge>
							</td>
							<td className="p-2 text-muted-foreground">
								{fmtDate(inv.createdAt)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
