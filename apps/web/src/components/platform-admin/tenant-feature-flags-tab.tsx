/**
 * Tenant Feature flags tab (Plan F.4 Agent Ff + F.6 Agent Fo).
 *
 * Shows the effective feature flag set for a tenant (tier defaults +
 * per-tenant overrides). Super-admins can toggle individual flags
 * (creates/updates an override) and reset to tier default (clears the
 * override row).
 *
 * Non-super-admins see "overridden" badges but no controls.
 */

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Workflow, CalendarDays, Split, BadgeCheck, Cable } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/utils/orpc";
import { FeatureFlagCard } from "@/components/platform-admin/feature-flag-card";

type FeatureKey =
	| "ghl"
	| "googleCalendar"
	| "commissionSplits"
	| "memberships"
	| "apiAccess";

const FEATURE_META: Record<
	FeatureKey,
	{ name: string; description: string; icon: ReactNode }
> = {
	ghl: {
		name: "GoHighLevel sync",
		description: "Two-way contact + appointment sync with GHL.",
		icon: <Workflow className="h-4 w-4" />,
	},
	googleCalendar: {
		name: "Google Calendar",
		description: "Staff schedule export to Google Calendar.",
		icon: <CalendarDays className="h-4 w-4" />,
	},
	commissionSplits: {
		name: "Commission splits",
		description: "Multi-staff revenue splitting on sales.",
		icon: <Split className="h-4 w-4" />,
	},
	memberships: {
		name: "Memberships",
		description: "Recurring membership billing for customers.",
		icon: <BadgeCheck className="h-4 w-4" />,
	},
	apiAccess: {
		name: "Public API",
		description: "External REST API access for integrations.",
		icon: <Cable className="h-4 w-4" />,
	},
};

const FEATURE_ORDER: FeatureKey[] = [
	"ghl",
	"googleCalendar",
	"commissionSplits",
	"memberships",
	"apiAccess",
];

function fmtNumber(n: number): string {
	if (n >= Number.MAX_SAFE_INTEGER) return "Unlimited";
	return n.toLocaleString();
}

export function TenantFeatureFlagsTab({
	organizationId,
	isSuperAdmin = false,
}: {
	organizationId: string;
	isSuperAdmin?: boolean;
}) {
	const qc = useQueryClient();
	const queryKey = [
		"platformAdminTenants",
		"featureFlags",
		"get",
		organizationId,
	] as const;
	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: () =>
			client.platformAdminTenants.featureFlags.get({ organizationId }),
	});

	const [pendingToggle, setPendingToggle] = useState<{
		featureKey: FeatureKey;
		nextEnabled: boolean;
		tierDefault: boolean;
	} | null>(null);
	const [pendingNotes, setPendingNotes] = useState("");

	const setMutation = useMutation({
		mutationFn: (args: {
			featureKey: FeatureKey;
			enabled: boolean;
			notes?: string;
		}) =>
			client.platformAdminTenants.featureFlags.setOverride({
				organizationId,
				featureKey: args.featureKey,
				enabled: args.enabled,
				notes: args.notes,
			}),
		onSuccess: () => {
			toast.success("Override saved");
			setPendingToggle(null);
			setPendingNotes("");
			qc.invalidateQueries({ queryKey });
		},
		onError: (err) => {
			toast.error((err as Error).message ?? "Failed to save override");
		},
	});

	const clearMutation = useMutation({
		mutationFn: (featureKey: FeatureKey) =>
			client.platformAdminTenants.featureFlags.clearOverride({
				organizationId,
				featureKey,
			}),
		onSuccess: () => {
			toast.success("Reset to tier default");
			qc.invalidateQueries({ queryKey });
		},
		onError: (err) => {
			toast.error((err as Error).message ?? "Failed to clear override");
		},
	});

	if (isLoading) {
		return (
			<div
				className="text-sm text-muted-foreground"
				data-testid="feature-flags-loading"
			>
				Loading feature flags…
			</div>
		);
	}
	if (error || !data) {
		return (
			<div
				className="text-sm text-destructive"
				data-testid="feature-flags-error"
			>
				{(error as Error)?.message ?? "Failed to load feature flags."}
			</div>
		);
	}

	const limits = data.tierLimits;
	const overrides = data.overrides;
	const overrideCount = Object.keys(overrides).length;

	return (
		<div className="space-y-4" data-testid="tenant-feature-flags-tab">
			<Card data-testid="feature-flags-header">
				<CardHeader className="pb-2">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<CardTitle className="text-base">Feature flags</CardTitle>
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="text-sm font-medium uppercase tracking-wide"
								data-testid="feature-flags-tier-chip"
							>
								{data.tier}
							</Badge>
							{data.source === "mixed" ? (
								<Badge
									variant="outline"
									className="border-amber-500/60 text-amber-700 dark:text-amber-400"
									data-testid="feature-flags-overrides-count"
								>
									{overrideCount} override{overrideCount === 1 ? "" : "s"}{" "}
									active
								</Badge>
							) : null}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-xs text-muted-foreground">
						Effective feature set = tier defaults merged with per-tenant
						overrides. Source: <span className="font-mono">{data.source}</span>.
						{isSuperAdmin
							? " Toggle any card to override; reset to revert to tier default."
							: " Only super-admins can change overrides."}
					</p>
				</CardContent>
			</Card>

			<div
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
				data-testid="feature-flags-grid"
			>
				{FEATURE_ORDER.map((key) => {
					const meta = FEATURE_META[key];
					const override = overrides[key];
					const isOverridden = Boolean(override);
					return (
						<FeatureFlagCard
							key={key}
							name={meta.name}
							description={meta.description}
							icon={meta.icon}
							enabled={data.features[key]}
							isOverridden={isOverridden}
							overrideMetadata={
								override
									? {
											setByEmail: override.setByEmail,
											notes: override.notes,
											updatedAt: override.updatedAt,
										}
									: undefined
							}
							onToggle={
								isSuperAdmin
									? (nextEnabled) =>
											setPendingToggle({
												featureKey: key,
												nextEnabled,
												tierDefault: !isOverridden
													? data.features[key]
													: // tier default = current effective with override removed; safest
														// shown as the inverse of the override
														!override!.enabled,
											})
									: undefined
							}
							onClearOverride={
								isSuperAdmin && isOverridden
									? () => clearMutation.mutate(key)
									: undefined
							}
							testId={`feature-flag-card-${key}`}
						/>
					);
				})}
			</div>

			<Card data-testid="feature-flags-limits">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Tier limits</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						<LimitBadge
							label="Organizations"
							value={fmtNumber(limits.organizations)}
						/>
						<LimitBadge label="Locations" value={fmtNumber(limits.locations)} />
						<LimitBadge label="Members" value={fmtNumber(limits.members)} />
						<LimitBadge label="Customers" value={fmtNumber(limits.customers)} />
						<LimitBadge
							label="Monthly txns"
							value={fmtNumber(limits.monthlyTxns)}
						/>
						<LimitBadge
							label="App fee"
							value={`${(limits.appFeeBps / 100).toFixed(2)}%`}
						/>
						<LimitBadge label="Analytics" value={limits.analyticsLevel} />
						<LimitBadge label="Audit log" value={`${limits.auditLogDays}d`} />
					</div>
				</CardContent>
			</Card>

			<p
				className="text-xs text-muted-foreground"
				data-testid="feature-flags-footer-note"
			>
				To change tier and unlock different features, use the Billing tab → Tier
				change. Per-tenant overrides are concessions on top of the tier.
			</p>

			<Dialog
				open={pendingToggle !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingToggle(null);
						setPendingNotes("");
					}
				}}
			>
				<DialogContent data-testid="feature-flag-override-dialog">
					<DialogHeader>
						<DialogTitle>
							Override{" "}
							{pendingToggle ? FEATURE_META[pendingToggle.featureKey].name : ""}{" "}
							to {pendingToggle?.nextEnabled ? "ENABLED" : "DISABLED"}?
						</DialogTitle>
						<DialogDescription>
							This creates a per-tenant override on top of the tier default.
							Audited.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="override-notes">Notes (optional)</Label>
						<Textarea
							id="override-notes"
							data-testid="feature-flag-override-notes"
							value={pendingNotes}
							onChange={(e) => setPendingNotes(e.target.value)}
							maxLength={1000}
							placeholder="One-off concession for support ticket #1234…"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setPendingToggle(null);
								setPendingNotes("");
							}}
						>
							Cancel
						</Button>
						<Button
							data-testid="feature-flag-override-confirm"
							onClick={() => {
								if (!pendingToggle) return;
								setMutation.mutate({
									featureKey: pendingToggle.featureKey,
									enabled: pendingToggle.nextEnabled,
									notes: pendingNotes.trim() || undefined,
								});
							}}
							disabled={setMutation.isPending}
						>
							Confirm override
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function LimitBadge({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border bg-card px-3 py-2">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="text-sm font-semibold mt-0.5">{value}</div>
		</div>
	);
}
