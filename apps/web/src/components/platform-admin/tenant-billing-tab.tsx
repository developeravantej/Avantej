/**
 * Platform Admin — Tenant Billing tab (Plan F.3-A).
 *
 * Customer summary card + paginated invoice list + refund flow.
 * Refund is super_admin only. Empty state when tenant has no Stripe
 * customer yet (trialing).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import type { Tier } from "@avantej-core/types";
import { client } from "@/utils/orpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceList, type Invoice } from "./invoice-list";
import {
	RefundConfirmDialog,
	type RefundInput,
} from "./refund-confirm-dialog";
import { TierChangeCard } from "./tier-change-card";

export function TenantBillingTab({
	organizationId,
	isSuperAdmin,
}: {
	organizationId: string;
	isSuperAdmin: boolean;
}) {
	const qc = useQueryClient();
	const summaryKey = [
		"platformAdminTenants",
		"billing",
		"getCustomerSummary",
		organizationId,
	] as const;
	const invoicesKey = [
		"platformAdminTenants",
		"billing",
		"listInvoices",
		organizationId,
	] as const;

	const summary = useQuery({
		queryKey: summaryKey,
		queryFn: () =>
			client.platformAdminTenants.billing.getCustomerSummary({
				organizationId,
			}),
	});

	// Tier — sourced from getTenantDetail. Tolerant of dev-DB 500 (known issue):
	// when the query fails, TierChangeCard is hidden but Billing tab still
	// renders the customer summary + invoice list.
	const tenantDetail = useQuery({
		queryKey: [
			"platformAdminTenants",
			"getTenantDetail",
			"forTier",
			organizationId,
		] as const,
		queryFn: () =>
			client.platformAdminTenants.getTenantDetail({ organizationId }),
		retry: false,
	});
	const currentTier: Tier | null = (() => {
		const t = tenantDetail.data?.subscription?.tier;
		if (t === "basic" || t === "professional" || t === "enterprise") return t;
		return null;
	})();

	const [cursor, setCursor] = useState<string | undefined>(undefined);
	const [accumulated, setAccumulated] = useState<Invoice[]>([]);

	const invoices = useQuery({
		queryKey: [...invoicesKey, cursor ?? "first"],
		queryFn: async () => {
			const result = await client.platformAdminTenants.billing.listInvoices({
				organizationId,
				limit: 20,
				startingAfter: cursor,
			});
			return result;
		},
	});

	// Stitch paginated pages.
	const allInvoices: Invoice[] = cursor
		? [...accumulated, ...((invoices.data?.invoices as Invoice[]) ?? [])]
		: ((invoices.data?.invoices as Invoice[]) ?? []);

	const [refundTarget, setRefundTarget] = useState<Invoice | null>(null);

	const refundMutation = useMutation({
		mutationFn: (args: { invoiceId: string } & RefundInput) =>
			client.platformAdminTenants.billing.refundInvoice({
				organizationId,
				invoiceId: args.invoiceId,
				amountCents: args.amountCents,
				reason: args.reason,
				notes: args.notes,
			}),
		onSuccess: (r) => {
			toast.success(`Refund issued (${r.refundId})`);
			setRefundTarget(null);
			// Reset pagination + refetch.
			setCursor(undefined);
			setAccumulated([]);
			qc.invalidateQueries({ queryKey: invoicesKey });
		},
		onError: (e: unknown) =>
			toast.error(`Refund failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const noCustomer =
		summary.data !== undefined && summary.data.stripeCustomerId === null;

	return (
		<div className="space-y-4" data-testid="tenant-billing-tab">
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<CreditCard className="h-4 w-4" />
						Customer summary
					</CardTitle>
				</CardHeader>
				<CardContent className="text-sm space-y-1">
					{summary.isLoading ? (
						<div className="text-muted-foreground">Loading…</div>
					) : summary.error ? (
						<div className="text-destructive text-xs">
							{(summary.error as Error)?.message ?? "Failed to load"}
						</div>
					) : noCustomer ? (
						<div className="text-muted-foreground">
							No Stripe customer record yet. This tenant has not been charged.
						</div>
					) : summary.data ? (
						<>
							<div className="text-xs font-mono break-all text-muted-foreground">
								{summary.data.stripeCustomerId}
							</div>
							<div>
								{summary.data.defaultPaymentMethod ? (
									<Badge variant="outline">
										{summary.data.defaultPaymentMethod.brand} ••••{" "}
										{summary.data.defaultPaymentMethod.last4}
									</Badge>
								) : (
									<span className="text-muted-foreground">
										No default payment method on file.
									</span>
								)}
							</div>
							{summary.data.balance !== 0 && (
								<div className="text-xs text-muted-foreground">
									Account balance:{" "}
									{(summary.data.balance / 100).toFixed(2)}{" "}
									{summary.data.currency.toUpperCase()}
								</div>
							)}
						</>
					) : null}
				</CardContent>
			</Card>

			{currentTier ? (
				<TierChangeCard
					organizationId={organizationId}
					currentTier={currentTier}
					isSuperAdmin={isSuperAdmin}
					onChanged={() => {
						qc.invalidateQueries({ queryKey: invoicesKey });
						qc.invalidateQueries({
							queryKey: [
								"platformAdminTenants",
								"getTenantDetail",
								"forTier",
								organizationId,
							],
						});
					}}
				/>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Invoices</CardTitle>
				</CardHeader>
				<CardContent>
					{invoices.isLoading && allInvoices.length === 0 ? (
						<div className="text-sm text-muted-foreground p-4">
							Loading invoices…
						</div>
					) : invoices.error ? (
						<div className="text-destructive text-xs p-4">
							{(invoices.error as Error)?.message ?? "Failed to load invoices"}
						</div>
					) : noCustomer ? (
						<div
							className="text-sm text-muted-foreground p-4"
							data-testid="invoice-list-empty"
						>
							No Stripe customer record. This tenant hasn't been charged yet.
						</div>
					) : (
						<InvoiceList
							invoices={allInvoices}
							onRefundClick={(inv) => setRefundTarget(inv)}
							isSuperAdmin={isSuperAdmin}
							hasMore={invoices.data?.hasMore ?? false}
							isLoadingMore={invoices.isFetching && Boolean(cursor)}
							onLoadMore={() => {
								if (invoices.data?.nextCursor) {
									setAccumulated(allInvoices);
									setCursor(invoices.data.nextCursor);
								}
							}}
						/>
					)}
				</CardContent>
			</Card>

			<RefundConfirmDialog
				open={refundTarget !== null}
				invoice={refundTarget}
				onClose={() => setRefundTarget(null)}
				isPending={refundMutation.isPending}
				onConfirm={(input) => {
					if (!refundTarget) return;
					refundMutation.mutate({
						invoiceId: refundTarget.id,
						...input,
					});
				}}
			/>
		</div>
	);
}
