/**
 * Platform Admin — Risk Flag Rollup (Plan F.4 — Agent He).
 *
 * Cross-tenant count of each risk-flag code (from each org's latest
 * snapshot's risk_flags jsonb). Sorted by count DESC. Severity drives
 * the chip color. Empty state is reassuring, not red.
 *
 * Per Plan F.4 brief: the FLAG_LABELS map mirrors the one in
 * risk-flag-list.tsx (Agent R). Duplicated intentionally — keeping the
 * source-of-truth there is fine for now; if we grow more flags we'll
 * extract a shared util.
 */

import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type FlagRollupItem = {
	flagCode: string;
	severity: "info" | "warn" | "critical";
	count: number;
	uniqueOrgs: number;
};

// Mirrors risk-flag-list.tsx FLAG_LABELS (intentional duplication — Plan F.4).
const FLAG_LABELS: Record<string, string> = {
	subscription_cancelled: "Subscription cancelled",
	subscription_past_due: "Subscription past due",
	payment_stale: "No payment in 35+ days",
	low_activity: "Low daily active members",
	inactive_admin: "Admin not logged in 14+ days",
	webhook_failures: "Webhook failures (last 7d)",
	no_data: "Signal not yet tracked",
};

function labelFor(code: string): string {
	return FLAG_LABELS[code] ?? code.replace(/_/g, " ");
}

const SEVERITY: Record<
	FlagRollupItem["severity"],
	{ chip: string; icon: typeof Info }
> = {
	critical: {
		chip: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
		icon: AlertOctagon,
	},
	warn: {
		chip: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
		icon: AlertTriangle,
	},
	info: {
		chip: "bg-muted text-muted-foreground border-border",
		icon: Info,
	},
};

export function RiskFlagRollup({ flags }: { flags: FlagRollupItem[] }) {
	return (
		<Card data-testid="risk-flag-rollup">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Risk flags across tenants</CardTitle>
				<div className="text-xs text-muted-foreground">
					Counted from each tenant's most recent daily snapshot.
				</div>
			</CardHeader>
			<CardContent>
				{flags.length === 0 ? (
					<div
						className="text-sm text-muted-foreground py-6 text-center"
						data-testid="risk-flag-rollup-empty"
					>
						No risk flags raised — every tenant is healthy.
					</div>
				) : (
					<ul className="space-y-1.5" data-testid="risk-flag-rollup-list">
						{flags.map((f) => {
							const sev = SEVERITY[f.severity] ?? SEVERITY.info;
							const Icon = sev.icon;
							return (
								<li
									key={f.flagCode}
									className="flex items-center gap-3 border-b last:border-0 pb-1.5 last:pb-0"
									data-testid="risk-flag-rollup-row"
									data-flag-code={f.flagCode}
									data-flag-severity={f.severity}
									data-flag-count={f.count}
								>
									<span
										className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${sev.chip}`}
									>
										<Icon className="h-3 w-3" />
										<span className="capitalize">{f.severity}</span>
									</span>
									<span
										className="flex-1 min-w-0 text-sm truncate"
										title={f.flagCode}
									>
										{labelFor(f.flagCode)}
									</span>
									<span className="text-xs text-muted-foreground">
										in {f.uniqueOrgs} org{f.uniqueOrgs === 1 ? "" : "s"}
									</span>
									<Badge
										variant="secondary"
										className="text-xs font-mono tabular-nums"
									>
										{f.count}
									</Badge>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export default RiskFlagRollup;
