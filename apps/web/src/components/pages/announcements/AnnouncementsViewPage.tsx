import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import {
	Plus,
	Search,
	Pin,
	PinOff,
	Pencil,
	Archive,
	ChevronDown,
	ChevronUp,
	Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AudienceChip } from "./AudienceChip";
import { StatusPill } from "./StatusPill";
import {
	type AnnouncementRow,
	type FormState,
	type Priority,
	type StatusFilter,
	type TargetAudience,
	AUDIENCE_FILTERS,
	EMPTY_FORM,
	STATUS_FILTERS,
	formatDate,
	formatShortDate,
	priorityDot,
	priorityLabel,
} from "./types";

// ─── Main component ───────────────────────────────────────────────────────────

export function AnnouncementsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const announcementsKey = ["announcements", organizationId];

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
			input: { organizationId: organizationId!, isActive: isActiveFilter },
		}),
		enabled: !!organizationId,
	});

	type HierarchyNode = { id: string; name: string; depth: number };

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
						<div className="space-y-1 rounded-2xl border border-[#e5e5e5] bg-white p-3 self-start">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] px-2 mb-2">
								Filter by audience
							</p>

							{AUDIENCE_FILTERS.map(({ key, label, dot }) => {
								const count = audienceCounts[key] ?? 0;
								const isActive = audienceFilter === key;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setAudienceFilter(key)}
										className={cn(
											"w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
											isActive
												? "bg-[#0a0a0a] text-white font-semibold"
												: "text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
										)}
									>
										<span className="flex items-center gap-2">
											{dot && (
												<span
													className={cn(
														"w-2 h-2 rounded-full flex-shrink-0",
														dot,
													)}
												/>
											)}
											{label}
										</span>
										<span
											className={cn(
												"font-mono text-xs tabular-nums",
												isActive ? "opacity-70" : "",
											)}
										>
											{count}
										</span>
									</button>
								);
							})}

							<div className="border-t border-[#e5e5e5] my-2" />

							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] px-2 mb-2">
								Filter by status
							</p>

							{STATUS_FILTERS.map(({ key, label }) => {
								const isActive = statusFilter === key;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setStatusFilter(key)}
										className={cn(
											"w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition",
											isActive
												? "bg-[#0a0a0a] text-white font-semibold"
												: "text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
										)}
									>
										<span>{label}</span>
									</button>
								);
							})}
						</div>

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
								<div className="rounded-2xl border border-[#e5e5e5] bg-white flex flex-col items-center justify-center py-16 text-[#737373]">
									<Megaphone className="h-8 w-8 mb-3 opacity-30" />
									<p className="text-sm font-medium">No announcements</p>
									<p className="text-xs mt-1">
										{search
											? "No results for your search."
											: "No announcements match the current filters."}
									</p>
								</div>
							) : (
								<div className="divide-y divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
									{filteredRows.map((row) => {
										const isExpanded = expandedId === row.id;
										const scopeNames = (row.scopedBranchIds ?? []).map(
											(id) => nodeNameMap[id] ?? id,
										);

										return (
											<div
												key={row.id}
												className={cn(
													"transition",
													isExpanded
														? "bg-[#f3f3f3] border-l-2 border-l-[#0a0a0a]"
														: "border-l-2 border-l-transparent",
												)}
											>
												{/* ─ Row header (always visible) ─ */}
												<div
													className={cn(
														"flex items-start gap-4 px-5 cursor-pointer",
														isExpanded
															? "pt-4 pb-2"
															: "py-3.5 hover:bg-[#fafafa]",
													)}
													onClick={() =>
														setExpandedId(isExpanded ? null : row.id)
													}
												>
													{/* Priority dot */}
													<span
														className={cn(
															"mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
															priorityDot(row.priority),
														)}
														title={`${priorityLabel(row.priority)} priority`}
													/>

													{/* Content */}
													<div className="flex-1 min-w-0">
														<div className="flex items-baseline gap-2 flex-wrap">
															<span className="font-semibold text-sm text-[#0a0a0a]">
																{row.title}
															</span>
															<AudienceChip audience={row.targetAudience} />
															{scopeNames.length > 0 && (
																<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700">
																	{scopeNames.length === 1
																		? scopeNames[0]
																		: `${scopeNames[0]} +${scopeNames.length - 1}`}
																</span>
															)}
															{row.requiresAcknowledgement && (
																<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
																	Requires ack
																</span>
															)}
															<StatusPill
																isActive={row.isActive}
																isPinned={row.isPinned}
															/>
														</div>
														{!isExpanded && (
															<p className="mt-0.5 text-xs text-[#737373] truncate">
																{row.message}
															</p>
														)}
													</div>

													{/* Right meta */}
													<div className="text-right flex-shrink-0 space-y-0.5 flex flex-col items-end">
														{/* STUB: views/ack counts not available from API */}
														<div className="text-[10px] text-[#737373] font-mono tabular-nums">
															{formatShortDate(row.createdAt)}
														</div>
														{isExpanded ? (
															<ChevronUp className="h-3.5 w-3.5 text-[#737373] mt-0.5" />
														) : (
															<ChevronDown className="h-3.5 w-3.5 text-[#737373] mt-0.5" />
														)}
													</div>
												</div>

												{/* ─ Expanded body ─ */}
												{isExpanded && (
													<div className="px-5 pb-4">
														{/* Message body */}
														<p className="text-sm text-[#404040] leading-relaxed mb-4 pl-6">
															{row.message}
														</p>

														{/* Meta row */}
														<div className="pl-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#737373] mb-4">
															{/* STUB: views count — not returned by API */}
															<span className="flex items-center gap-1">
																<span className="font-mono tabular-nums font-semibold text-[#737373]">
																	—
																</span>{" "}
																views
															</span>

															{/* STUB: ack count — not returned by API */}
															<span className="flex items-center gap-1">
																<span className="font-mono tabular-nums font-semibold text-[#737373]">
																	—
																</span>{" "}
																acknowledged
															</span>

															{row.startDate && (
																<span>
																	From{" "}
																	<span className="font-medium text-[#0a0a0a]">
																		{formatDate(row.startDate)}
																	</span>
																</span>
															)}
															{row.endDate ? (
																<span>
																	Expires{" "}
																	<span className="font-medium text-[#0a0a0a]">
																		{formatDate(row.endDate)}
																	</span>
																</span>
															) : (
																<span>No expiry</span>
															)}
															<span>
																Priority:{" "}
																<span className="font-medium text-[#0a0a0a]">
																	{priorityLabel(row.priority)}
																</span>
															</span>
														</div>

														{/* Action buttons */}
														<div className="pl-6 flex flex-wrap gap-1.5">
															{/* Pin / Unpin */}
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	pinMutation.mutate({
																		id: row.id,
																		isPinned: !row.isPinned,
																	});
																}}
																disabled={isMutating}
																className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition disabled:opacity-50"
															>
																{row.isPinned ? (
																	<>
																		<PinOff className="h-3.5 w-3.5" /> Unpin
																	</>
																) : (
																	<>
																		<Pin className="h-3.5 w-3.5" /> Pin
																	</>
																)}
															</button>

															{/* Edit */}
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	openEdit(row);
																}}
																disabled={isMutating}
																className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition disabled:opacity-50"
															>
																<Pencil className="h-3.5 w-3.5" /> Edit
															</button>

															{/* Deactivate (archive) — only when active */}
															{row.isActive && (
																<button
																	type="button"
																	onClick={(e) => {
																		e.stopPropagation();
																		setDeactivateTarget(row.id);
																	}}
																	disabled={isMutating}
																	className="inline-flex items-center gap-1.5 bg-white border border-rose-200 px-3 py-1 rounded-[10px] text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
																>
																	<Archive className="h-3.5 w-3.5" /> Archive
																</button>
															)}

															{/* Delete */}
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	setDeleteTarget(row.id);
																}}
																disabled={isMutating}
																className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a] transition disabled:opacity-50"
															>
																Delete
															</button>
														</div>
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>

					{/* ── Confirmation: Delete ── */}
					<Dialog
						open={!!deleteTarget}
						onOpenChange={(open) => !open && setDeleteTarget(null)}
					>
						<DialogContent
							className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									INTERNAL COMMUNICATIONS
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Confirm Delete
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									Are you sure you want to delete this announcement? This action
									cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button variant="outline" onClick={() => setDeleteTarget(null)}>
									Cancel
								</Button>
								<Button
									className="bg-red-600 hover:bg-red-700 text-white"
									onClick={() => {
										if (deleteTarget) {
											deleteMutation.mutate(deleteTarget);
											setDeleteTarget(null);
										}
									}}
									disabled={deleteMutation.isPending}
								>
									{deleteMutation.isPending ? "Deleting…" : "Delete"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					{/* ── Confirmation: Deactivate ── */}
					<Dialog
						open={!!deactivateTarget}
						onOpenChange={(open) => !open && setDeactivateTarget(null)}
					>
						<DialogContent
							className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									INTERNAL COMMUNICATIONS
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Archive Announcement
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									This will deactivate the announcement. It will no longer be
									visible to recipients.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									variant="outline"
									onClick={() => setDeactivateTarget(null)}
								>
									Cancel
								</Button>
								<Button
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
									onClick={() => {
										if (deactivateTarget) {
											deactivateMutation.mutate(deactivateTarget);
											setDeactivateTarget(null);
										}
									}}
									disabled={deactivateMutation.isPending}
								>
									{deactivateMutation.isPending ? "Archiving…" : "Archive"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					{/* ── Create / Edit dialog ── */}
					<Dialog
						open={sheetOpen}
						onOpenChange={(open) => {
							setSheetOpen(open);
							if (!open) {
								setEditingId(null);
								setForm(EMPTY_FORM);
							}
						}}
					>
						<DialogContent
							className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									INTERNAL COMMUNICATIONS
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									{editingId ? "Edit Announcement" : "New Announcement"}
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									{editingId
										? "Update the details of this announcement."
										: "Fill in the details to publish a new announcement."}
								</DialogDescription>
							</DialogHeader>

							<form onSubmit={handleSubmit}>
								<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[65vh] flex flex-col gap-5">
									{/* Title */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="ann-title">
											Title <span className="text-rose-600">*</span>
										</Label>
										<Input
											id="ann-title"
											placeholder="Announcement title"
											value={form.title}
											onChange={(e) =>
												setForm((f) => ({ ...f, title: e.target.value }))
											}
											required
										/>
									</div>

									{/* Message */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="ann-message">
											Message <span className="text-rose-600">*</span>
										</Label>
										<Textarea
											id="ann-message"
											placeholder="Announcement body text"
											rows={4}
											value={form.message}
											onChange={(e) =>
												setForm((f) => ({ ...f, message: e.target.value }))
											}
											required
										/>
									</div>

									{/* Priority */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="ann-priority">Priority</Label>
										<Select
											value={form.priority}
											onValueChange={(v) =>
												setForm((f) => ({ ...f, priority: v as Priority }))
											}
										>
											<SelectTrigger id="ann-priority">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="low">Low</SelectItem>
												<SelectItem value="normal">Normal</SelectItem>
												<SelectItem value="high">High</SelectItem>
												<SelectItem value="urgent">Urgent</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Target Audience */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="ann-audience">Target Audience</Label>
										<Select
											value={form.targetAudience}
											onValueChange={(v) =>
												setForm((f) => ({
													...f,
													targetAudience: v as TargetAudience,
												}))
											}
										>
											<SelectTrigger id="ann-audience">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="staff">Staff</SelectItem>
												<SelectItem value="clients">Members</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Branch Scope */}
									<div className="flex flex-col gap-1.5">
										<Label>Branch Scope</Label>
										<p className="text-xs text-[#737373]">
											Leave empty to show org-wide to all branches.
										</p>
										<div className="border border-[#e5e5e5] rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
											{(hierarchyNodes ?? []).map((node) => (
												<div key={node.id} className="flex items-center gap-2">
													<Checkbox
														id={`scope-${node.id}`}
														checked={form.scopedBranchIds.includes(node.id)}
														onCheckedChange={(checked) =>
															setForm((f) => ({
																...f,
																scopedBranchIds: checked
																	? [...f.scopedBranchIds, node.id]
																	: f.scopedBranchIds.filter(
																			(id) => id !== node.id,
																		),
															}))
														}
													/>
													<Label
														htmlFor={`scope-${node.id}`}
														className="cursor-pointer font-normal text-sm"
														style={{ paddingLeft: `${node.depth * 12}px` }}
													>
														{node.name}
													</Label>
												</div>
											))}
											{(hierarchyNodes ?? []).length === 0 && (
												<p className="text-xs text-[#737373] py-2 text-center">
													No branches available.
												</p>
											)}
										</div>
									</div>

									{/* Date range */}
									<div className="grid grid-cols-2 gap-3">
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ann-start">Start Date</Label>
											<Input
												id="ann-start"
												type="datetime-local"
												value={form.startDate}
												onChange={(e) =>
													setForm((f) => ({
														...f,
														startDate: e.target.value,
													}))
												}
											/>
										</div>
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ann-end">End Date</Label>
											<Input
												id="ann-end"
												type="datetime-local"
												value={form.endDate}
												onChange={(e) =>
													setForm((f) => ({
														...f,
														endDate: e.target.value,
													}))
												}
											/>
										</div>
									</div>

									{/* Pin to top */}
									<div className="flex items-center gap-2">
										<Checkbox
											id="ann-pinned"
											checked={form.isPinned}
											onCheckedChange={(checked) =>
												setForm((f) => ({ ...f, isPinned: checked === true }))
											}
										/>
										<Label
											htmlFor="ann-pinned"
											className="cursor-pointer font-normal"
										>
											Pin to top
										</Label>
									</div>

									{/* Requires acknowledgement */}
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2">
											<Checkbox
												id="ann-requires-ack"
												checked={form.requiresAcknowledgement}
												onCheckedChange={(checked) =>
													setForm((f) => ({
														...f,
														requiresAcknowledgement: checked === true,
													}))
												}
											/>
											<Label
												htmlFor="ann-requires-ack"
												className="cursor-pointer font-normal"
											>
												Requires acknowledgement
											</Label>
										</div>
										<p className="text-xs text-[#737373] pl-6">
											Members will see an Acknowledge button. Tracking arrives
											in a future release.
										</p>
									</div>
								</div>

								<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											setSheetOpen(false);
											setEditingId(null);
											setForm(EMPTY_FORM);
										}}
										disabled={
											createMutation.isPending || updateMutation.isPending
										}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
										disabled={
											createMutation.isPending || updateMutation.isPending
										}
									>
										{createMutation.isPending || updateMutation.isPending
											? "Saving…"
											: editingId
												? "Save Changes"
												: "Create"}
									</Button>
								</DialogFooter>
							</form>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		</Skeleton>
	);
}
