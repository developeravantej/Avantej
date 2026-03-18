/**
 * useUserAssignment Hook
 *
 * Provides member listing and role/status management using oRPC client.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc, client } from "@/utils/orpc";

export function useUserAssignment(organizationId: string) {
	const qc = useQueryClient();

	const usersQuery = useQuery({
		...orpc.members.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const updateRole = useMutation({
		mutationFn: (input: {
			memberId: string;
			newRole: "admin" | "trainer" | "staff" | "client";
		}) => client.members.updateRole({ organizationId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.members.list.key() }),
	});

	const suspend = useMutation({
		mutationFn: (memberId: string) =>
			client.members.suspend({ organizationId, memberId }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.members.list.key() }),
	});

	const reactivate = useMutation({
		mutationFn: (memberId: string) =>
			client.members.reactivate({ organizationId, memberId }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.members.list.key() }),
	});

	return { usersQuery, updateRole, suspend, reactivate };
}
