/**
 * Platform Admin — Tenant drill-in (Plan E E.1).
 *
 * Overview tab only in E.1: org metadata, owner, Connect rollup,
 * subscription state, last activity. E.2-E.5 add Usage / Funnel /
 * Comms / Audit tabs.
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	ArrowLeft,
	CheckCircle2,
	Circle,
	CreditCard as CreditCardIcon,
	ExternalLink,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import { TenantDeletionCard } from "@/components/platform-admin/tenant-deletion-card";
import { TenantNotesTab } from "@/components/platform-admin/tenant-notes-tab";
import { TenantRiskTab } from "@/components/platform-admin/tenant-risk-tab";
import { TenantBillingTab } from "@/components/platform-admin/tenant-billing-tab";
import { TenantMembersTab } from "@/components/platform-admin/tenant-members-tab";
import { TenantFeatureFlagsTab } from "@/components/platform-admin/tenant-feature-flags-tab";

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

/**
 * Payment-status badge. `paymentStatus` is not a CanonicalStatus (no
 * `suspended`/`failed` in StatusBadge's union), so we map to §2.3 status
 * classes directly via the shared Badge primitive (§7.4).
 */
function PaymentStatusBadge({ status }: { status: string }) {
	const classMap: Record<string, string> = {
		active: "border-green-300 bg-green-50 text-green-700",
		suspended: "border-yellow-200 bg-yellow-50 text-yellow-800",
		failed: "border-red-200 bg-red-50 text-red-700",
		cancelled: "border-red-200 bg-red-50 text-red-700",
	};
	return (
		<Badge variant="outline" className={classMap[status]}>
			{status}
		</Badge>
	);
}

function TenantDrillInPage() {
	const { id } = Route.useParams();
	const { data, isLoading, error } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantDetail", id],
		queryFn: () => client.platformAdminTenants.getTenantDetail({ organizationId: id }),
	});
	const { data: session } = authClient.useSession();
	const { data: me } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
	});
	const currentUserId = session?.user?.id ?? "";
	const isSuperAdmin = me?.isPlatformAdmin === true && me.role === "super_admin";

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

	const { organization, owner, subscription, connectAccounts, lastPayment } = data;

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
						<CardContent className={connectAccounts.length === 0 ? undefined : "px-0"}>
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
														<span className="text-muted-foreground text-xs">—</span>
													)}
												</TableCell>
												<TableCell className="px-6 py-4 whitespace-nowrap">
													<Badge variant="outline">{a.stripeConnectStatus}</Badge>
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
					<TenantBillingTab
						organizationId={id}
						isSuperAdmin={isSuperAdmin}
					/>
				</TabsContent>

				<TabsContent value="members">
					<TenantMembersTab organizationId={id} />
				</TabsContent>

				<TabsContent value="feature-flags">
					<TenantFeatureFlagsTab organizationId={id} isSuperAdmin={isSuperAdmin} />
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

function CommsTab({ organizationId }: { organizationId: string }) {
	const [dmSubject, setDmSubject] = useState("");
	const [dmMessage, setDmMessage] = useState("");
	const [annTitle, setAnnTitle] = useState("");
	const [annMessage, setAnnMessage] = useState("");
	const [annPriority, setAnnPriority] = useState<
		"low" | "normal" | "high" | "urgent"
	>("normal");
	const [annAudience, setAnnAudience] = useState<"all" | "staff" | "clients">(
		"all",
	);

	const dm = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.sendTenantDirectMessage({
				organizationId,
				subject: dmSubject,
				message: dmMessage,
			}),
		onSuccess: (r) => {
			const delivered = [
				r.deliveries.email && "email",
				r.deliveries.inApp && "in-app",
			]
				.filter(Boolean)
				.join(" + ");
			toast.success(`DM sent via ${delivered || "audit only"}`);
			if (r.errors.length > 0) toast.warning(r.errors.join("\n"));
			setDmSubject("");
			setDmMessage("");
		},
		onError: (e: unknown) =>
			toast.error(`DM failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const ann = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.createTenantAnnouncement({
				organizationId,
				title: annTitle,
				message: annMessage,
				priority: annPriority,
				targetAudience: annAudience,
			}),
		onSuccess: (r) => {
			toast.success(`Announcement created (${r.announcementId})`);
			setAnnTitle("");
			setAnnMessage("");
		},
		onError: (e: unknown) =>
			toast.error(`Announcement failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const dmValid = dmSubject.trim().length >= 3 && dmMessage.trim().length >= 3;
	const annValid =
		annTitle.trim().length >= 3 && annMessage.trim().length >= 3;

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Direct message owner</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Email + in-app notification. All deliveries audited.
					</p>
					<Input
						placeholder="Subject"
						value={dmSubject}
						onChange={(e) => setDmSubject(e.target.value)}
						disabled={dm.isPending}
					/>
					<Textarea
						className="min-h-[120px]"
						placeholder="Message"
						value={dmMessage}
						onChange={(e) => setDmMessage(e.target.value)}
						disabled={dm.isPending}
					/>
					<Button
						size="sm"
						disabled={!dmValid || dm.isPending}
						onClick={() => dm.mutate()}
					>
						{dm.isPending ? "Sending…" : "Send DM"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Broadcast announcement</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Inserts into tenant announcements table.
					</p>
					<Input
						placeholder="Title"
						value={annTitle}
						onChange={(e) => setAnnTitle(e.target.value)}
						disabled={ann.isPending}
					/>
					<Textarea
						className="min-h-[100px]"
						placeholder="Message"
						value={annMessage}
						onChange={(e) => setAnnMessage(e.target.value)}
						disabled={ann.isPending}
					/>
					<div className="flex gap-2">
						<Select
							value={annPriority}
							onValueChange={(v) =>
								setAnnPriority(v as typeof annPriority)
							}
							disabled={ann.isPending}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder="Priority" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="low">low</SelectItem>
								<SelectItem value="normal">normal</SelectItem>
								<SelectItem value="high">high</SelectItem>
								<SelectItem value="urgent">urgent</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={annAudience}
							onValueChange={(v) =>
								setAnnAudience(v as typeof annAudience)
							}
							disabled={ann.isPending}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder="Audience" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">all</SelectItem>
								<SelectItem value="staff">staff</SelectItem>
								<SelectItem value="clients">clients</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Button
						size="sm"
						disabled={!annValid || ann.isPending}
						onClick={() => ann.mutate()}
					>
						{ann.isPending ? "Posting…" : "Post announcement"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function FunnelTab({ organizationId }: { organizationId: string }) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantFunnel", organizationId],
		queryFn: () =>
			client.platformAdminTenants.getTenantFunnel({ organizationId }),
	});

	if (isLoading) {
		return <div className="text-muted-foreground text-sm">Loading funnel…</div>;
	}
	if (error || !data) {
		return (
			<StatusCallout
				variant="error"
				title="Couldn't load funnel"
				message={(error as Error)?.message ?? "Failed to load funnel."}
			/>
		);
	}

	const progress = Math.round((data.completed / data.total) * 100);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Activation progress — {data.completed}/{data.total} ({progress}%)
					</CardTitle>
				</CardHeader>
				<CardContent>
					{data.stuckAt ? (
						<div className="text-sm">
							<Badge variant="secondary">Stuck at</Badge>{" "}
							<span className="font-medium">
								{
									data.milestones.find((m) => m.id === data.stuckAt)?.label
								}
							</span>
						</div>
					) : (
						<div className="text-sm">
							<Badge variant="default">All milestones reached</Badge>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Milestones</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{data.milestones.map((m) => {
							const isStuck = m.id === data.stuckAt;
							return (
								<li
									key={m.id}
									className={`flex items-center gap-3 p-2 rounded ${
										isStuck ? "bg-muted" : ""
									}`}
								>
									{m.reached ? (
										<CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
									) : (
										<Circle className="h-5 w-5 text-muted-foreground shrink-0" />
									)}
									<div className="flex-1">
										<div className="text-sm font-medium">{m.label}</div>
										<div className="text-xs text-muted-foreground font-mono">
											{m.id}
										</div>
									</div>
									<div className="text-xs text-muted-foreground">
										{m.reachedAt
											? new Date(m.reachedAt).toLocaleDateString()
											: isStuck
												? "next"
												: "—"}
									</div>
								</li>
							);
						})}
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}

function ActionsTab({
	organizationId,
	currentPaymentStatus,
}: {
	organizationId: string;
	currentPaymentStatus: string;
}) {
	const qc = useQueryClient();
	const invalidate = () =>
		qc.invalidateQueries({
			queryKey: ["platformAdminTenants", "getTenantDetail", organizationId],
		});

	const suspend = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.suspendTenant({ organizationId, reason }),
		onSuccess: () => {
			toast.success("Tenant suspended");
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Suspend failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const resume = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.resumeTenant({ organizationId, reason }),
		onSuccess: () => {
			toast.success("Tenant resumed");
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Resume failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const forceCancel = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.forceCancelTenant({
				organizationId,
				reason,
				cancelStripeSubscription: true,
			}),
		onSuccess: (r) => {
			toast.success(
				r.stripeSubCanceled
					? `Cancelled (Stripe sub ${r.stripeSubCanceled})`
					: "Cancelled (no Stripe sub)",
			);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Cancel failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const issueCredit = useMutation({
		mutationFn: (args: { amountMinor: number; currency: string; reason: string }) =>
			client.platformAdminTenants.issueTenantCredit({
				organizationId,
				...args,
			}),
		onSuccess: (r) => {
			toast.success(`Credit issued (${r.stripeBalanceTxId})`);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Credit failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const reTrial = useMutation({
		mutationFn: (args: { extendDays: number; reason: string }) =>
			client.platformAdminTenants.reTrialTenant({ organizationId, ...args }),
		onSuccess: (r) => {
			toast.success(
				`Trial extended until ${r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString() : "—"}`,
			);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Re-trial failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const suspended = currentPaymentStatus === "suspended";
	const cancelled = currentPaymentStatus === "cancelled";

	return (
		<div className="space-y-4">
			<div className="text-sm text-muted-foreground">
				Lifecycle ops are <strong>super_admin only</strong>. All actions audit
				to admin_session_actions. Reasons are required and stored.
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<ActionCard
					title="Suspend"
					description="Block charges + read-only app login (ADR-0024)."
					disabled={suspended || cancelled || suspend.isPending}
					confirmLabel="Suspend tenant"
					destructive
					onConfirm={(reason) => suspend.mutate(reason)}
				/>
				<ActionCard
					title="Resume"
					description="Restore to active state. Tenant can log in + transact again."
					disabled={!suspended || resume.isPending}
					confirmLabel="Resume tenant"
					onConfirm={(reason) => resume.mutate(reason)}
				/>
				<ActionCard
					title="Force cancel"
					description="Cancel Stripe subscription immediately + set tenant to cancelled."
					disabled={cancelled || forceCancel.isPending}
					confirmLabel="Force cancel"
					destructive
					onConfirm={(reason) => forceCancel.mutate(reason)}
				/>
				<CreditCard
					disabled={cancelled || issueCredit.isPending}
					onConfirm={(args) => issueCredit.mutate(args)}
				/>
				<ReTrialCard
					disabled={cancelled || reTrial.isPending}
					onConfirm={(args) => reTrial.mutate(args)}
				/>
				<TenantDeletionCard organizationId={organizationId} />
			</div>
		</div>
	);
}

function ActionCard({
	title,
	description,
	disabled,
	confirmLabel,
	destructive,
	onConfirm,
}: {
	title: string;
	description: string;
	disabled: boolean;
	confirmLabel: string;
	destructive?: boolean;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const valid = reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">{description}</p>
				<Input
					placeholder="Reason (required, min 3 chars)"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					variant={destructive ? "destructive" : "default"}
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (!window.confirm(`${confirmLabel}?\n\nReason: ${reason}`)) return;
						onConfirm(reason.trim());
						setReason("");
					}}
				>
					{confirmLabel}
				</Button>
			</CardContent>
		</Card>
	);
}

function CreditCard({
	disabled,
	onConfirm,
}: {
	disabled: boolean;
	onConfirm: (args: { amountMinor: number; currency: string; reason: string }) => void;
}) {
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("USD");
	const [reason, setReason] = useState("");
	const amountMinor = Math.round(parseFloat(amount || "0") * 100);
	const valid = amountMinor > 0 && currency.length === 3 && reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Issue credit</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">
					Adds a Stripe customer balance credit (deducts from next invoice).
				</p>
				<div className="flex gap-2">
					<Input
						type="number"
						step="0.01"
						placeholder="Amount"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						disabled={disabled}
					/>
					<Input
						className="w-24"
						placeholder="USD"
						value={currency}
						onChange={(e) => setCurrency(e.target.value.toUpperCase())}
						disabled={disabled}
						maxLength={3}
					/>
				</div>
				<Input
					placeholder="Reason"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (
							!window.confirm(
								`Issue ${amount} ${currency} credit?\n\nReason: ${reason}`,
							)
						)
							return;
						onConfirm({ amountMinor, currency, reason: reason.trim() });
						setAmount("");
						setReason("");
					}}
				>
					Issue credit
				</Button>
			</CardContent>
		</Card>
	);
}

function ReTrialCard({
	disabled,
	onConfirm,
}: {
	disabled: boolean;
	onConfirm: (args: { extendDays: number; reason: string }) => void;
}) {
	const [days, setDays] = useState("14");
	const [reason, setReason] = useState("");
	const extendDays = parseInt(days, 10);
	const valid =
		Number.isFinite(extendDays) &&
		extendDays > 0 &&
		extendDays <= 180 &&
		reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Re-trial</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">
					Extends trial_ends_at by N days + clears suspension.
				</p>
				<div className="flex gap-2 items-center">
					<Input
						type="number"
						placeholder="Days"
						value={days}
						onChange={(e) => setDays(e.target.value)}
						disabled={disabled}
						className="w-24"
					/>
					<span className="text-sm text-muted-foreground">days (max 180)</span>
				</div>
				<Input
					placeholder="Reason"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (
							!window.confirm(
								`Extend trial by ${extendDays} days?\n\nReason: ${reason}`,
							)
						)
							return;
						onConfirm({ extendDays, reason: reason.trim() });
						setReason("");
					}}
				>
					Extend trial
				</Button>
			</CardContent>
		</Card>
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
				<CardContent className={snapshots.length === 0 ? undefined : "px-0"}>
					{isLoading ? (
						<div className="text-muted-foreground text-sm">Loading…</div>
					) : snapshots.length === 0 ? (
						<EmptyState
							title="No snapshots yet"
							description='Run "Refresh now" to create the first one.'
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="border-b border-border/40 hover:bg-transparent">
									<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Date
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Members
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Customers
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Appts 30d
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Sales 30d
									</TableHead>
									<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										GHL
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{snapshots
									.slice()
									.reverse()
									.map((s) => (
										<TableRow
											key={s.id}
											className="border-b border-border/30 transition-colors hover:bg-muted/30"
										>
											<TableCell className="px-6 py-4 font-mono text-xs whitespace-nowrap">
												{s.snapshotDate}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.memberCount}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.customerCount}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.apptCount30d}
											</TableCell>
											<TableCell className="px-6 py-4 text-right font-mono text-sm tabular-nums whitespace-nowrap">
												{fmtMinor(s.salesTotal30dMinor, s.salesCurrency)}
											</TableCell>
											<TableCell className="px-6 py-4 whitespace-nowrap">
												<Badge
													variant="outline"
													className={
														s.ghlActive
															? "border-green-300 bg-green-50 text-green-700"
															: undefined
													}
												>
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
