import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { PackagesTab } from "@/components/pages/customers/v2";
import { PosWorkflow } from "@/components/pos/pos-workflow";
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
	const [editSheetOpen, setEditSheetOpen] = useState(false);
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
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3] p-6">
			{/* ── Page header ─────────────────────────────────────────────────── */}
			<div className="mb-5 flex items-end justify-between shrink-0">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						Customer Directory
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Customers
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						<span className="font-mono tabular-nums">{totalCount.toLocaleString()}</span>{" "}
						customer{totalCount === 1 ? "" : "s"}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{selectedMemberId && (
						<button
							type="button"
							onClick={() => setEditSheetOpen(true)}
							className="inline-flex items-center gap-1.5 border border-[#e5e5e5] bg-white text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#f3f3f3] transition"
						>
							<Pencil className="h-4 w-4" />
							Edit Profile
						</button>
					)}
					{canInvite && (
						<button
							type="button"
							onClick={() => setInviteOpen(true)}
							className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
						>
							<Plus className="h-4 w-4" />
							Add Customer
						</button>
					)}
				</div>
			</div>

			{/* ── Tab pills ───────────────────────────────────────────────────── */}
			<div className="mb-5 flex flex-wrap items-center gap-2 shrink-0">
				{NAV_TABS.map((t) => {
					const isActive = activeTab === t.id;
					return (
						<button
							key={t.id}
							type="button"
							onClick={() =>
								navigate({
									search: (prev) => ({ ...prev, tab: t.id }),
								})
							}
							className={
								isActive
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold transition"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#fafafa] px-3.5 py-1.5 text-[13px] font-medium transition"
							}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			{/* ── Split-pane: sidebar + tab content ────────────────────────────── */}
			<div className="flex flex-1 min-h-0 gap-5 overflow-hidden">
				<div className="h-full w-[260px] shrink-0">
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

				<div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					<div className="flex-1 overflow-auto">
						{!organizationId ? (
							<EmptyPane
								heading="No organization selected"
								helper="Select an organization to view customers."
							/>
						) : !canRead ? (
							<EmptyPane
								heading="Access denied"
								helper="You don't have permission to view the customer directory."
							/>
						) : !selectedMemberId ? (
							<EmptyPane
								heading={isLoading ? "Loading customers…" : "No customers yet"}
								helper={
									isLoading
										? "Hang tight."
										: "Invite your first customer to get started."
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

			{organizationId && selectedMemberId && (
				<CustomerDetailSheet
					memberId={selectedMemberId}
					organizationId={organizationId}
					open={editSheetOpen}
					onOpenChange={setEditSheetOpen}
					onSaved={() => {}}
				/>
			)}
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

