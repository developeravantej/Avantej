/**
 * useRoles Hook
 *
 * Provides CRUD operations for roles using oRPC client.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc, client } from "@/utils/orpc";

export function useRoles(organizationId: string) {
	const qc = useQueryClient();

	const rolesQuery = useQuery({
		...orpc.roles.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const createRole = useMutation({
		mutationFn: (input: {
			name: string;
			description?: string;
			priority: number;
		}) => client.roles.create({ organizationId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.roles.list.key() }),
	});

	const updateRole = useMutation({
		mutationFn: (input: {
			id: string;
			name?: string;
			description?: string | undefined;
			priority?: number;
		}) => client.roles.update({ organizationId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.roles.list.key() }),
	});

	const deleteRole = useMutation({
		mutationFn: (id: string) =>
			client.roles.delete({ organizationId, id }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.roles.list.key() }),
	});

	const addPermission = useMutation({
		mutationFn: (input: { roleId: string; permissionId: string }) =>
			client.rolePermissions.add({ organizationId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({
				queryKey: orpc.rolePermissions.list.key(),
			}),
	});

	const removePermission = useMutation({
		mutationFn: (input: { roleId: string; permissionId: string }) =>
			client.rolePermissions.remove({ organizationId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({
				queryKey: orpc.rolePermissions.list.key(),
			}),
	});

	return {
		rolesQuery,
		createRole,
		updateRole,
		deleteRole,
		addPermission,
		removePermission,
	};
}

/**
 * @deprecated useRoleMatrix is no longer needed — use useRoles + usePermissions instead.
 * Kept as a stub to avoid import errors in existing consumer pages.
 */
export function useRoleMatrix() {
	return {
		matrix: null,
		setMatrix: () => {},
		loading: false,
		error: null,
		fetchMatrix: async () => {},
		assignUserToRole: async () => {},
		removeUserFromRole: async () => {},
	};
}
