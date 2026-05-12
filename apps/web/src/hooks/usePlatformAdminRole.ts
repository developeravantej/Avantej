import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

export function usePlatformAdminRole() {
	const { data, isLoading } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
		staleTime: 5 * 60_000,
	});
	return {
		isPlatformAdmin: data?.isPlatformAdmin ?? false,
		role: data?.role ?? null,
		isLoading,
	};
}
