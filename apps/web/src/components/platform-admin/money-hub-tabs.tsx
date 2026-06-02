/**
 * Platform Admin — Money hub route-tab bar.
 *
 * Renders a route-level tab strip shared by the four platform-admin money
 * pages (Billing / Revenue / Renewals / Payments). The standalone routes are
 * unchanged — this is purely additive navigation that replaces the four flat
 * sidebar entries with one "Billing" entry plus these tabs.
 */

import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const MONEY_TABS = [
	{ label: "Overview", to: "/dashboard/platform-admin/billing" },
	{ label: "Revenue", to: "/dashboard/platform-admin/revenue" },
	{ label: "Renewals", to: "/dashboard/platform-admin/renewals" },
	{ label: "Payments", to: "/dashboard/platform-admin/payments" },
] as const;

export function MoneyHubTabs() {
	const { pathname } = useLocation();

	return (
		<nav
			className="flex items-center gap-1 border-b border-border"
			data-testid="money-hub-tabs"
			aria-label="Billing sections"
		>
			{MONEY_TABS.map((tab) => {
				const active = pathname.startsWith(tab.to);
				return (
					<Link
						key={tab.to}
						to={tab.to as string}
						className={cn(
							"-mb-px border-b-2 px-3 py-2 font-medium text-sm transition-colors",
							active
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
						data-testid={`money-hub-tab-${tab.label.toLowerCase()}`}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
