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
import { z } from "zod";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
	downloadCsv,
	getPriority,
} from "@/features/approvals/approvals.helpers";
import type {
	ApprovalStatus,
	PendingRow,
	PriorityLevel,
} from "@/features/approvals/approvals.types";
import { FilterBar } from "@/features/approvals/components/FilterBar";
import { HeroStats } from "@/features/approvals/components/HeroStats";
import { InboxList } from "@/features/approvals/components/InboxList";
import { ScheduleSessionsPanel } from "@/features/approvals/components/ScheduleSessionsPanel";
import { RejectPackageDialog } from "@/components/forms/reject-package-dialog";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { useScope } from "@/components/scope/ScopeProvider";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { useUserContext } from "@/hooks/useUserContext";
import { requireRole } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";

// ── Main page ─────────────────────────────────────────────────────────────────

function ApprovalsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { scopeNodeId } = useScope();
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

	const [approvalStatus, setApprovalStatus] =
		useState<ApprovalStatus>("pending");

	const {
		data: rows,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.packageInstances.listPending.queryOptions({
			input: {
				organizationId: organizationId!,
				branchId: scopeNodeId,
				scope,
				limit: 100,
				approvalStatus,
			},
		}),
		enabled: !!organizationId && (isAdmin || isTrainer),
	});

	// Dialog state
	const [rejectPkg, setRejectPkg] = useState<PendingRow | null>(null);
	// Page-level schedule panel — lives here (not in a row) so it survives the
	// package leaving the pending list after assignment.
	const [schedulePkgId, setSchedulePkgId] = useState<string | null>(null);

	// Inbox UI state
	const [expandedId, setExpandedId] = useState<string | null>(null);
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

	function handleReject(row: PendingRow) {
		setRejectPkg(row);
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
					<ScopeSwitcher className="h-9 w-[220px]" />
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
				) : (
					<>
						{/* Hero */}
						<HeroStats
							list={list}
							orgName={orgName}
							approvalStatus={approvalStatus}
						/>

						{/* Filter bar (always visible so an empty tab never traps the user) */}
						<FilterBar
							search={search}
							onSearch={setSearch}
							priorityFilter={priorityFilter}
							onPriority={setPriorityFilter}
							scope={scope}
							onScope={setScope}
							counts={priorityCounts}
							approvalStatus={approvalStatus}
							onApprovalStatus={(s) => {
								setApprovalStatus(s);
								setExpandedId(null);
							}}
							onExport={() => downloadCsv(filtered)}
							exportDisabled={list.length === 0}
						/>

						{/* Inbox list */}
						{list.length === 0 ? (
							<div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-12 text-center text-sm text-muted-foreground">
								{approvalStatus === "awaiting_payment"
									? "No packages awaiting payment confirmation."
									: approvalStatus === "approved"
										? "No approved packages yet."
										: approvalStatus === "rejected"
											? "No rejected packages."
											: "No packages waiting for trainer assignment."}
							</div>
						) : filtered.length === 0 ? (
							<div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-10 text-center text-sm text-muted-foreground">
								No results match your search.
							</div>
						) : (
							<InboxList
								filtered={filtered}
								expandedId={expandedId}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								approvalStatus={approvalStatus}
								onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
								onAssigned={() => refetch()}
								onReject={handleReject}
								onSchedule={(packageInstanceId) =>
									setSchedulePkgId(packageInstanceId)
								}
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

			<ScheduleSessionsPanel
				open={schedulePkgId !== null}
				onClose={() => setSchedulePkgId(null)}
				organizationId={organizationId}
				packageInstanceId={schedulePkgId}
				mode="full"
				onScheduled={() => refetch()}
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
	validateSearch: z.object({
		scope: z.enum(["all", "assignable_to_me"]).catch("all"),
	}),
	component: ApprovalsPage,
});
