import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { DirectoryEmptyPane } from "@/components/customers/directory-empty-pane";
import { useCustomerDirectory } from "@/hooks/useCustomerDirectory";
import { useUserContext } from "@/hooks/useUserContext";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { useScope } from "@/components/scope/ScopeProvider";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/v2/view",
)({
	beforeLoad: async () => {
		await requirePermission("customer_management:read");
	},
	validateSearch: z.object({
		customer: z.string().optional(),
		showDeleted: z
			.unknown()
			.transform((v) =>
				v === true || v === "true" ? (true as const) : undefined,
			),
	}),
	component: CustomersV2Page,
});

function CustomersV2Page() {
	const { customer, showDeleted: showDeletedSearch } = Route.useSearch();
	const showDeleted = showDeletedSearch === true;
	const navigate = Route.useNavigate();

	const { data: userContext, hasPermission } = useUserContext();
	const { scopeNodeId } = useScope();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	const canInvite = hasPermission("user_management:create");
	const [inviteOpen, setInviteOpen] = useState(false);

	// Selection + showDeleted live in the URL so they survive any remount.
	const selectedMemberId = customer ?? null;
	const setSelectedMemberId = (id: string | null) => {
		navigate({
			search: (prev) => ({ ...prev, customer: id ?? undefined }),
			replace: true,
		});
	};
	const setShowDeleted = (value: boolean) => {
		navigate({
			search: (prev) => ({ ...prev, showDeleted: value || undefined }),
			replace: true,
		});
	};

	const { search, setSearch, sidebarCustomers, totalCount, isLoading } =
		useCustomerDirectory({
			organizationId,
			canRead,
			showDeleted,
			selectedMemberId,
			onSelectMember: setSelectedMemberId,
			scopeNodeId,
		});

	// When the scope changes, the previously-selected customer may not exist in
	// the new scope — clear the selection so the directory empty pane shows
	// instead of a stale profile. Ref-guarded so a deep-linked ?customer= still
	// loads on initial mount.
	const prevScopeRef = useRef(scopeNodeId);
	useEffect(() => {
		if (prevScopeRef.current !== scopeNodeId) {
			prevScopeRef.current = scopeNodeId;
			setSelectedMemberId(null);
		}
		// setSelectedMemberId is a stable navigate wrapper; scope is the trigger.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scopeNodeId]);

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Customers</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Directory</span>
				</div>
				<div className="ml-auto flex min-w-0 items-center gap-2">
					{/* AVANTEJ-11: ScopeSwitcher's trigger is w-full by default, which
					    inflated this auto-width toolbar and forced page overflow, clipping
					    the Add Customer button into an unlabelled black square. Constrain
					    it here and keep the button from shrinking. */}
					<ScopeSwitcher className="w-auto max-w-[220px]" />
					{canInvite && (
						<button
							type="button"
							onClick={() => setInviteOpen(true)}
							className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
						>
							<Plus className="h-3.5 w-3.5" />
							Add Customer
						</button>
					)}
				</div>
			</header>

			{/* ── Split-pane: sidebar + tab content ────────────────────────────── */}
			<div className="flex flex-1 min-h-0 gap-5 overflow-hidden px-6 py-6">
				<div className="h-full w-[260px] shrink-0">
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

				<div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					<div className="flex-1 overflow-auto">
						{!organizationId ? (
							<DirectoryEmptyPane
								heading="No organization selected"
								helper="Select an organization to view customers."
							/>
						) : !canRead ? (
							<DirectoryEmptyPane
								heading="Access denied"
								helper="You don't have permission to view the customer directory."
							/>
						) : !selectedMemberId ? (
							<DirectoryEmptyPane
								heading={isLoading ? "Loading customers…" : "No customers yet"}
								helper={
									isLoading
										? "Hang tight."
										: "Invite your first customer to get started."
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
			</div>

			{organizationId && (
				<AddCustomerDialog
					open={inviteOpen}
					onOpenChange={setInviteOpen}
					organizationId={organizationId}
				/>
			)}
		</div>
	);
}
