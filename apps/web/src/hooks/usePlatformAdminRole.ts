import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export function usePlatformAdminRole() {
	const { data, isLoading } = useQuery({
		...orpc.admin.me.queryOptions({ input: {} }),
		staleTime: 5 * 60_000,
	});
	return {
		isPlatformAdmin: data?.isPlatformAdmin ?? false,
		role: data?.role ?? null,
		isLoading,
	};
}
