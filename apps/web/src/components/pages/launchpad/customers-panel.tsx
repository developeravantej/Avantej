import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";

const PAGE_LIMIT = 50;

type DirectoryRow = {
	memberId: string;
	name: string;
	email: string;
	isDeleted?: boolean | null;
	isUnclaimed?: boolean;
};

/**
 * Embedded customer directory for the Dashboard launchpad. Reuses the same
 * sub-components as the full /customers/v2 page but keeps selection + filter
 * state local (no route search), so it works inside the master/detail panel.
 */
export function CustomersPanel({ organizationId }: { organizationId: string }) {
	const { hasPermission } = useUserContext();
	const canRead = hasPermission("customer_management:read");

	const [search, setSearch] = useState("");
	const [showDeleted, setShowDeleted] = useState(false);
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const debouncedSearch = useDebounce(search, 300);

	const { data: listData, isLoading } = useQuery({
		...orpc.customerDirectory.list.queryOptions({
			input: {
				organizationId,
				search: debouncedSearch || undefined,
				includeDeleted: showDeleted || undefined,
				limit: PAGE_LIMIT,
				offset: 0,
			},
		}),
		enabled: canRead,
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		placeholderData: (prev) => prev,
	});

	const rows: DirectoryRow[] = (listData?.rows ?? []) as DirectoryRow[];
	const totalCount = listData?.total ?? rows.length;

	const sidebarCustomers = useMemo(
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

	// Keep a valid selection: auto-pick the first row, or re-pick if the current
	// selection drops out of the filtered list.
	useEffect(() => {
		if (rows.length === 0) return;
		if (selectedMemberId && rows.some((r) => r.memberId === selectedMemberId)) {
			return;
		}
		setSelectedMemberId(rows[0].memberId);
	}, [rows, selectedMemberId]);

	return (
		<div className="-mx-6 -my-6 flex h-full min-h-[460px] gap-4 overflow-hidden">
			<div className="h-full w-[240px] shrink-0">
				<CustomersFilterSidebar
					customers={sidebarCustomers}
					totalCount={totalCount}
					isLoading={isLoading}
					selectedCustomerId={selectedMemberId}
					onSelectCustomer={setSelectedMemberId}
					search={search}
					onSearchChange={setSearch}
					showDeleted={showDeleted}
					onShowDeletedChange={setShowDeleted}
				/>
			</div>
			<div className="flex h-full min-w-0 flex-1 flex-col overflow-auto border-l border-[#e8ebf0] pl-4">
				{!canRead ? (
					<EmptyPane
						heading="Access denied"
						helper="You don't have permission to view the customer directory."
					/>
				) : !selectedMemberId ? (
					<EmptyPane
						heading={isLoading ? "Loading customers…" : "No customers yet"}
						helper={
							isLoading ? "Hang tight." : "Create a customer to get started."
						}
					/>
				) : (
					<CustomerProfilePanel
						memberId={selectedMemberId}
						showBackLink={false}
						onDeleted={() => setSelectedMemberId(null)}
					/>
				)}
			</div>
		</div>
	);
}

function EmptyPane({ heading, helper }: { heading: string; helper: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center">
			<p className="text-sm font-medium text-[#0a0a0a]">{heading}</p>
			<p className="mt-1 text-xs text-[#737373]">{helper}</p>
		</div>
	);
}
