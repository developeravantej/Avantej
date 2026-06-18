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
import { PlatformAdminPaymentsPage } from "@/components/pages/platform-admin-payments/PlatformAdminPaymentsPage";
import { client } from "@/utils/orpc";
import { MoneyHubTabs } from "@/components/platform-admin/money-hub-tabs";

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
