/**
 * Platform Admin — Tenant drill-in (Plan E E.1).
 *
 * Overview tab only in E.1: org metadata, owner, Connect rollup,
 * subscription state, last activity. E.2-E.5 add Usage / Funnel /
 * Comms / Audit tabs.
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { client } from "@/utils/orpc";
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

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants/$id",
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
	component: TenantDrillInPage,
});

function fmtMinor(amountMinor: number, currency: string) {
	return `${(amountMinor / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})} ${currency.toUpperCase()}`;
}

function TenantDrillInPage() {
	const { id } = Route.useParams();
	const { data, isLoading, error } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantDetail", id],
		queryFn: () => client.platformAdminTenants.getTenantDetail({ organizationId: id }),
	});

	if (isLoading) {
		return <div className="p-6 text-muted-foreground">Loading tenant…</div>;
	}

	if (error || !data) {
		return (
			<div className="p-6 space-y-3">
				<Link to="/dashboard/platform-admin/tenants">
					<Button variant="ghost" size="sm">
						<ArrowLeft className="h-4 w-4 mr-1" />
						Back to tenants
					</Button>
				</Link>
				<div className="text-destructive">
					{(error as Error)?.message ?? "Tenant not found."}
				</div>
			</div>
		);
	}

	const { organization, owner, subscription, connectAccounts, lastPayment } = data;

	return (
		<div className="p-6 space-y-4">
			<div>
				<Link to="/dashboard/platform-admin/tenants">
					<Button variant="ghost" size="sm" className="mb-2">
						<ArrowLeft className="h-4 w-4 mr-1" />
						Back to tenants
					</Button>
				</Link>
				<div className="flex items-baseline gap-3">
					<h1 className="text-2xl font-semibold">{organization.name}</h1>
					<Badge variant="outline" className="font-mono text-xs">
						{organization.slug}
					</Badge>
					<Badge
						variant={
							organization.paymentStatus === "active"
								? "default"
								: organization.paymentStatus === "failed"
									? "destructive"
									: "secondary"
						}
					>
						{organization.paymentStatus}
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground mt-1">
					Neon project: <span className="font-mono">{organization.neonProjectId}</span>
				</p>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="usage">Usage</TabsTrigger>
					<TabsTrigger value="funnel" disabled>
						Funnel (E.4)
					</TabsTrigger>
					<TabsTrigger value="actions" disabled>
						Actions (E.3)
					</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Owner</CardTitle>
							</CardHeader>
							<CardContent className="space-y-1 text-sm">
								{owner ? (
									<>
										<div>{owner.name}</div>
										<div className="text-muted-foreground">{owner.email}</div>
										<div className="text-muted-foreground text-xs">
											user id <span className="font-mono">{owner.id}</span>
										</div>
									</>
								) : (
									<div className="text-muted-foreground">No owner linked.</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Subscription</CardTitle>
							</CardHeader>
							<CardContent className="space-y-1 text-sm">
								{subscription ? (
									<>
										<div className="flex items-center gap-2">
											<Badge variant="outline">{subscription.tier}</Badge>
											<Badge
												variant={
													subscription.status === "active" ? "default" : "secondary"
												}
											>
												{subscription.status}
											</Badge>
										</div>
										<div className="text-muted-foreground">
											Fee: {subscription.applicationFeeBps} bps ·{" "}
											{subscription.currency.toUpperCase()}
										</div>
										{subscription.currentPeriodEnd && (
											<div className="text-muted-foreground text-xs">
												Period ends{" "}
												{new Date(subscription.currentPeriodEnd).toLocaleDateString()}
												{subscription.cancelAtPeriodEnd && " (cancels)"}
											</div>
										)}
										<div className="text-muted-foreground text-xs font-mono break-all">
											{subscription.stripeSubscriptionId}
										</div>
									</>
								) : organization.trialEndsAt ? (
									<>
										<Badge variant="secondary">Trial</Badge>
										<div className="text-muted-foreground text-xs">
											Trial ends{" "}
											{new Date(organization.trialEndsAt).toLocaleDateString()}
										</div>
									</>
								) : (
									<div className="text-muted-foreground">No subscription.</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Last payment activity</CardTitle>
							</CardHeader>
							<CardContent className="text-sm">
								{lastPayment ? (
									<>
										<div>
											{lastPayment.eventKind} ·{" "}
											{fmtMinor(lastPayment.amount, lastPayment.currency)}
										</div>
										{lastPayment.applicationFee > 0 && (
											<div className="text-muted-foreground text-xs">
												Fee:{" "}
												{fmtMinor(lastPayment.applicationFee, lastPayment.currency)}
											</div>
										)}
										<div className="text-muted-foreground text-xs">
											{new Date(lastPayment.occurredAt).toLocaleString()}
										</div>
									</>
								) : (
									<div className="text-muted-foreground">
										No platform ledger activity yet.
									</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Metadata</CardTitle>
							</CardHeader>
							<CardContent className="space-y-1 text-sm text-muted-foreground">
								<div>
									Created {new Date(organization.createdAt).toLocaleDateString()}
								</div>
								<div>
									Updated {new Date(organization.updatedAt).toLocaleDateString()}
								</div>
								<div>Schema v{organization.schemaVersion ?? "—"}</div>
								<div>
									GHL: {organization.ghlSyncModel ?? "not configured"}
									{organization.ghlProvisionedAt &&
										` · since ${new Date(organization.ghlProvisionedAt).toLocaleDateString()}`}
								</div>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Stripe Connect accounts</CardTitle>
						</CardHeader>
						<CardContent>
							{connectAccounts.length === 0 ? (
								<div className="text-sm text-muted-foreground">
									No Connect accounts onboarded.
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Country</TableHead>
											<TableHead>Account</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Charges</TableHead>
											<TableHead>Payouts</TableHead>
											<TableHead>Details</TableHead>
											<TableHead>Updated</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{connectAccounts.map((a) => (
											<TableRow key={a.id}>
												<TableCell className="font-mono">{a.countryCode}</TableCell>
												<TableCell>
													{a.stripeAccountId ? (
														<a
															href={`https://dashboard.stripe.com/connect/accounts/${a.stripeAccountId}`}
															target="_blank"
															rel="noreferrer"
															className="font-mono text-xs hover:underline inline-flex items-center gap-1"
														>
															{a.stripeAccountId}
															<ExternalLink className="h-3 w-3" />
														</a>
													) : (
														<span className="text-muted-foreground text-xs">—</span>
													)}
												</TableCell>
												<TableCell>
													<Badge variant="outline">{a.stripeConnectStatus}</Badge>
												</TableCell>
												<TableCell>
													<Badge variant={a.chargesEnabled ? "default" : "secondary"}>
														{a.chargesEnabled ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant={a.payoutsEnabled ? "default" : "secondary"}>
														{a.payoutsEnabled ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant={a.detailsSubmitted ? "default" : "secondary"}>
														{a.detailsSubmitted ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell className="text-xs text-muted-foreground">
													{a.connectAccountUpdatedAt
														? new Date(a.connectAccountUpdatedAt).toLocaleDateString()
														: "—"}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="usage">
					<UsageTab organizationId={id} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function UsageTab({ organizationId }: { organizationId: string }) {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantUsageHistory", organizationId],
		queryFn: () =>
			client.platformAdminTenants.getTenantUsageHistory({
				organizationId,
				days: 30,
			}),
	});

	const refresh = useMutation({
		mutationFn: () => client.platformAdminTenants.runTenantUsageSnapshotsNow({}),
		onSuccess: (r) => {
			toast.success(
				`Snapshot complete — ${r.written} written, ${r.errors} errors (${r.durationMs}ms)`,
			);
			qc.invalidateQueries({
				queryKey: ["platformAdminTenants", "getTenantUsageHistory", organizationId],
			});
		},
		onError: (e: unknown) =>
			toast.error(`Snapshot failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const snapshots = data?.snapshots ?? [];
	const latest = snapshots[snapshots.length - 1] ?? null;

	const peak = snapshots.reduce(
		(acc, s) => ({
			members: Math.max(acc.members, s.memberCount),
			customers: Math.max(acc.customers, s.customerCount),
			appts: Math.max(acc.appts, s.apptCount30d),
			sales: Math.max(acc.sales, s.salesTotal30dMinor),
		}),
		{ members: 0, customers: 0, appts: 0, sales: 0 },
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					Daily snapshot at 01:00 UTC. Latest:{" "}
					{latest ? latest.snapshotDate : isLoading ? "loading…" : "none yet"}.
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => refresh.mutate()}
					disabled={refresh.isPending}
				>
					{refresh.isPending ? (
						<Loader2 className="h-4 w-4 mr-1 animate-spin" />
					) : (
						<RefreshCw className="h-4 w-4 mr-1" />
					)}
					Refresh now
				</Button>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Members
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">{latest?.memberCount ?? "—"}</div>
						<div className="text-xs text-muted-foreground">peak {peak.members}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Customers
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">{latest?.customerCount ?? "—"}</div>
						<div className="text-xs text-muted-foreground">peak {peak.customers}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Appts (30d)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">{latest?.apptCount30d ?? "—"}</div>
						<div className="text-xs text-muted-foreground">peak {peak.appts}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Sales 30d
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">
							{latest
								? fmtMinor(latest.salesTotal30dMinor, latest.salesCurrency)
								: "—"}
						</div>
						<div className="text-xs text-muted-foreground">
							peak {fmtMinor(peak.sales, latest?.salesCurrency ?? "MYR")}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Daily history</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="text-muted-foreground text-sm">Loading…</div>
					) : snapshots.length === 0 ? (
						<div className="text-muted-foreground text-sm">
							No snapshots yet. Run "Refresh now" to create the first one.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">Members</TableHead>
									<TableHead className="text-right">Customers</TableHead>
									<TableHead className="text-right">Appts 30d</TableHead>
									<TableHead className="text-right">Sales 30d</TableHead>
									<TableHead>GHL</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{snapshots
									.slice()
									.reverse()
									.map((s) => (
										<TableRow key={s.id}>
											<TableCell className="font-mono text-xs">
												{s.snapshotDate}
											</TableCell>
											<TableCell className="text-right">{s.memberCount}</TableCell>
											<TableCell className="text-right">{s.customerCount}</TableCell>
											<TableCell className="text-right">{s.apptCount30d}</TableCell>
											<TableCell className="text-right">
												{fmtMinor(s.salesTotal30dMinor, s.salesCurrency)}
											</TableCell>
											<TableCell>
												<Badge variant={s.ghlActive ? "default" : "secondary"}>
													{s.ghlActive ? "active" : "off"}
												</Badge>
											</TableCell>
										</TableRow>
									))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
