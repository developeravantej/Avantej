/**
 * Approvals page — admins/trainers act on customer-purchased packages that
 * landed in `pending` status (gated by org setting package_approval.required).
 *
 * Pattern C: assignment IS approval. Trainers self-assign; admins assign any
 * trainer in their accessible branch. Admins can also reject.
 *
 * Layout: Design 1 — Inbox (Gmail-style dense list with hero KPIs, filter bar,
 * bulk-action bar, date-grouped rows, click-to-expand inline detail panel).
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCsv, getPriority } from "@/features/approvals/approvals.helpers";
import type { PendingRow, PriorityLevel } from "@/features/approvals/approvals.types";
import { BulkActionBar } from "@/features/approvals/components/BulkActionBar";
import { BulkApproveDialog } from "@/features/approvals/components/BulkApproveDialog";
import { BulkRejectDialog } from "@/features/approvals/components/BulkRejectDialog";
import { FilterBar } from "@/features/approvals/components/FilterBar";
import { HeroStats } from "@/features/approvals/components/HeroStats";
import { InboxList } from "@/features/approvals/components/InboxList";
import { RejectPackageDialog } from "@/components/forms/reject-package-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { useUserContext } from "@/hooks/useUserContext";
import { requireRole } from "@/lib/route-guards";
import { client } from "@/utils/orpc";

// ── Main page ─────────────────────────────────────────────────────────────────

function ApprovalsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const navigate = Route.useNavigate();
	const { scope } = Route.useSearch();

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const orgName = currentOrg?.name ?? "Your Organisation";
	const callerRole = currentOrg?.hierarchy?.member?.role ?? null;
	type MemberWithId = NonNullable<typeof currentOrg>["hierarchy"]["member"] & {
		id?: string;
	};
	const callerMemberId =
		(currentOrg?.hierarchy?.member as MemberWithId | null | undefined)?.id ??
		null;

	const isAdmin = callerRole === "admin";
	const isTrainer = callerRole === "trainer";

	const setScope = (s: "all" | "assignable_to_me") => {
		navigate({ search: (prev) => ({ ...prev, scope: s }), replace: true });
	};

	const {
		data: rows,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["packageInstances", "listPending", organizationId, scope],
		queryFn: () =>
			client.packageInstances.listPending({
				organizationId: organizationId!,
				scope,
				limit: 100,
			}),
		enabled: !!organizationId && (isAdmin || isTrainer),
	});

	// Dialog state
	const [rejectPkg, setRejectPkg] = useState<PendingRow | null>(null);
	const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
	const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

	// Inbox UI state
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState("");
	const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>(
		"all",
	);

	const list = useMemo(() => (rows ?? []) as PendingRow[], [rows]);

	const filtered = useMemo(() => {
		let result = list;
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(r) =>
					(r.customerName ?? "").toLowerCase().includes(q) ||
					(r.serviceName ?? "").toLowerCase().includes(q) ||
					(r.customerEmail ?? "").toLowerCase().includes(q),
			);
		}
		if (priorityFilter !== "all") {
			result = result.filter((r) => getPriority(r) === priorityFilter);
		}
		return result;
	}, [list, search, priorityFilter]);

	const priorityCounts = useMemo(
		() => ({
			all: list.length,
			high: list.filter((r) => getPriority(r) === "high").length,
			med: list.filter((r) => getPriority(r) === "med").length,
			low: list.filter((r) => getPriority(r) === "low").length,
		}),
		[list],
	);

	const allChecked =
		filtered.length > 0 && filtered.every((r) => checkedIds.has(r.id));

	function toggleAll() {
		if (allChecked) {
			setCheckedIds(new Set());
		} else {
			setCheckedIds(new Set(filtered.map((r) => r.id)));
		}
	}

	function toggleCheck(id: string) {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function handleReject(row: PendingRow) {
		setRejectPkg(row);
	}

	// Bulk approve: no bulk mutation exists in the file; stubbed visually in BulkActionBar.
	// The "Approve all visible" hero CTA selects all visible rows (surfacing the bulk bar).
	function handleApproveAllVisible() {
		setCheckedIds(new Set(filtered.map((r) => r.id)));
	}

	if (!organizationId) {
		return <PageLoader label="Loading organization…" />;
	}
	if (!isAdmin && !isTrainer) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					message="You don't have permission to view approvals."
				/>
			</div>
		);
	}

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			{/* ░░ TOP APP BAR ░░ */}
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Operations</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Approvals</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={() => refetch()}
						className="rounded-lg p-2 text-muted-foreground transition hover:bg-[#f3f3f3] hover:text-foreground"
						title="Refresh"
					>
						<RefreshCw className="size-4" />
					</button>
				</div>
			</header>

			<div className="px-7 py-8">
				{/* Error banner */}
				{isError && (
					<div className="mb-6">
						<StatusCallout
							variant="error"
							message="Failed to load pending packages."
						/>
					</div>
				)}

				{isLoading ? (
					<PageLoader label="Loading…" />
				) : list.length === 0 ? (
					<div className="flex min-h-[60vh] items-center justify-center">
						<EmptyState
							icon={RefreshCw}
							title="All caught up"
							description="No packages waiting for trainer assignment."
						/>
					</div>
				) : (
					<>
						{/* Hero */}
						<HeroStats
							list={list}
							orgName={orgName}
							filteredCount={filtered.length}
							onApproveAll={handleApproveAllVisible}
							onExport={() => downloadCsv(filtered)}
						/>

						{/* Filter bar */}
						<FilterBar
							search={search}
							onSearch={setSearch}
							priorityFilter={priorityFilter}
							onPriority={setPriorityFilter}
							scope={scope}
							onScope={setScope}
							counts={priorityCounts}
						/>

						{/* Bulk-action bar — appears only when rows are selected */}
						<BulkActionBar
							checkedIds={checkedIds}
							list={list}
							isAdmin={isAdmin}
							onApprove={() => setBulkApproveOpen(true)}
							onReject={() => setBulkRejectOpen(true)}
							onClear={() => setCheckedIds(new Set())}
						/>

						{/* Inbox list */}
						{filtered.length === 0 ? (
							<div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-10 text-center text-sm text-muted-foreground">
								No results match your search.
							</div>
						) : (
							<InboxList
								filtered={filtered}
								expandedId={expandedId}
								checkedIds={checkedIds}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								onToggle={(id) =>
									setExpandedId(expandedId === id ? null : id)
								}
								onCheck={toggleCheck}
								onAssigned={() => refetch()}
								onReject={handleReject}
							/>
						)}

						{/* Footer count */}
						<div className="mt-3 text-center text-xs text-muted-foreground">
							Showing {filtered.length} of {list.length}
						</div>
					</>
				)}
			</div>

			{/* Dialogs */}
			<RejectPackageDialog
				open={!!rejectPkg}
				onOpenChange={(o) => {
					if (!o) setRejectPkg(null);
				}}
				organizationId={organizationId}
				packageInstanceId={rejectPkg?.id ?? null}
				customerName={rejectPkg?.customerName ?? null}
				serviceName={rejectPkg?.serviceName ?? null}
				onRejected={() => refetch()}
			/>

			<BulkApproveDialog
				open={bulkApproveOpen}
				onOpenChange={setBulkApproveOpen}
				organizationId={organizationId}
				selectedRows={list.filter((r) => checkedIds.has(r.id))}
				onDone={() => {
					setCheckedIds(new Set());
					refetch();
				}}
			/>

			<BulkRejectDialog
				open={bulkRejectOpen}
				onOpenChange={setBulkRejectOpen}
				organizationId={organizationId}
				selectedRows={list.filter((r) => checkedIds.has(r.id))}
				onDone={() => {
					setCheckedIds(new Set());
					refetch();
				}}
			/>
		</div>
	);
}

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/operations/approvals",
)({
	beforeLoad: async () => {
		await requireRole(["admin", "trainer"]);
	},
	validateSearch: (search: Record<string, unknown>) => ({
		scope: (
			search.scope === "assignable_to_me" ? "assignable_to_me" : "all"
		) as "all" | "assignable_to_me",
	}),
	component: ApprovalsPage,
});
