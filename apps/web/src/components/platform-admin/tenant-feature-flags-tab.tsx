/**
 * Tenant Feature flags tab (Plan F.4, Agent Ff).
 *
 * Read-only view of which capability flags a tenant has under their
 * current tier (per `TIER_LIMITS` in @avantej-core/types). v1 derives
 * everything from tier — per-tenant overrides are deferred to F.4.5+.
 */

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Workflow,
	CalendarDays,
	Split,
	BadgeCheck,
	Cable,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
}: {
	organizationId: string;
}) {
	const { data, isLoading, error } = useQuery({
		queryKey: [
			"platformAdminTenants",
			"featureFlags",
			"get",
			organizationId,
		],
		queryFn: () =>
			client.platformAdminTenants.featureFlags.get({ organizationId }),
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

	return (
		<div className="space-y-4" data-testid="tenant-feature-flags-tab">
			<Card data-testid="feature-flags-header">
				<CardHeader className="pb-2">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<CardTitle className="text-base">
							Feature flags
						</CardTitle>
						<Badge
							variant="outline"
							className="text-sm font-medium uppercase tracking-wide"
							data-testid="feature-flags-tier-chip"
						>
							{data.tier}
						</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-xs text-muted-foreground">
						v1: read-only. Feature set is derived from the tenant's
						tier. Source:{" "}
						<span className="font-mono">{data.source}</span>.
					</p>
				</CardContent>
			</Card>

			<div
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
				data-testid="feature-flags-grid"
			>
				{FEATURE_ORDER.map((key) => {
					const meta = FEATURE_META[key];
					return (
						<FeatureFlagCard
							key={key}
							name={meta.name}
							description={meta.description}
							icon={meta.icon}
							enabled={data.features[key]}
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
						<LimitBadge label="Organizations" value={fmtNumber(limits.organizations)} />
						<LimitBadge label="Locations" value={fmtNumber(limits.locations)} />
						<LimitBadge label="Members" value={fmtNumber(limits.members)} />
						<LimitBadge label="Customers" value={fmtNumber(limits.customers)} />
						<LimitBadge label="Monthly txns" value={fmtNumber(limits.monthlyTxns)} />
						<LimitBadge
							label="App fee"
							value={`${(limits.appFeeBps / 100).toFixed(2)}%`}
						/>
						<LimitBadge
							label="Analytics"
							value={limits.analyticsLevel}
						/>
						<LimitBadge
							label="Audit log"
							value={`${limits.auditLogDays}d`}
						/>
					</div>
				</CardContent>
			</Card>

			<p
				className="text-xs text-muted-foreground"
				data-testid="feature-flags-footer-note"
			>
				To change tier and unlock different features, use the Billing
				tab → Tier change.
			</p>
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
