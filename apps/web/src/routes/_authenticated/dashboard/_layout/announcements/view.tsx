import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
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
import { Separator } from "@/components/ui/separator";
import { Megaphone, Plus, Pin, Edit, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/announcements/view",
)({
	beforeLoad: async () => {
		await requirePermission("announcement_management:read");
	},
	component: AnnouncementsViewPage,
});

type Priority = "low" | "normal" | "high" | "urgent";
type TargetAudience = "all" | "staff" | "clients";
type StatusFilter = "active" | "inactive" | "all";

type AnnouncementRow = {
	id: string;
	title: string;
	message: string;
	priority: Priority;
	targetAudience: TargetAudience;
	branchId: string | null;
	startDate: string | null;
	endDate: string | null;
	isPinned: boolean;
	isActive: boolean;
	createdAt: string;
	scopedBranchIds?: string[];
};

type FormState = {
	title: string;
	message: string;
	priority: Priority;
	targetAudience: TargetAudience;
	startDate: string;
	endDate: string;
	isPinned: boolean;
	scopedBranchIds: string[];
};

const EMPTY_FORM: FormState = {
	title: "",
	message: "",
	priority: "normal",
	targetAudience: "all",
	startDate: "",
	endDate: "",
	isPinned: false,
	scopedBranchIds: [],
};

function priorityBadge(priority: Priority) {
	switch (priority) {
		case "low":
			return (
				<Badge variant="outline" className="text-brand-secondary-1">
					Low
				</Badge>
			);
		case "normal":
			return <Badge variant="secondary">Normal</Badge>;
		case "high":
			// Priority level indicator — documented exception per §2.5 (semantic priority scale, not lifecycle status)
			return (
				<Badge variant="secondary" className="text-orange-600 border-orange-200 bg-orange-50">
					High
				</Badge>
			);
		case "urgent":
			return <Badge variant="destructive">Urgent</Badge>;
	}
}

function capitalize(str: string): string {
	if (!str) return "";
	return str.charAt(0).toUpperCase() + str.slice(1);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
function AnnouncementsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const announcementsKey = ["announcements", organizationId];

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [audienceFilter, setAudienceFilter] = useState<string>("all");

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Confirmation dialog state
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);

	// Derived isActive filter for query
	const isActiveFilter =
		statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;

	const { data: apiData = [], isLoading, isError, refetch } = useQuery({
		queryKey: ["announcements", organizationId, isActiveFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.announcements.list({
				organizationId,
				isActive: isActiveFilter,
			});
		},
		enabled: !!organizationId,
	});

	type HierarchyNode = { id: string; name: string; depth: number };

	const { data: hierarchyNodes } = useQuery<HierarchyNode[]>({
		queryKey: ["hierarchy", "listNodes", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			const result = await client.hierarchy.listNodes({ organizationId });
			return result.nodes as HierarchyNode[];
		},
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});

	const nodeNameMap: Record<string, string> = {};
	for (const node of hierarchyNodes ?? []) {
		nodeNameMap[node.id] = node.name;
	}

	const createMutation = useApiMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.announcements.create({
				organizationId,
				title: values.title,
				message: values.message,
				priority: values.priority,
				targetAudience: values.targetAudience,
				startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
				endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
				isPinned: values.isPinned,
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
				startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
				endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
				isPinned: values.isPinned,
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

	function openCreate() {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setSheetOpen(true);
	}

	function openEdit(row: AnnouncementRow) {
		setEditingId(row.id);
		// Convert ISO dates to datetime-local format (strip seconds/Z for input compatibility)
		const toDatetimeLocal = (iso: string | null) => {
			if (!iso) return "";
			// datetime-local expects "YYYY-MM-DDTHH:MM"
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
		if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) {
			toast.error("End Date must be after Start Date.");
			return;
		}
		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	// Filter by audience on the client side (API doesn't support targetAudience filter)
	const filteredData: AnnouncementRow[] = apiData.flatMap((item) => {
		if (audienceFilter !== "all" && item.targetAudience !== audienceFilter) {
			return [];
		}
		return [
			{
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
				createdAt: item.createdAt ? String(item.createdAt) : "",
				scopedBranchIds: item.scopedBranchIds ?? [],
			},
		];
	});

	const isMutating =
		createMutation.isPending ||
		updateMutation.isPending ||
		deactivateMutation.isPending ||
		deleteMutation.isPending;

	const columns: ColumnDef<AnnouncementRow>[] = [
		{
			accessorKey: "title",
			header: "Title",
			cell: ({ row }) => (
				<span className="font-semibold">{row.original.title}</span>
			),
		},
		{
			accessorKey: "priority",
			header: "Priority",
			cell: ({ row }) => priorityBadge(row.original.priority),
		},
		{
			accessorKey: "targetAudience",
			header: "Target",
			cell: ({ row }) => <span>{capitalize(row.original.targetAudience)}</span>,
		},
		{
			id: "scope",
			header: "Scope",
			cell: ({ row }) => {
				const ids = row.original.scopedBranchIds ?? [];
				if (ids.length === 0) {
					return <Badge variant="outline" className="text-muted-foreground">Org-wide</Badge>;
				}
				const names = ids.map((id) => nodeNameMap[id] ?? id);
				if (names.length <= 2) {
					return <span className="text-sm">{names.join(", ")}</span>;
				}
				return (
					<span className="text-sm" title={names.join(", ")}>
						{names.slice(0, 2).join(", ")} (+{names.length - 2})
					</span>
				);
			},
		},
		{
			accessorKey: "startDate",
			header: "Valid From",
			cell: ({ row }) =>
				row.original.startDate
					? new Date(row.original.startDate).toLocaleDateString()
					: "—",
		},
		{
			accessorKey: "endDate",
			header: "Valid Until",
			cell: ({ row }) =>
				row.original.endDate
					? new Date(row.original.endDate).toLocaleDateString()
					: "No expiry",
		},
		{
			accessorKey: "isPinned",
			header: "Pinned",
			cell: ({ row }) =>
				row.original.isPinned ? (
					<Pin className="size-4 text-amber-500" />
				) : null,
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) =>
				row.original.isActive ? (
					<StatusBadge status="active" />
				) : (
					<StatusBadge status="inactive" />
				),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => openEdit(row.original)}
						disabled={isMutating}
					>
						<Edit className="size-4 mr-1" />
						Edit
					</Button>
					{row.original.isActive && (
						<Button
							variant="ghost"
							size="sm"
							className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
							onClick={() => setDeactivateTarget(row.original.id)}
							disabled={isMutating}
						>
							Deactivate
						</Button>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive hover:bg-destructive/10"
						onClick={() => setDeleteTarget(row.original.id)}
						disabled={isMutating}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			),
		},
	];

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage announcements.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
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

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Megaphone className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Announcements</h1>
						<p className="text-brand-secondary-1 text-sm">
							Manage organization-wide and branch-specific announcements.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="size-4 mr-2" />
					Create Announcement
				</Button>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3">
				{/* Status tabs */}
				<div className="flex items-center rounded-lg border bg-muted/40 p-1 gap-1">
					{(["active", "inactive", "all"] as const).map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setStatusFilter(s)}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
								statusFilter === s
									? "bg-background shadow-sm text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{capitalize(s)}
						</button>
					))}
				</div>

				{/* Target audience filter */}
				<Select value={audienceFilter} onValueChange={setAudienceFilter}>
					<SelectTrigger className="w-44">
						<SelectValue placeholder="Audience" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Audiences</SelectItem>
						<SelectItem value="staff">Staff only</SelectItem>
						<SelectItem value="clients">Clients only</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<Separator />

			{/* Table or empty state */}
			{filteredData.length === 0 ? (
				<EmptyState
					icon={Megaphone}
					title="No announcements"
					description="No announcements match the current filters."
				/>
			) : (
				<DataTable<AnnouncementRow, unknown>
					columns={columns}
					data={filteredData}
				/>
			)}

			{/* Delete Confirmation Dialog */}
			<Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Delete</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this announcement? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deleteTarget) {
									deleteMutation.mutate(deleteTarget);
									setDeleteTarget(null);
								}
							}}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Deactivate Confirmation Dialog */}
			<Dialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Deactivate</DialogTitle>
						<DialogDescription>
							Are you sure you want to deactivate this announcement?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeactivateTarget(null)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (deactivateTarget) {
									deactivateMutation.mutate(deactivateTarget);
									setDeactivateTarget(null);
								}
							}}
							disabled={deactivateMutation.isPending}
						>
							{deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create / Edit Dialog */}
			<Dialog open={sheetOpen} onOpenChange={(open) => {
				setSheetOpen(open);
				if (!open) {
					setEditingId(null);
					setForm(EMPTY_FORM);
				}
			}}>
				<DialogContent className="sm:max-w-lg overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingId ? "Edit Announcement" : "Create Announcement"}
						</DialogTitle>
						<DialogDescription>
							{editingId
								? "Update the details of this announcement."
								: "Fill in the details to publish a new announcement."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-2">
						{/* Title */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-title">
								Title <span className="text-destructive">*</span>
							</Label>
							<Input
								id="ann-title"
								placeholder="Announcement title"
								value={form.title}
								onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
								required
							/>
						</div>

						{/* Message */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-message">
								Message <span className="text-destructive">*</span>
							</Label>
							<Textarea
								id="ann-message"
								placeholder="Announcement body text"
								rows={4}
								value={form.message}
								onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
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
									setForm((f) => ({ ...f, targetAudience: v as TargetAudience }))
								}
							>
								<SelectTrigger id="ann-audience">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="staff">Staff</SelectItem>
									<SelectItem value="clients">Clients</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Branch Scope */}
						<div className="flex flex-col gap-1.5">
							<Label>Branch Scope</Label>
							<p className="text-xs text-muted-foreground">
								Leave empty to show org-wide to all branches.
							</p>
							<div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
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
														: f.scopedBranchIds.filter((id) => id !== node.id),
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
									<p className="text-xs text-muted-foreground py-2 text-center">
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
										setForm((f) => ({ ...f, startDate: e.target.value }))
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
										setForm((f) => ({ ...f, endDate: e.target.value }))
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
							<Label htmlFor="ann-pinned" className="cursor-pointer font-normal">
								Pin to top
							</Label>
						</div>

						<DialogFooter className="px-0 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setSheetOpen(false);
									setEditingId(null);
									setForm(EMPTY_FORM);
								}}
								disabled={createMutation.isPending || updateMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}
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
	);
}
