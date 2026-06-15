import { createFileRoute, redirect } from "@tanstack/react-router";
import { client } from "@/utils/orpc";
import { TenantDrillInPage } from "@/components/pages/platform-admin-tenant/TenantDrillInPage";

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
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <TenantDrillInPage id={id} />;
}
