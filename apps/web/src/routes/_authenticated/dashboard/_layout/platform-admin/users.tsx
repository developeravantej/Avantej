import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { usePlatformAdminRole } from "@/hooks/usePlatformAdminRole";
import { UsersTable } from "@/components/platform-admin/users-table";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/users",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
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
	component: PlatformAdminUsersPage,
});

function PlatformAdminUsersPage() {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const debouncedSearch = useDebounce(search, 300);
	const { role } = usePlatformAdminRole();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["admin", "listUsers", { search: debouncedSearch, page }],
		queryFn: () =>
			client.admin.listUsers({
				search: debouncedSearch || undefined,
				page,
				limit: 50,
			}),
	});

	// Reset to page 1 when search changes
	const handleSearch = (q: string) => {
		setSearch(q);
		setPage(1);
	};

	return (
		<div className="p-6 space-y-4">
			<div>
				<div className="text-sm text-muted-foreground">Platform admin</div>
				<h1 className="text-2xl font-semibold">Users</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Manage and impersonate platform users. All actions are audited.
				</p>
			</div>
			<UsersTable
				data={data?.data ?? []}
				isLoading={isLoading}
				callerRole={role}
				searchValue={search}
				onSearch={handleSearch}
				pagination={data?.pagination}
				onPageChange={setPage}
				error={error}
				onRetry={() => refetch()}
			/>
		</div>
	);
}
