import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { Plus, Search, ChevronDown } from "lucide-react";
import {
	type AnnouncementRow,
	type FormState,
	type Priority,
	type StatusFilter,
	type TargetAudience,
	EMPTY_FORM,
} from "./types";
import { AnnouncementsFilterRail } from "./AnnouncementsFilterRail";
import { AnnouncementListItem } from "./AnnouncementListItem";
import { AnnouncementsEmptyState } from "./AnnouncementsEmptyState";
import { AnnouncementFormDialog } from "./AnnouncementFormDialog";
import { AnnouncementDeleteDialog } from "./AnnouncementDeleteDialog";
import { AnnouncementDeactivateDialog } from "./AnnouncementDeactivateDialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

type HierarchyNode = { id: string; name: string; depth: number };

// ─── Main component ───────────────────────────────────────────────────────────

export function AnnouncementsViewPage() {
	const { data: userContext } = useUserContext();
	const { scopeNodeId } = useScope();
	const organizationId = userContext?.currentOrganizationId ?? null;
	// Base orpc key — prefix-matches every announcements.list variant
	// (status/branch filter inputs), unlike a hand-rolled
	// ["announcements", organizationId] key which matches nothing.
	const announcementsKey = orpc.announcements.list.key();

	// Filters
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [audienceFilter, setAudienceFilter] = useState<string>("all");
	const [search, setSearch] = useState("");
	const [sortNewest, setSortNewest] = useState(true);

	// Expanded row
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// Form / dialog state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Confirmation dialogs
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);

	// API isActive filter
	const isActiveFilter =
		statusFilter === "active"
			? true
			: statusFilter === "inactive"
				? false
				: undefined;

	const {
		data: apiData = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.announcements.list.queryOptions({
			input: {
				organizationId: organizationId!,
				isActive: isActiveFilter,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId,
	});

	const { data: hierarchyNodesResult } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});
	const hierarchyNodes = hierarchyNodesResult?.nodes as
		| HierarchyNode[]
		| undefined;

	const nodeNameMap: Record<string, string> = {};
	for (const node of hierarchyNodes ?? []) {
		nodeNameMap[node.id] = node.name;
	}

	// ─── Mutations ──────────────────────────────────────────────────────────

	const createMutation = useApiMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.create({
				organizationId,
				title: values.title,
				message: values.message,
				priority: values.priority,
				targetAudience: values.targetAudience,
				startDate: values.startDate
					? new Date(values.startDate).toISOString()
					: undefined,
				endDate: values.endDate
					? new Date(values.endDate).toISOString()
					: undefined,
				isPinned: values.isPinned,
				requiresAcknowledgement: values.requiresAcknowledgement,
				scopedBranchIds: values.scopedBranchIds,
			});
		},
		successMessage: "Announcement created successfully.",
		errorMessage: (err) => err.message || "Failed to create announcement.",
		invalidate: [announcementsKey],
		onSuccess: () => {
			setSheetOpen(false);
			setForm(EMPTY_FORM);
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: ({ id, values }: { id: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.update({
				organizationId,
				id,
				title: values.title,
				message: values.message,
				priority: values.priority,
				targetAudience: values.targetAudience,
				startDate: values.startDate
					? new Date(values.startDate).toISOString()
					: undefined,
				endDate: values.endDate
					? new Date(values.endDate).toISOString()
					: undefined,
				isPinned: values.isPinned,
				requiresAcknowledgement: values.requiresAcknowledgement,
				scopedBranchIds: values.scopedBranchIds,
			});
		},
		successMessage: "Announcement updated successfully.",
		errorMessage: (err) => err.message || "Failed to update announcement.",
		invalidate: [announcementsKey],
		onSuccess: () => {
			setSheetOpen(false);
			setEditingId(null);
			setForm(EMPTY_FORM);
		},
	});

	const pinMutation = useApiMutation({
		mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.update({ organizationId, id, isPinned });
		},
		successMessage: "Pin updated.",
		errorMessage: (err) => err.message || "Failed to update pin.",
		invalidate: [announcementsKey],
	});

	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.update({
				organizationId,
				id,
				isActive: false,
			});
		},
		successMessage: "Announcement deactivated.",
		errorMessage: (err) => err.message || "Failed to deactivate announcement.",
		invalidate: [announcementsKey],
	});

	const deleteMutation = useApiMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.delete({ organizationId, id });
		},
		successMessage: "Announcement deleted.",
		errorMessage: (err) => err.message || "Failed to delete announcement.",
		invalidate: [announcementsKey],
	});

	// ─── Derived data ────────────────────────────────────────────────────────

	const allRows: AnnouncementRow[] = apiData.map((item) => ({
		id: item.id,
		title: item.title,
		message: item.message,
		priority: item.priority as Priority,
		targetAudience: item.targetAudience as TargetAudience,
		branchId: item.branchId ?? null,
		startDate: item.startDate ? String(item.startDate) : null,
		endDate: item.endDate ? String(item.endDate) : null,
		isPinned: item.isPinned ?? false,
		isActive: item.isActive ?? true,
		requiresAcknowledgement: item.requiresAcknowledgement ?? false,
		createdAt: item.createdAt ? String(item.createdAt) : "",
		scopedBranchIds: item.scopedBranchIds ?? [],
	}));

	// Counts for audience rail
	const audienceCounts = useMemo(() => {
		const counts: Record<string, number> = { all: allRows.length };
		for (const row of allRows) {
			counts[row.targetAudience] = (counts[row.targetAudience] ?? 0) + 1;
			if ((row.scopedBranchIds?.length ?? 0) > 0) {
				counts["branch"] = (counts["branch"] ?? 0) + 1;
			}
		}
		return counts;
	}, [allRows]);

	const filteredRows = useMemo(() => {
		let rows = allRows;

		// Audience filter
		if (audienceFilter === "branch") {
			rows = rows.filter((r) => (r.scopedBranchIds?.length ?? 0) > 0);
		} else if (audienceFilter !== "all") {
			rows = rows.filter((r) => r.targetAudience === audienceFilter);
		}

		// Search
		if (search.trim()) {
			const q = search.toLowerCase();
			rows = rows.filter(
				(r) =>
					r.title.toLowerCase().includes(q) ||
					r.message.toLowerCase().includes(q),
			);
		}

		// Sort
		rows = [...rows].sort((a, b) => {
			// Pinned always first
			if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
			const ta = new Date(a.createdAt).getTime();
			const tb = new Date(b.createdAt).getTime();
			return sortNewest ? tb - ta : ta - tb;
		});

		return rows;
	}, [allRows, audienceFilter, search, sortNewest]);

	const isMutating =
		createMutation.isPending ||
		updateMutation.isPending ||
		pinMutation.isPending ||
		deactivateMutation.isPending ||
		deleteMutation.isPending;

	// ─── Form helpers ─────────────────────────────────────────────────────────

	function openCreate() {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setSheetOpen(true);
	}

	function openEdit(row: AnnouncementRow) {
		setEditingId(row.id);
		const toDatetimeLocal = (iso: string | null) => {
			if (!iso) return "";
			return iso.slice(0, 16);
		};
		setForm({
			title: row.title,
			message: row.message,
			priority: row.priority,
			targetAudience: row.targetAudience,
			startDate: toDatetimeLocal(row.startDate),
			endDate: toDatetimeLocal(row.endDate),
			isPinned: row.isPinned,
			requiresAcknowledgement: row.requiresAcknowledgement,
			scopedBranchIds: row.scopedBranchIds ?? [],
		});
		setSheetOpen(true);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.title.trim() || !form.message.trim()) {
			toast.error("Title and message are required.");
			return;
		}
		if (
			form.startDate &&
			form.endDate &&
			new Date(form.endDate) <= new Date(form.startDate)
		) {
			toast.error("End Date must be after Start Date.");
			return;
		}
		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	function handleFormClose() {
		setSheetOpen(false);
		setEditingId(null);
		setForm(EMPTY_FORM);
	}

	// ─── Early returns ────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-[#737373] text-sm">
				Select an organization to manage announcements.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" onRetry={() => refetch()}>
					Failed to load announcements. Please try again.
				</StatusCallout>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<Skeleton
			name="announcements-view"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<span className="text-[#737373]">Communications</span>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold">Announcements</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						{/* Tenant scope switcher (country → state → branch) */}
						<ScopeSwitcher className="w-56" />
						<button
							type="button"
							onClick={openCreate}
							disabled={isMutating}
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626] disabled:opacity-50"
						>
							<Plus className="h-4 w-4" />
							New
						</button>
					</div>
				</header>
				<div className="px-6 py-6">
					{/* Two-column layout */}
					<div className="grid grid-cols-[220px_1fr] gap-5">
						{/* ── Left rail: audience + status filters ── */}
						<AnnouncementsFilterRail
							audienceFilter={audienceFilter}
							statusFilter={statusFilter}
							audienceCounts={audienceCounts}
							onAudienceChange={setAudienceFilter}
							onStatusChange={setStatusFilter}
						/>

						{/* ── Right: inbox list ── */}
						<div>
							{/* Search + sort bar */}
							<div className="mb-3 flex gap-2">
								<div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
									<Search className="h-4 w-4 text-[#737373] flex-shrink-0" />
									<input
										className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
										placeholder="Search announcements…"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
								<button
									type="button"
									onClick={() => setSortNewest((v) => !v)}
									className="inline-flex items-center gap-2 bg-white border border-[#e5e5e5] px-3.5 py-2 rounded-[10px] text-[13px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition"
								>
									Sort: {sortNewest ? "Newest" : "Oldest"}
									<ChevronDown className="h-3 w-3" />
								</button>
							</div>

							{/* Inbox list */}
							{filteredRows.length === 0 ? (
								<AnnouncementsEmptyState hasSearch={!!search.trim()} />
							) : (
								<div className="divide-y divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
									{filteredRows.map((row) => (
										<AnnouncementListItem
											key={row.id}
											row={row}
											isExpanded={expandedId === row.id}
											isMutating={isMutating}
											nodeNameMap={nodeNameMap}
											onToggleExpand={(id) =>
												setExpandedId(expandedId === id ? null : id)
											}
											onPin={(id, isPinned) =>
												pinMutation.mutate({ id, isPinned })
											}
											onEdit={openEdit}
											onDeactivate={setDeactivateTarget}
											onDelete={setDeleteTarget}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					{/* ── Confirmation: Delete ── */}
					<AnnouncementDeleteDialog
						open={!!deleteTarget}
						isPending={deleteMutation.isPending}
						onCancel={() => setDeleteTarget(null)}
						onConfirm={() => {
							if (deleteTarget) {
								deleteMutation.mutate(deleteTarget);
								setDeleteTarget(null);
							}
						}}
					/>

					{/* ── Confirmation: Deactivate ── */}
					<AnnouncementDeactivateDialog
						open={!!deactivateTarget}
						isPending={deactivateMutation.isPending}
						onCancel={() => setDeactivateTarget(null)}
						onConfirm={() => {
							if (deactivateTarget) {
								deactivateMutation.mutate(deactivateTarget);
								setDeactivateTarget(null);
							}
						}}
					/>

					{/* ── Create / Edit dialog ── */}
					<AnnouncementFormDialog
						open={sheetOpen}
						editingId={editingId}
						form={form}
						hierarchyNodes={hierarchyNodes}
						isSaving={createMutation.isPending || updateMutation.isPending}
						onOpenChange={(open) => {
							setSheetOpen(open);
							if (!open) {
								setEditingId(null);
								setForm(EMPTY_FORM);
							}
						}}
						onFormChange={setForm}
						onSubmit={handleSubmit}
						onCancel={handleFormClose}
					/>
				</div>
			</div>
		</Skeleton>
	);
}
