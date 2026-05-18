/**
 * Platform Admin — Webhooks Log (Plan F.4 — Agent Wh).
 *
 * Read-only Stripe webhook event viewer at /dashboard/platform-admin/webhooks.
 *   - 4 KPI tiles (24h count, 7d count, dupes 7d, unique types).
 *   - By-event-type rollup (7d sorted by count).
 *   - Recent events (top 20).
 *   - Paginated full log table with eventType + days filters.
 *
 * Pure DB read against processed_webhook_events. No mutations.
 */

import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";
import { BigNumberCard } from "@/components/platform-admin/big-number-card";
import { WebhooksLogTable } from "@/components/platform-admin/webhooks-log-table";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/webhooks",
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
	component: PlatformAdminWebhooksPage,
});

const ALL = "__all__";

function fmtRelative(iso: string): string {
	if (!iso) return "—";
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return iso;
	const diff = Date.now() - t;
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

function PlatformAdminWebhooksPage() {
	const [filterEventType, setFilterEventType] = useState<string>(ALL);
	const [filterDays, setFilterDays] = useState<number>(7);
	const [page, setPage] = useState<number>(1);
	const limit = 50;

	const overviewQ = useQuery({
		queryKey: ["platformAdminWebhooks", "getOverview"],
		queryFn: () => client.platformAdminWebhooks.getOverview({}),
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	const effectiveEventType =
		filterEventType === ALL ? undefined : filterEventType;

	const listQ = useQuery({
		queryKey: [
			"platformAdminWebhooks",
			"listEvents",
			effectiveEventType ?? "_all",
			filterDays,
			page,
			limit,
		],
		queryFn: () =>
			client.platformAdminWebhooks.listEvents({
				eventType: effectiveEventType,
				days: filterDays,
				limit,
				page,
			}),
		staleTime: 0,
	});

	// Resets pagination whenever a filter changes.
	const eventTypeOptions = useMemo(() => {
		const set = new Set<string>();
		for (const r of overviewQ.data?.byEventType ?? []) set.add(r.eventType);
		for (const r of overviewQ.data?.recent ?? []) set.add(r.eventType);
		return Array.from(set).sort();
	}, [overviewQ.data]);

	return (
		<div className="p-6 space-y-6" data-testid="webhooks-log-page">
			<header className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Webhooks</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Stripe event log — read-only.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						overviewQ.refetch();
						listQ.refetch();
					}}
					disabled={overviewQ.isFetching || listQ.isFetching}
					data-testid="webhooks-refresh-btn"
				>
					{overviewQ.isFetching || listQ.isFetching
						? "Refreshing…"
						: "Refresh"}
				</Button>
			</header>

			{overviewQ.error ? (
				<Card>
					<CardContent className="p-4 text-sm text-red-700 dark:text-red-400">
						Could not load webhook overview:{" "}
						{(overviewQ.error as Error).message}
					</CardContent>
				</Card>
			) : null}

			{/* KPI row */}
			{overviewQ.isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : overviewQ.data ? (
				<div
					className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
					data-testid="webhooks-kpi-row"
				>
					<BigNumberCard
						title="Last 24h"
						value={overviewQ.data.kpis.totalLast24h}
						testId="kpi-webhooks-24h"
					/>
					<BigNumberCard
						title="Last 7d"
						value={overviewQ.data.kpis.totalLast7d}
						subLabel={
							overviewQ.data.kpis.failuresLast7d > 0
								? `${overviewQ.data.kpis.failuresLast7d} failed`
								: "all succeeded"
						}
						band={overviewQ.data.kpis.failuresLast7d > 0 ? "amber" : "green"}
						testId="kpi-webhooks-7d"
					/>
					<BigNumberCard
						title="Duplicates (7d)"
						value={overviewQ.data.kpis.duplicatesLast7d}
						subLabel="attempts > 1"
						band={
							overviewQ.data.kpis.duplicatesLast7d > 0 ? "amber" : "neutral"
						}
						testId="kpi-webhooks-dupes"
					/>
					<BigNumberCard
						title="Event types"
						value={overviewQ.data.kpis.uniqueEventTypes}
						subLabel="distinct (7d)"
						testId="kpi-webhooks-types"
					/>
				</div>
			) : null}

			{/* Row 2: by-event-type + recent */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
				<Card data-testid="webhooks-by-type-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">By event type (7d)</CardTitle>
					</CardHeader>
					<CardContent>
						{overviewQ.isLoading ? (
							<Skeleton className="h-48 w-full" />
						) : overviewQ.data?.byEventType.length ? (
							<ul className="space-y-1.5 text-sm">
								{overviewQ.data.byEventType.slice(0, 12).map((row) => {
									const max = overviewQ.data!.byEventType[0]!.count || 1;
									const pct = Math.max(2, Math.round((row.count / max) * 100));
									return (
										<li
											key={row.eventType}
											className="flex items-center gap-2"
										>
											<div className="w-56 truncate">{row.eventType}</div>
											<div className="flex-1 h-3 rounded bg-muted/60 overflow-hidden">
												<div
													className="h-full bg-indigo-500/70"
													style={{ width: `${pct}%` }}
												/>
											</div>
											<div className="w-10 text-right tabular-nums text-xs text-muted-foreground">
												{row.count}
											</div>
										</li>
									);
								})}
							</ul>
						) : (
							<div
								className="text-sm text-muted-foreground py-4"
								data-testid="webhooks-by-type-empty"
							>
								No events in the last 7 days.
							</div>
						)}
					</CardContent>
				</Card>

				<Card data-testid="webhooks-recent-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">Recent events</CardTitle>
					</CardHeader>
					<CardContent>
						{overviewQ.isLoading ? (
							<Skeleton className="h-48 w-full" />
						) : overviewQ.data?.recent.length ? (
							<ul className="space-y-1.5 text-sm divide-y">
								{overviewQ.data.recent.slice(0, 20).map((r) => (
									<li
										key={r.eventId}
										className="flex items-center justify-between gap-3 py-1.5"
									>
										<div className="flex-1 min-w-0">
											<div className="truncate font-medium">
												{r.eventType}
											</div>
											<div className="text-xs text-muted-foreground truncate">
												{r.eventId} · {r.source} · {r.status}
											</div>
										</div>
										<div className="text-xs text-muted-foreground whitespace-nowrap">
											{fmtRelative(r.receivedAt)}
										</div>
									</li>
								))}
							</ul>
						) : (
							<div
								className="text-sm text-muted-foreground py-4"
								data-testid="webhooks-recent-empty"
							>
								No webhook events yet.
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Row 3: full table + filters */}
			<Card>
				<CardHeader className="pb-3">
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex-1 min-w-[12rem]">
							<CardTitle className="text-base">Event log</CardTitle>
							<div className="text-xs text-muted-foreground mt-1">
								Filterable read-only log. Defaults to last 7 days.
							</div>
						</div>
						<div className="flex items-end gap-2">
							<div className="min-w-[10rem]">
								<label
									htmlFor="webhooks-filter-event-type"
									className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1"
								>
									Event type
								</label>
								<Select
									value={filterEventType}
									onValueChange={(v) => {
										setFilterEventType(v);
										setPage(1);
									}}
								>
									<SelectTrigger
										id="webhooks-filter-event-type"
										className="w-[14rem]"
										data-testid="webhooks-filter-event-type"
									>
										<SelectValue placeholder="All event types" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL}>All event types</SelectItem>
										{eventTypeOptions.map((et) => (
											<SelectItem key={et} value={et}>
												{et}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="min-w-[8rem]">
								<label
									htmlFor="webhooks-filter-days"
									className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1"
								>
									Window
								</label>
								<Select
									value={String(filterDays)}
									onValueChange={(v) => {
										setFilterDays(Number(v));
										setPage(1);
									}}
								>
									<SelectTrigger
										id="webhooks-filter-days"
										className="w-[8rem]"
										data-testid="webhooks-filter-days"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="1">Last 24h</SelectItem>
										<SelectItem value="7">Last 7d</SelectItem>
										<SelectItem value="30">Last 30d</SelectItem>
										<SelectItem value="90">Last 90d</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<WebhooksLogTable
						rows={listQ.data?.rows ?? []}
						total={listQ.data?.total ?? 0}
						page={listQ.data?.page ?? page}
						limit={listQ.data?.limit ?? limit}
						isLoading={listQ.isLoading || listQ.isFetching}
						onPageChange={(p) => setPage(p)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
