/**
 * Platform Admin — Payments dashboard (Plan C C.4).
 *
 * 4 tabs:
 *   - Overview: KPI cards + last reconciliation status
 *   - Drift: filterable drift_log table w/ "Mark resolved" action
 *   - Disputes: open disputes queue w/ deadlines + "Mark handled" action
 *   - Stuck onboardings: tenants past 7d in pending state
 *
 * Header actions: "Run reconciliation now", "Run backfill now"
 * (super_admin only — server enforces).
 *
 * Auth gate: platform admin (any role for read; super_admin for manual
 * cron triggers — server enforces).
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Clock,
	DollarSign,
	ExternalLink,
	Loader2,
	PlayCircle,
	RefreshCw,
	Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/payments",
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
	component: PlatformAdminPaymentsPage,
});

function fmtAmount(minor: number, currency = "usd") {
	return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function PlatformAdminPaymentsPage() {
	const qc = useQueryClient();

	const overviewQ = useQuery({
		queryKey: ["platform-admin-payments", "overview"],
		queryFn: () => client.platformAdminPayments.overview({}),
		refetchInterval: 30_000,
	});

	const runRecon = useMutation({
		mutationFn: () => client.platformAdminPayments.runReconciliationNow({}),
		onSuccess: (r) => {
			toast.success(`Reconciliation done — ${r.driftFound} drift rows (${r.criticalCount} critical)`);
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Reconciliation failed"),
	});

	const runBackfill = useMutation({
		mutationFn: () => client.platformAdminPayments.runWebhookBackfillNow({}),
		onSuccess: (r) => {
			toast.success(`Backfill done — ${r.replayed} replayed, ${r.alreadyProcessed} already processed`);
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Backfill failed"),
	});

	return (
		<div className="p-6 space-y-6">
			<header className="flex items-start justify-between">
				<div>
					<div className="text-sm text-muted-foreground">Platform admin</div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold">
						<Shield className="size-6" />
						Payment Integrity
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Cross-tenant audit + drift detection (Plan C).
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => runBackfill.mutate()}
						disabled={runBackfill.isPending}
					>
						{runBackfill.isPending ? (
							<Loader2 className="mr-2 size-3.5 animate-spin" />
						) : (
							<RefreshCw className="mr-2 size-3.5" />
						)}
						Run backfill
					</Button>
					<Button
						size="sm"
						onClick={() => runRecon.mutate()}
						disabled={runRecon.isPending}
					>
						{runRecon.isPending ? (
							<Loader2 className="mr-2 size-3.5 animate-spin" />
						) : (
							<PlayCircle className="mr-2 size-3.5" />
						)}
						Run reconciliation
					</Button>
				</div>
			</header>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="drift">
						Drift
						{(overviewQ.data?.drift.critical ?? 0) > 0 && (
							<Badge
								variant="outline"
								className="ml-1.5 border-red-200 bg-red-50 text-red-700"
							>
								{overviewQ.data!.drift.critical}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="disputes">
						Disputes
						{(overviewQ.data?.openDisputes ?? 0) > 0 && (
							<Badge variant="secondary" className="ml-1.5">
								{overviewQ.data!.openDisputes}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="stuck">
						Stuck onboardings
						{(overviewQ.data?.stuckOnboardings ?? 0) > 0 && (
							<Badge variant="outline" className="ml-1.5">
								{overviewQ.data!.stuckOnboardings}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="mt-4 space-y-4">
					<OverviewTab data={overviewQ.data} isLoading={overviewQ.isLoading} />
				</TabsContent>
				<TabsContent value="drift" className="mt-4">
					<DriftTab />
				</TabsContent>
				<TabsContent value="disputes" className="mt-4">
					<DisputesTab />
				</TabsContent>
				<TabsContent value="stuck" className="mt-4">
					<StuckTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function OverviewTab({
	data,
	isLoading,
}: {
	data: Awaited<ReturnType<typeof client.platformAdminPayments.overview>> | undefined;
	isLoading: boolean;
}) {
	if (isLoading || !data) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="size-6 animate-spin" />
			</div>
		);
	}
	return (
		<>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<KpiCard
					icon={DollarSign}
					label="App fees this month"
					value={fmtAmount(data.applicationFeesThisMonth, "myr")}
					mono
				/>
				<KpiCard
					icon={DollarSign}
					label="SaaS revenue this month"
					value={fmtAmount(data.saasRevenueThisMonth, "usd")}
					mono
				/>
				<KpiCard
					icon={Clock}
					label="Open disputes"
					value={data.openDisputes.toString()}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<KpiCard
					icon={AlertCircle}
					label="Critical drift"
					value={data.drift.critical.toString()}
					tone={data.drift.critical > 0 ? "red" : undefined}
				/>
				<KpiCard
					icon={AlertTriangle}
					label="Warn drift"
					value={data.drift.warn.toString()}
				/>
				<KpiCard
					icon={Shield}
					label="Stuck onboardings"
					value={data.stuckOnboardings.toString()}
				/>
			</div>
			{data.lastReconciliation && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Last reconciliation</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-2 gap-2 text-sm">
							<dt className="text-muted-foreground">Status</dt>
							<dd>
								<Badge variant="outline">
									{data.lastReconciliation.status}
								</Badge>
							</dd>
							<dt className="text-muted-foreground">Started</dt>
							<dd>{new Date(data.lastReconciliation.startedAt).toLocaleString()}</dd>
							<dt className="text-muted-foreground">Completed</dt>
							<dd>
								{data.lastReconciliation.completedAt
									? new Date(data.lastReconciliation.completedAt).toLocaleString()
									: "—"}
							</dd>
							<dt className="text-muted-foreground">Drift found</dt>
							<dd>{data.lastReconciliation.driftCount}</dd>
							{data.lastReconciliation.error && (
								<>
									<dt className="text-muted-foreground">Error</dt>
									<dd className="text-red-700">{data.lastReconciliation.error}</dd>
								</>
							)}
						</dl>
					</CardContent>
				</Card>
			)}
		</>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	tone,
	mono,
}: {
	icon: typeof DollarSign;
	label: string;
	value: string;
	tone?: "red";
	mono?: boolean;
}) {
	return (
		<Card>
			<CardContent className="pt-6">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-muted-foreground text-sm">{label}</p>
						<p
							className={`mt-1 font-semibold text-2xl ${mono ? "font-mono tabular-nums" : ""} ${tone === "red" ? "text-red-700" : ""}`}
						>
							{value}
						</p>
					</div>
					<Icon
						className={`size-5 ${tone === "red" ? "text-red-700" : "text-muted-foreground"}`}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function DriftTab() {
	const qc = useQueryClient();
	const [severity, setSeverity] = useState<string>("all");
	const [resolved, setResolved] = useState<string>("unresolved");

	const driftQ = useQuery({
		queryKey: ["platform-admin-payments", "drift", severity, resolved],
		queryFn: () =>
			client.platformAdminPayments.listDrift({
				severity: severity === "all" ? undefined : (severity as "info" | "warn" | "critical"),
				resolved: resolved === "all" ? undefined : resolved === "resolved",
				limit: 100,
			}),
	});

	const markResolved = useMutation({
		mutationFn: (driftId: string) =>
			client.platformAdminPayments.markDriftResolved({ driftId }),
		onSuccess: () => {
			toast.success("Drift marked resolved");
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center gap-3">
				<CardTitle className="flex-1 text-base">Drift log</CardTitle>
				<Select value={severity} onValueChange={setSeverity}>
					<SelectTrigger className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All severity</SelectItem>
						<SelectItem value="critical">Critical</SelectItem>
						<SelectItem value="warn">Warn</SelectItem>
						<SelectItem value="info">Info</SelectItem>
					</SelectContent>
				</Select>
				<Select value={resolved} onValueChange={setResolved}>
					<SelectTrigger className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="unresolved">Unresolved</SelectItem>
						<SelectItem value="resolved">Resolved</SelectItem>
						<SelectItem value="all">All</SelectItem>
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent className="px-0">
				{driftQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (driftQ.data?.drift.length ?? 0) === 0 ? (
					<EmptyState
						icon={CheckCircle2}
						title="No drift found"
						description="Everything reconciles for the selected filters."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Severity
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Resource
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Kind
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Org / Acct
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Detected
								</TableHead>
								<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Action
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{driftQ.data!.drift.map((row) => (
								<TableRow key={row.id} className="hover:bg-muted/30">
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<SeverityBadge severity={row.severity} />
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="font-medium">{row.resourceType}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.resourceId}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.driftKind}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="text-xs">{row.organizationId ?? "—"}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.stripeAccountId ?? "—"}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{new Date(row.detectedAt).toLocaleString()}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right">
										{row.resolvedAt ? (
											<Badge
												variant="outline"
												className="gap-1 border-green-300 bg-green-50 text-green-700"
											>
												<CheckCircle2 className="size-3" /> Resolved
											</Badge>
										) : (
											<Button
												size="sm"
												variant="outline"
												onClick={() => markResolved.mutate(row.id)}
												disabled={markResolved.isPending}
											>
												Mark resolved
											</Button>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function SeverityBadge({ severity }: { severity: string }) {
	if (severity === "critical")
		return (
			<Badge
				variant="outline"
				className="gap-1 border-red-200 bg-red-50 text-red-700"
			>
				<AlertCircle className="size-3" /> Critical
			</Badge>
		);
	if (severity === "warn")
		return (
			<Badge
				variant="outline"
				className="gap-1 border-yellow-300 bg-yellow-50 text-yellow-800"
			>
				<AlertTriangle className="size-3" /> Warn
			</Badge>
		);
	return <Badge variant="outline">Info</Badge>;
}

function DisputesTab() {
	const qc = useQueryClient();
	const disputesQ = useQuery({
		queryKey: ["platform-admin-payments", "disputes"],
		queryFn: () => client.platformAdminPayments.listDisputes({ limit: 100 }),
	});

	const markHandled = useMutation({
		mutationFn: (disputeId: string) =>
			client.platformAdminPayments.markDisputeHandled({ disputeId }),
		onSuccess: () => {
			toast.success("Dispute marked handled");
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Disputes</CardTitle>
			</CardHeader>
			<CardContent className="px-0">
				{disputesQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (disputesQ.data?.disputes.length ?? 0) === 0 ? (
					<EmptyState
						icon={Shield}
						title="No disputes"
						description="There are no open disputes to handle."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Dispute
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Status
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Amount
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Reason
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Deadline
								</TableHead>
								<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Action
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{disputesQ.data!.disputes.map((d) => (
								<TableRow key={d.id} className="hover:bg-muted/30">
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<code className="font-mono text-xs">{d.disputeId}</code>
										<div className="font-mono text-xs text-muted-foreground">
											{d.stripeAccountId}
										</div>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge variant="outline">{d.status}</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap font-mono tabular-nums">
										{fmtAmount(d.amount, d.currency)}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{d.reason ?? "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{d.deadlineAt ? new Date(d.deadlineAt).toLocaleString() : "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right">
										{d.handledAt ? (
											<Badge
												variant="outline"
												className="gap-1 border-green-300 bg-green-50 text-green-700"
											>
												<CheckCircle2 className="size-3" /> Handled
											</Badge>
										) : (
											<div className="flex gap-2 justify-end">
												<a
													href={`https://dashboard.stripe.com/${d.stripeAccountId}/disputes/${d.disputeId}`}
													target="_blank"
													rel="noreferrer"
													className="inline-flex items-center text-xs text-blue-700 hover:underline"
												>
													Stripe <ExternalLink className="ml-1 size-3" />
												</a>
												<Button
													size="sm"
													variant="outline"
													onClick={() => markHandled.mutate(d.disputeId)}
													disabled={markHandled.isPending}
												>
													Mark handled
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function StuckTab() {
	const stuckQ = useQuery({
		queryKey: ["platform-admin-payments", "stuck"],
		queryFn: () => client.platformAdminPayments.listStuckOnboardings({}),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Stuck onboardings</CardTitle>
			</CardHeader>
			<CardContent className="px-0">
				{stuckQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (stuckQ.data?.stuck.length ?? 0) === 0 ? (
					<EmptyState
						icon={CheckCircle2}
						title="No stuck onboardings"
						description="All tenants have completed onboarding in time."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Org
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Country
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Acct
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Status
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Details
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Last update
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stuckQ.data!.stuck.map((row, i) => (
								<TableRow
									key={`${row.organizationId}-${row.countryCode}-${i}`}
									className="hover:bg-muted/30"
								>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="font-medium">{row.orgName}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.orgSlug}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.countryCode}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<code className="font-mono text-xs">
											{row.stripeAccountId}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge variant="outline">{row.status}</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.detailsSubmitted ? "Submitted" : "Not submitted"}
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{row.connectAccountUpdatedAt
											? new Date(row.connectAccountUpdatedAt).toLocaleString()
											: "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
