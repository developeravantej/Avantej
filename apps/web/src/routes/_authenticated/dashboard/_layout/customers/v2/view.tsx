import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { PackagesTab } from "@/components/pages/customers/v2";
import { PosWorkflow } from "@/components/pos/pos-workflow";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/v2/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "customers",
		customer: (search.customer as string | undefined) ?? undefined,
	}),
	component: CustomersV2Page,
});

const NAV_TABS = [
	{ id: "customers", label: "Customers" },
	{ id: "packages", label: "Packages" },
	{ id: "new-sale", label: "New Sale" },
] as const;

const PAGE_LIMIT = 50;

type DirectoryRow = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
};

function CustomersV2Page() {
	const { tab, customer } = Route.useSearch();
	const navigate = Route.useNavigate();
	const activeTab = NAV_TABS.some((t) => t.id === tab) ? tab : "customers";

	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	const canInvite = hasPermission("user_management:create");
	const [inviteOpen, setInviteOpen] = useState(false);
	const currentOrg = userContext?.organizations.find((o) => o.id === organizationId);
	const accessibleNodeIds = currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	// Selected customer lives in the URL so it survives any remount.
	const selectedMemberId = customer ?? null;
	const setSelectedMemberId = (id: string | null) => {
		navigate({
			search: (prev) => ({ ...prev, customer: id ?? undefined }),
			replace: true,
		});
	};

	const { data: listData, isLoading } = useQuery({
		queryKey: ["customerDirectory", organizationId, debouncedSearch],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			return client.customerDirectory.list({
				organizationId,
				search: debouncedSearch || undefined,
				limit: PAGE_LIMIT,
				offset: 0,
			});
		},
		enabled: !!organizationId && canRead,
		// Don't flicker the sidebar on tab switches / window focus.
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		placeholderData: (prev) => prev,
	});

	const rows: DirectoryRow[] = (listData?.rows ?? []) as DirectoryRow[];
	const totalCount = listData?.total ?? rows.length;

	// Stable reference for the sidebar so tab switches don't recompute it.
	const sidebarCustomers = useMemo(
		() => rows.map((r) => ({ id: r.memberId, name: r.name, email: r.email })),
		[rows],
	);

	// Auto-select the first customer once data arrives, OR re-pick the first
	// if the current URL selection drops out of the filtered list.
	useEffect(() => {
		if (rows.length === 0) return;
		if (selectedMemberId && rows.some((r) => r.memberId === selectedMemberId)) {
			return;
		}
		navigate({
			search: (prev) => ({ ...prev, customer: rows[0].memberId }),
			replace: true,
		});
	}, [rows, selectedMemberId, navigate]);

	const selectedCustomer = rows.find((r) => r.memberId === selectedMemberId);
	const selectedUserId = selectedCustomer?.userId ?? null;

	return (
		<div className="p-6">
			<div className="overflow-hidden rounded-xl border bg-card shadow-sm">
				{/* Navigation tabs */}
				<div className="flex items-center border-b">
					<div className="flex flex-1">
						{NAV_TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() =>
									navigate({
										search: (prev) => ({ ...prev, tab: t.id }),
									})
								}
								className={`-mb-px border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
									activeTab === t.id
										? "border-foreground text-foreground"
										: "border-transparent text-muted-foreground hover:text-foreground"
								}`}
							>
								{t.label}
							</button>
						))}
					</div>
					{canInvite && (
						<Button size="sm" className="mr-3 gap-1.5" onClick={() => setInviteOpen(true)}>
							<Plus className="h-3.5 w-3.5" />
							Add Customer
						</Button>
					)}
				</div>

				{/* Split-pane: sidebar + tab content */}
				<div className="flex h-[calc(100vh-12rem)] gap-4 p-4">
					<div className="h-full w-60 shrink-0">
						<CustomersFilterSidebar
							customers={sidebarCustomers}
							totalCount={totalCount}
							isLoading={isLoading}
							selectedCustomerId={selectedMemberId}
							onSelectCustomer={setSelectedMemberId}
							search={search}
							onSearchChange={setSearch}
						/>
					</div>

					<div className="flex h-full min-w-0 flex-1 flex-col overflow-auto">
						{!organizationId ? (
							<EmptyPane message="Select an organization to view customers." />
						) : !canRead ? (
							<EmptyPane message="You don't have permission to view the customer directory." />
						) : !selectedMemberId ? (
							<EmptyPane
								message={
									isLoading ? "Loading customers…" : "No customers found."
								}
							/>
						) : activeTab === "customers" ? (
							<CustomerProfilePanel
								memberId={selectedMemberId}
								showBackLink={false}
							/>
						) : activeTab === "new-sale" ? (
							<PosWorkflow
								key={selectedMemberId}
								prefillCustomerId={selectedMemberId}
								showHeader={false}
								hideCustomerStep
							/>
						) : (
							<PackagesTab
								organizationId={organizationId}
								clientUserId={selectedUserId ?? undefined}
								accessibleNodeIds={accessibleNodeIds}
							/>
						)}
					</div>
				</div>
			</div>
			{organizationId && (
				<CreateInvitationDialog
					open={inviteOpen}
					onOpenChange={setInviteOpen}
					organizationId={organizationId}
					lockedRole="client"
					title="Add Customer"
					description="Send an invitation. The customer will receive an email with a link to set up their account."
				/>
			)}
		</div>
	);
}

function EmptyPane({ message }: { message: string }) {
	return (
		<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
			{message}
		</div>
	);
}

