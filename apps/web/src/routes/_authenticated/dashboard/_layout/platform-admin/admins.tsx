import { createFileRoute, redirect } from "@tanstack/react-router";
import { PlatformAdminAdminsPage } from "@/components/pages/platform-admin-admins/PlatformAdminAdminsPage";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/admins",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin || result.role !== "super_admin") {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			// Re-throw TanStack Router redirects — do not swallow them
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
	component: PlatformAdminAdminsPage,
});
