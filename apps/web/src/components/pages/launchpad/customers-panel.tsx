import { useState } from "react";

import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { DirectoryEmptyPane } from "@/components/customers/directory-empty-pane";
import { useCustomerDirectory } from "@/hooks/useCustomerDirectory";
import { useUserContext } from "@/hooks/useUserContext";

/**
 * Embedded customer directory for the Dashboard launchpad. Selection + filter
 * state are kept local (no route search) so it works inside the master/detail
 * panel; the data layer is shared with the full page via useCustomerDirectory.
 */
export function CustomersPanel({ organizationId }: { organizationId: string }) {
	const { hasPermission } = useUserContext();
	const canRead = hasPermission("customer_management:read");

	const [showDeleted, setShowDeleted] = useState(false);
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

	const { search, setSearch, sidebarCustomers, totalCount, isLoading } =
		useCustomerDirectory({
			organizationId,
			canRead,
			showDeleted,
			selectedMemberId,
			onSelectMember: setSelectedMemberId,
		});

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
					<DirectoryEmptyPane
						heading="Access denied"
						helper="You don't have permission to view the customer directory."
					/>
				) : !selectedMemberId ? (
					<DirectoryEmptyPane
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
