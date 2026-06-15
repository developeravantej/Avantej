/**
 * Platform Admin — Risk Flag List (Plan F.1.5, Agent R).
 *
 * Renders the array emitted by computeHealthScore (Agent H) as severity-coded
 * chips with human-readable labels. Empty → reassuring placeholder.
 */

import { AlertOctagon, AlertTriangle, Info } from "lucide-react";

export type RiskFlag = {
	code: string;
	severity: "info" | "warn" | "critical";
	observedAt: string;
};

// Code → human label. Keep inline (small, owned by this view).
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

const SEVERITY_STYLE: Record<
	RiskFlag["severity"],
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

function fmtObserved(iso: string): string {
	if (!iso) return "";
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "";
	const diffSec = Math.round((Date.now() - t) / 1000);
	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
	return new Date(iso).toLocaleDateString();
}

export function RiskFlagList({ flags }: { flags: RiskFlag[] | null }) {
	if (!flags || flags.length === 0) {
		return (
			<div
				className="text-sm text-muted-foreground border rounded-md p-4 text-center"
				data-testid="risk-flags-empty"
			>
				No active risk flags.
			</div>
		);
	}
	// Order critical → warn → info for visual weight.
	const order: Record<RiskFlag["severity"], number> = {
		critical: 0,
		warn: 1,
		info: 2,
	};
	const sorted = [...flags].sort(
		(a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99),
	);
	return (
		<ul
			className="flex flex-wrap gap-2"
			data-testid="risk-flag-list"
			data-count={sorted.length}
		>
			{sorted.map((f, i) => {
				const style = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info;
				const Icon = style.icon;
				return (
					<li
						key={`${f.code}-${i}`}
						className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${style.chip}`}
						data-testid="risk-flag-chip"
						data-flag-code={f.code}
						data-flag-severity={f.severity}
						title={`${f.severity} · observed ${fmtObserved(f.observedAt)}`}
					>
						<Icon className="h-3.5 w-3.5" />
						<span>{labelFor(f.code)}</span>
					</li>
				);
			})}
		</ul>
	);
}

export default RiskFlagList;
