/**
 * Platform Admin — Tenant drill-in (Plan E E.1).
 *
 * Overview tab only in E.1: org metadata, owner, Connect rollup,
 * subscription state, last activity. E.2-E.5 add Usage / Funnel /
 * Comms / Audit tabs.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	CreditCard as CreditCardIcon,
	ExternalLink,
} from "lucide-react";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantNotesTab } from "@/components/platform-admin/tenant-notes-tab";
import { TenantRiskTab } from "@/components/platform-admin/tenant-risk-tab";
import { TenantBillingTab } from "@/components/platform-admin/tenant-billing-tab";
import { TenantMembersTab } from "@/components/platform-admin/tenant-members-tab";
import { TenantFeatureFlagsTab } from "@/components/platform-admin/tenant-feature-flags-tab";
import { fmtMinor, PaymentStatusBadge } from "./helpers";
import { CommsTab } from "./CommsTab";
import { FunnelTab } from "./FunnelTab";
import { ActionsTab } from "./ActionsTab";
import { UsageTab } from "./UsageTab";

export function TenantDrillInPage({ id }: { id: string }) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantDetail", id],
		queryFn: () =>
			client.platformAdminTenants.getTenantDetail({ organizationId: id }),
	});
	const { data: session } = authClient.useSession();
	const { data: me } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
	});
	const currentUserId = session?.user?.id ?? "";
	const isSuperAdmin =
		me?.isPlatformAdmin === true && me.role === "super_admin";

	if (isLoading) {
		return <div className="p-6 text-muted-foreground">Loading tenant…</div>;
	}

	if (error || !data) {
		return (
			<div className="space-y-3 p-6">
				<Link to="/dashboard/platform-admin/tenants">
					<Button variant="ghost" size="sm">
						<ArrowLeft className="mr-1 h-4 w-4" />
						Back to tenants
					</Button>
				</Link>
				<StatusCallout
					variant="error"
					title="Couldn't load tenant"
					message={(error as Error)?.message ?? "Tenant not found."}
				/>
			</div>
		);
	}

	const { organization, owner, subscription, connectAccounts, lastPayment } =
		data;

	return (
		<div className="space-y-4 p-6">
			<div>
				<Link to="/dashboard/platform-admin/tenants">
					<Button variant="ghost" size="sm" className="mb-2">
						<ArrowLeft className="mr-1 h-4 w-4" />
						Back to tenants
					</Button>
				</Link>
				<p className="text-sm text-muted-foreground">
					Platform Admin · Tenants
				</p>
				<div className="flex items-baseline gap-3">
					<h1 className="text-2xl font-semibold">{organization.name}</h1>
					<Badge variant="outline" className="font-mono text-xs">
						{organization.slug}
					</Badge>
					{organization.countryCode && (
						<Badge variant="outline" className="font-mono text-xs">
							{organization.countryCode}
						</Badge>
					)}
					<PaymentStatusBadge status={organization.paymentStatus} />
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Neon project:{" "}
					<span className="font-mono">{organization.neonProjectId}</span>
				</p>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="usage">Usage</TabsTrigger>
					<TabsTrigger value="funnel">Funnel</TabsTrigger>
					<TabsTrigger value="comms">Comms</TabsTrigger>
					<TabsTrigger value="notes">Notes</TabsTrigger>
					<TabsTrigger value="risk">Risk</TabsTrigger>
					<TabsTrigger value="billing">Billing</TabsTrigger>
					<TabsTrigger value="members">Members</TabsTrigger>
					<TabsTrigger value="feature-flags">Feature flags</TabsTrigger>
					<TabsTrigger value="actions">Actions</TabsTrigger>
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
													subscription.status === "active"
														? "default"
														: "secondary"
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
												{new Date(
													subscription.currentPeriodEnd,
												).toLocaleDateString()}
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
								<CardTitle className="text-base">
									Last payment activity
								</CardTitle>
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
												{fmtMinor(
													lastPayment.applicationFee,
													lastPayment.currency,
												)}
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
									Created{" "}
									{new Date(organization.createdAt).toLocaleDateString()}
								</div>
								<div>
									Updated{" "}
									{new Date(organization.updatedAt).toLocaleDateString()}
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
							<CardTitle className="text-base">
								Stripe Connect accounts
							</CardTitle>
						</CardHeader>
						<CardContent
							className={connectAccounts.length === 0 ? undefined : "px-0"}
						>
							{connectAccounts.length === 0 ? (
								<EmptyState
									icon={CreditCardIcon}
									title="No Connect accounts onboarded"
									description="Per-country Stripe Connect onboarding happens from the tenant detail page."
								/>
							) : (
								<Table>
									<TableHeader>
										<TableRow className="border-b border-border/40 hover:bg-transparent">
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Country
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Account
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Status
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Charges
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Payouts
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Details
											</TableHead>
											<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												Updated
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{connectAccounts.map((a) => (
											<TableRow
												key={a.id}
												className="border-b border-border/30 transition-colors hover:bg-muted/30"
											>
												<TableCell className="px-6 py-4 font-mono text-sm whitespace-nowrap">
													{a.countryCode}
												</TableCell>
												<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
													{a.stripeAccountId ? (
														<a
															href={`https://dashboard.stripe.com/connect/accounts/${a.stripeAccountId}`}
															target="_blank"
															rel="noreferrer"
															className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
														>
															{a.stripeAccountId}
															<ExternalLink className="h-3 w-3" />
														</a>
													) : (
														<span className="text-muted-foreground text-xs">
															—
														</span>
													)}
												</TableCell>
												<TableCell className="px-6 py-4 whitespace-nowrap">
													<Badge variant="outline">
														{a.stripeConnectStatus}
													</Badge>
												</TableCell>
												<TableCell className="px-6 py-4 whitespace-nowrap">
													<Badge
														variant="outline"
														className={
															a.chargesEnabled
																? "border-green-300 bg-green-50 text-green-700"
																: undefined
														}
													>
														{a.chargesEnabled ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell className="px-6 py-4 whitespace-nowrap">
													<Badge
														variant="outline"
														className={
															a.payoutsEnabled
																? "border-green-300 bg-green-50 text-green-700"
																: undefined
														}
													>
														{a.payoutsEnabled ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell className="px-6 py-4 whitespace-nowrap">
													<Badge
														variant="outline"
														className={
															a.detailsSubmitted
																? "border-green-300 bg-green-50 text-green-700"
																: undefined
														}
													>
														{a.detailsSubmitted ? "yes" : "no"}
													</Badge>
												</TableCell>
												<TableCell className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
													{a.connectAccountUpdatedAt
														? new Date(
																a.connectAccountUpdatedAt,
															).toLocaleDateString()
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

				<TabsContent value="funnel">
					<FunnelTab organizationId={id} />
				</TabsContent>

				<TabsContent value="comms">
					<CommsTab organizationId={id} />
				</TabsContent>

				<TabsContent value="notes">
					<TenantNotesTab
						organizationId={id}
						currentUserId={currentUserId}
						isSuperAdmin={isSuperAdmin}
					/>
				</TabsContent>

				<TabsContent value="risk">
					<TenantRiskTab organizationId={id} />
				</TabsContent>

				<TabsContent value="billing">
					<TenantBillingTab organizationId={id} isSuperAdmin={isSuperAdmin} />
				</TabsContent>

				<TabsContent value="members">
					<TenantMembersTab organizationId={id} />
				</TabsContent>

				<TabsContent value="feature-flags">
					<TenantFeatureFlagsTab
						organizationId={id}
						isSuperAdmin={isSuperAdmin}
					/>
				</TabsContent>

				<TabsContent value="actions">
					<ActionsTab
						organizationId={id}
						currentPaymentStatus={organization.paymentStatus}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
