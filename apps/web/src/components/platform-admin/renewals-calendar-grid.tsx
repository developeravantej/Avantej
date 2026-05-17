/**
 * Platform Admin — Renewals Calendar Grid (Plan F.4 — Agent Re).
 *
 * Stacks weekly buckets of upcoming subscription renewals in a read-only
 * timeline. Each week card lists per-org renewals with tier, MRR, days-until
 * and a warning chip when `cancelAtPeriodEnd` is set.
 *
 * Pure presentation — data comes from `platformAdminRenewals.getCalendar`.
 */

import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Renewal = {
	orgId: string;
	orgName: string;
	tier: string;
	mrrCents: number;
	currentPeriodEnd: string;
	status: string;
	cancelAtPeriodEnd: boolean;
	daysUntil: number;
};

export type Week = {
	weekStartISO: string;
	weekEndISO: string;
	renewals: Renewal[];
	totalMrrAtRiskCents: number;
	totalMrrPassingCents: number;
};

function fmtCents(cents: number): string {
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function fmtWeek(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function fmtDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

export function RenewalsCalendarGrid({ weeks }: { weeks: Week[] }) {
	if (weeks.length === 0) {
		return (
			<div
				className="text-sm text-muted-foreground p-6 text-center border rounded-md"
				data-testid="renewals-calendar-empty"
			>
				No weeks in window.
			</div>
		);
	}

	return (
		<div className="space-y-3" data-testid="renewals-calendar-grid">
			{weeks.map((w) => (
				<Card key={w.weekStartISO} data-testid="renewals-week-card">
					<CardHeader className="pb-2">
						<div className="flex items-baseline justify-between gap-3">
							<CardTitle className="text-base">
								Week of {fmtWeek(w.weekStartISO)}
							</CardTitle>
							<div className="text-xs text-muted-foreground tabular-nums flex items-center gap-3">
								<span className="text-green-700 dark:text-green-400">
									Passing {fmtCents(w.totalMrrPassingCents)}
								</span>
								{w.totalMrrAtRiskCents > 0 ? (
									<span className="text-amber-700 dark:text-amber-400">
										At risk {fmtCents(w.totalMrrAtRiskCents)}
									</span>
								) : null}
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						{w.renewals.length === 0 ? (
							<div className="text-xs text-muted-foreground py-2">
								No renewals this week
							</div>
						) : (
							<ul className="divide-y">
								{w.renewals.map((r) => (
									<li
										key={`${r.orgId}-${r.currentPeriodEnd}`}
										className="py-2 flex items-center justify-between gap-3"
										data-testid="renewal-row"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 flex-wrap">
												<Link
													to="/dashboard/platform-admin/tenants/$id"
													params={{ id: r.orgId }}
													className="font-medium hover:underline truncate"
												>
													{r.orgName}
												</Link>
												<span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground capitalize">
													{r.tier}
												</span>
												{r.cancelAtPeriodEnd ? (
													<span
														className="text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
														data-testid="renewal-at-risk-chip"
													>
														Cancels at period end
													</span>
												) : null}
												{r.status !== "active" &&
												r.status !== "trialing" ? (
													<span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 capitalize">
														{r.status.replace("_", " ")}
													</span>
												) : null}
											</div>
											<div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
												Renews {fmtDate(r.currentPeriodEnd)} · in{" "}
												{r.daysUntil} day{r.daysUntil === 1 ? "" : "s"}
											</div>
										</div>
										<div
											className={`text-sm font-semibold tabular-nums ${
												r.cancelAtPeriodEnd
													? "text-amber-700 dark:text-amber-400"
													: "text-foreground"
											}`}
										>
											{fmtCents(r.mrrCents)}
										</div>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
