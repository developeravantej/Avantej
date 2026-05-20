/**
 * Platform Admin — Global Billing (Plan F.3.5 — Agent G).
 *
 * Cross-tenant billing overview at /dashboard/platform-admin/billing.
 * Live Stripe reads via `platformAdminBilling.getOverview` (per ADR-0033).
 *
 * Layout:
 *   - 4 KPI tiles (active subs, MRR, refunds 30d, active coupons)
 *   - Tabs: Recent invoices / Refund queue / Coupons
 */

import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { client } from "@/utils/orpc";
import { BigNumberCard } from "@/components/platform-admin/big-number-card";
import { RecentInvoicesPanel } from "@/components/platform-admin/recent-invoices-panel";
import { RefundQueuePanel } from "@/components/platform-admin/refund-queue-panel";
import {
	CouponListPanel,
	type Coupon,
} from "@/components/platform-admin/coupon-list-panel";
import {
	CouponCreateDialog,
	type CouponCreateInput,
} from "@/components/platform-admin/coupon-create-dialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/billing",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminBillingPage,
});

function fmtCents(cents: number): string {
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function PlatformAdminBillingPage() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);

	const meQ = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
		staleTime: 30_000,
	});
	const isSuperAdmin =
		meQ.data?.isPlatformAdmin === true && meQ.data?.role === "super_admin";

	const overviewQ = useQuery({
		queryKey: ["platformAdminBilling", "getOverview"],
		queryFn: () => client.platformAdminBilling.getOverview({}),
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	const createMutation = useMutation({
		mutationFn: (input: CouponCreateInput) =>
			client.platformAdminCoupons.createCoupon(input),
		onSuccess: () => {
			setCreateOpen(false);
			qc.invalidateQueries({
				queryKey: ["platformAdminBilling", "getOverview"],
			});
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (couponId: string) =>
			client.platformAdminCoupons.deleteCoupon({ couponId }),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["platformAdminBilling", "getOverview"],
			});
		},
	});

	// Narrow coupon list to the shape CouponListPanel expects (no `createdAt`).
	const coupons: Coupon[] = useMemo(() => {
		const raw = overviewQ.data?.activeCoupons ?? [];
		return raw.map((c) => ({
			id: c.id,
			name: c.name,
			percentOff: c.percentOff,
			amountOff: c.amountOff,
			currency: c.currency,
			duration: c.duration,
			durationInMonths: null,
			maxRedemptions: null,
			timesRedeemed: c.timesRedeemed,
			valid: c.valid,
		}));
	}, [overviewQ.data]);

	return (
		<div className="p-6 space-y-6" data-testid="billing-global-page">
			<header className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Billing</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Live across all tenants — read-only. Cross-tenant invoice fetch
						scales with active customer count; consider a mirror table once
						tenant count exceeds ~50 (ADR-0033).
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => overviewQ.refetch()}
					disabled={overviewQ.isFetching}
					data-testid="billing-refresh-btn"
				>
					{overviewQ.isFetching ? "Refreshing…" : "Refresh"}
				</Button>
			</header>

			{overviewQ.error ? (
				<StatusCallout
					variant="error"
					title="Could not load billing overview"
					message={(overviewQ.error as Error).message}
					onRetry={() => overviewQ.refetch()}
				/>
			) : null}

			{!overviewQ.data?.stripeAvailable && overviewQ.data ? (
				<StatusCallout
					variant="warning"
					message="Stripe API appears unavailable in this environment. Invoice + coupon data may be incomplete."
				/>
			) : null}

			{/* KPI row */}
			{overviewQ.isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : overviewQ.data ? (
				<div
					className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
					data-testid="billing-kpi-row"
				>
					<BigNumberCard
						title="Active subs"
						value={overviewQ.data.kpis.activeSubsCount}
						testId="kpi-active-subs"
					/>
					<BigNumberCard
						title="MRR (estimate)"
						value={fmtCents(overviewQ.data.kpis.mrr.cents)}
						subLabel="From subscription tier × placeholder prices"
						band="green"
						testId="kpi-mrr"
					/>
					<BigNumberCard
						title="Refunds (30d)"
						value={overviewQ.data.kpis.refundsLast30dCount}
						subLabel={
							overviewQ.data.kpis.refundsLast30dAmountCents > 0
								? fmtCents(
										overviewQ.data.kpis.refundsLast30dAmountCents,
									)
								: "no refunds"
						}
						band={
							overviewQ.data.kpis.refundsLast30dCount > 0 ? "amber" : "neutral"
						}
						testId="kpi-refunds"
					/>
					<BigNumberCard
						title="Active coupons"
						value={overviewQ.data.kpis.couponsCount}
						testId="kpi-coupons"
					/>
				</div>
			) : null}

			{/* Tabs */}
			<Tabs defaultValue="invoices" className="space-y-4">
				<TabsList data-testid="billing-tabs-list">
					<TabsTrigger value="invoices" data-testid="billing-tab-invoices">
						Recent invoices
					</TabsTrigger>
					<TabsTrigger value="refunds" data-testid="billing-tab-refunds">
						Refund queue
					</TabsTrigger>
					<TabsTrigger value="coupons" data-testid="billing-tab-coupons">
						Coupons
					</TabsTrigger>
				</TabsList>

				<TabsContent value="invoices">
					<Card>
						<CardHeader>
							<CardTitle>Recent invoices (top 20 across all tenants)</CardTitle>
						</CardHeader>
						<CardContent>
							<RecentInvoicesPanel
								invoices={overviewQ.data?.recentInvoices ?? []}
								isLoading={overviewQ.isLoading}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="refunds">
					<Card>
						<CardHeader>
							<CardTitle>Refund queue (last 20)</CardTitle>
						</CardHeader>
						<CardContent>
							<RefundQueuePanel
								refunds={overviewQ.data?.recentRefunds ?? []}
								isLoading={overviewQ.isLoading}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="coupons">
					<Card>
						<CardContent className="p-4">
							<CouponListPanel
								coupons={coupons}
								isSuperAdmin={isSuperAdmin}
								onCreate={() => setCreateOpen(true)}
								onDelete={(couponId) =>
									deleteMutation.mutate(couponId)
								}
								isLoading={overviewQ.isLoading}
							/>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{isSuperAdmin ? (
				<CouponCreateDialog
					open={createOpen}
					onClose={() => setCreateOpen(false)}
					onSubmit={(input) => createMutation.mutate(input)}
					isPending={createMutation.isPending}
				/>
			) : null}
		</div>
	);
}
