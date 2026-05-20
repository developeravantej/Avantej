/**
 * Platform Admin — Renewals Calendar (Plan F.4 — Agent Re).
 *
 * Read-only 90-day forward view of subscription renewals across all tenants
 * at /dashboard/platform-admin/renewals. Helps ops anticipate which tenants
 * need outreach before auto-renew or to chase past-due accounts.
 *
 * Layout:
 *   - 4 KPI tiles (renewals in window, MRR passing, MRR at risk, past-due count)
 *   - Past-due section (red banner) if any
 *   - Weekly calendar grid via <RenewalsCalendarGrid />
 */

import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCallout } from "@/components/ui/status-callout";
import { client } from "@/utils/orpc";
import { BigNumberCard } from "@/components/platform-admin/big-number-card";
import { RenewalsCalendarGrid } from "@/components/platform-admin/renewals-calendar-grid";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/renewals",
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
	component: PlatformAdminRenewalsPage,
});

function fmtCents(cents: number): string {
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function fmtDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function PlatformAdminRenewalsPage() {
	const calendarQ = useQuery({
		queryKey: ["platformAdminRenewals", "getCalendar", 90],
		queryFn: () => client.platformAdminRenewals.getCalendar({ daysAhead: 90 }),
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	return (
		<div className="p-6 space-y-6" data-testid="renewals-page">
			<header className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Renewals</h1>
					<p className="text-sm text-muted-foreground mt-1">
						90-day window of upcoming subscription renewals. MRR figures use
						placeholder tier prices.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => calendarQ.refetch()}
					disabled={calendarQ.isFetching}
					data-testid="renewals-refresh-btn"
				>
					{calendarQ.isFetching ? "Refreshing…" : "Refresh"}
				</Button>
			</header>

			{calendarQ.error ? (
				<StatusCallout
					variant="error"
					title="Could not load renewals"
					message={(calendarQ.error as Error).message}
					onRetry={() => calendarQ.refetch()}
				/>
			) : null}

			{/* KPI row */}
			{calendarQ.isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : calendarQ.data ? (
				<div
					className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
					data-testid="renewals-kpi-row"
				>
					<BigNumberCard
						title="Renewals in window"
						value={calendarQ.data.summary.totalRenewalsInWindow}
						subLabel="Subscriptions ending in next 90 days"
						testId="kpi-renewals-total"
					/>
					<BigNumberCard
						title="MRR passing"
						value={fmtCents(calendarQ.data.summary.totalMrrPassingCents)}
						band="green"
						subLabel="From renewals not flagged to cancel"
						testId="kpi-mrr-passing"
					/>
					<BigNumberCard
						title="MRR at risk"
						value={fmtCents(calendarQ.data.summary.totalMrrAtRiskCents)}
						band={
							calendarQ.data.summary.totalMrrAtRiskCents > 0
								? "amber"
								: "neutral"
						}
						subLabel="Cancel at period end"
						testId="kpi-mrr-at-risk"
					/>
					<BigNumberCard
						title="Past-due"
						value={calendarQ.data.summary.pastDueCount}
						band={
							calendarQ.data.summary.pastDueCount > 0 ? "red" : "neutral"
						}
						subLabel="Past_due or unpaid right now"
						testId="kpi-past-due"
					/>
				</div>
			) : null}

			{/* Past-due section (above calendar — needs attention first). */}
			{calendarQ.data && calendarQ.data.pastDue.length > 0 ? (
				<Card
					className="border-red-200 bg-red-50/50"
					data-testid="past-due-section"
				>
					<CardHeader className="pb-2">
						<CardTitle className="text-base text-red-700">
							Needs attention — past-due / unpaid
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<ul className="divide-y divide-border">
							{calendarQ.data.pastDue.map((p) => (
								<li
									key={p.orgId}
									className="py-2 flex items-center justify-between gap-3"
									data-testid="past-due-row"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<Link
												to="/dashboard/platform-admin/tenants/$id"
												params={{ id: p.orgId }}
												className="font-medium hover:underline truncate"
											>
												{p.orgName}
											</Link>
											<Badge
												variant="secondary"
												className="capitalize"
												data-testid="past-due-tier-badge"
											>
												{p.tier}
											</Badge>
											<Badge
												variant="outline"
												className="border-red-200 bg-red-50 text-red-700 capitalize"
												data-testid="past-due-status-badge"
											>
												{p.status.replace("_", " ")}
											</Badge>
										</div>
										<div className="text-xs text-muted-foreground mt-0.5">
											Period ended {fmtDate(p.currentPeriodEnd)}
										</div>
									</div>
									<div className="text-sm font-semibold font-mono tabular-nums text-red-700">
										{fmtCents(p.mrrCents)}
									</div>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}

			{/* Weekly calendar grid */}
			{calendarQ.isLoading ? (
				<div className="space-y-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-32 w-full" />
					))}
				</div>
			) : calendarQ.data ? (
				<RenewalsCalendarGrid weeks={calendarQ.data.weeks} />
			) : null}
		</div>
	);
}
