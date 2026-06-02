import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";
import { CustomersFilterSidebar } from "@/components/customers/customers-filter-sidebar";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/v2/view",
)({
	beforeLoad: async () => {
		await requirePermission("customer_management:read");
	},
	validateSearch: (search: Record<string, unknown>) => ({
		customer: (search.customer as string | undefined) ?? undefined,
		showDeleted:
			search.showDeleted === true || search.showDeleted === "true"
				? true
				: undefined,
	}),
	component: CustomersV2Page,
});

const PAGE_LIMIT = 50;

type DirectoryRow = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
	isDeleted?: boolean | null;
	isUnclaimed?: boolean;
};

function CustomersV2Page() {
	const { customer, showDeleted: showDeletedSearch } = Route.useSearch();
	const showDeleted = showDeletedSearch === true;
	const navigate = Route.useNavigate();

	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	const canInvite = hasPermission("user_management:create");
	const [inviteOpen, setInviteOpen] = useState(false);

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

	// Stable reference for the sidebar so tab switches don't recompute it.
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

	const setShowDeleted = (value: boolean) => {
		navigate({
			search: (prev) => ({ ...prev, showDeleted: value || undefined }),
			replace: true,
		});
	};

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

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Customers</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Directory</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{canInvite && (
						<button
							type="button"
							onClick={() => setInviteOpen(true)}
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
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

function EmptyPane({ heading, helper }: { heading: string; helper: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center">
			<p className="text-sm font-medium text-[#0a0a0a]">{heading}</p>
			<p className="mt-1 text-xs text-[#737373]">{helper}</p>
		</div>
	);
}
