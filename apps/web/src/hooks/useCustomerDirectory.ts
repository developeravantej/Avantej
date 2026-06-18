import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { orpc } from "@/utils/orpc";

const PAGE_LIMIT = 50;

export type DirectoryRow = {
	memberId: string;
	userId?: string;
	name: string;
	email: string;
	isDeleted?: boolean | null;
	isUnclaimed?: boolean;
};

export type SidebarCustomer = {
	id: string;
	name: string;
	email: string;
	isDeleted: boolean | null;
	isUnclaimed: boolean;
};

/**
 * Shared customer-directory data layer for the full /customers/v2 page and the
 * embedded launchpad CustomersPanel. Owns search/debounce + the directory query
 * + sidebar mapping + the auto-select-first effect. Selection and showDeleted
 * are *injected* because the page keeps them in the URL while the panel keeps
 * them in local state — the only legitimate difference between the two.
 */
export function useCustomerDirectory({
	organizationId,
	canRead,
	showDeleted,
	selectedMemberId,
	onSelectMember,
}: {
	organizationId: string | null;
	canRead: boolean;
	showDeleted: boolean;
	selectedMemberId: string | null;
	onSelectMember: (id: string) => void;
}) {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	const { data: listData, isLoading } = useQuery({
		...orpc.customerDirectory.list.queryOptions({
			input: {
				organizationId: organizationId!,
				search: debouncedSearch || undefined,
				includeDeleted: showDeleted || undefined,
				limit: PAGE_LIMIT,
				offset: 0,
			},
		}),
		enabled: !!organizationId && canRead,
		// Don't flicker the sidebar on tab switches / window focus.
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		placeholderData: (prev) => prev,
	});

	const rows: DirectoryRow[] = (listData?.rows ?? []) as DirectoryRow[];
	const totalCount = listData?.total ?? rows.length;

	const sidebarCustomers: SidebarCustomer[] = useMemo(
		() =>
			rows.map((r) => ({
				id: r.memberId,
				name: r.name,
				email: r.email,
				isDeleted: r.isDeleted ?? null,
				isUnclaimed: r.isUnclaimed ?? false,
			})),
		[rows],
	);

	// Auto-select the first customer once data arrives, OR re-pick the first if
	// the current selection drops out of the filtered list.
	useEffect(() => {
		if (rows.length === 0) return;
		if (selectedMemberId && rows.some((r) => r.memberId === selectedMemberId)) {
			return;
		}
		onSelectMember(rows[0].memberId);
	}, [rows, selectedMemberId, onSelectMember]);

	return { search, setSearch, sidebarCustomers, totalCount, isLoading };
}
