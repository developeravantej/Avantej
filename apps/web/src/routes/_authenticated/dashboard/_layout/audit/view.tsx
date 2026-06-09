import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { AuditLogPage } from "@/components/pages/audit/AuditLogPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/audit/view",
)({
	beforeLoad: async () => {
		await requirePermission("audit_log:read");
	},
	component: AuditLogPage,
});
