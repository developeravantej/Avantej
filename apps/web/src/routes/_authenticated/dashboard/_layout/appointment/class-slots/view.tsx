import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, Clock, Grid3x3, Plus, Users } from "lucide-react";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";
import { useApiMutation } from "@/hooks/useApiMutation";

import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/sales/view/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
import { BranchSelector } from "@/components/branch/branch-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { StatusCallout } from "@/components/ui/status-callout";
import { Textarea } from "@/components/ui/textarea";
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
	DialogClose,
} from "@/components/ui/dialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/class-slots/view",
)({
	beforeLoad: async () => {
		await requirePermission("class_slot_management:read");
	},
	component: ClassSlotsPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassSlotRow {
	id: string;
	serviceId: string;
	branchId: string;
	date: Date;
	startTime: string;
	endTime: string;
	capacity: number;
	instructorId: string | null;
	location: string | null;
	isCancelled: boolean;
	spotsBooked: number;
	spotsAvailable: number;
	createdAt: Date;
}

interface CreateFormState {
	serviceId: string;
	branchId: string;
	date: string;
	startTime: string;
	endTime: string;
	capacity: string;
	instructorId: string;
	location: string;
}

interface EditFormState {
	startTime: string;
	endTime: string;
	capacity: string;
	instructorId: string;
	location: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
	serviceId: "",
	branchId: "",
	date: "",
	startTime: "",
	endTime: "",
	capacity: "1",
	instructorId: "",
	location: "",
};

const EMPTY_EDIT_FORM: EditFormState = {
	startTime: "",
	endTime: "",
	capacity: "1",
	instructorId: "",
	location: "",
};

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
function ClassSlotsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// --- Filter state ---
	const [filterServiceId, setFilterServiceId] = useState<string>("");
	const [filterFrom, setFilterFrom] = useState<string>("");
	const [filterTo, setFilterTo] = useState<string>("");
	const [filterAvailableOnly, setFilterAvailableOnly] =
		useState<boolean>(false);

	// --- Sheet (create / edit) state ---
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const [editSheetOpen, setEditSheetOpen] = useState(false);
	const [editingSlot, setEditingSlot] = useState<ClassSlotRow | null>(null);

	// --- Cancel dialog state ---
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancellingSlot, setCancellingSlot] = useState<ClassSlotRow | null>(
		null,
	);
	const [cancellationReason, setCancellationReason] = useState("");

	// --- Signups sheet state ---
	const [signupsSheetOpen, setSignupsSheetOpen] = useState(false);
	const [viewingSignupsSlot, setViewingSignupsSlot] =
		useState<ClassSlotRow | null>(null);

	// --- Form state ---
	const [createForm, setCreateForm] =
		useState<CreateFormState>(EMPTY_CREATE_FORM);
	const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);

	// ---------------------------------------------------------------------------
	// Queries
	// ---------------------------------------------------------------------------

	const {
		data: classSlots = [],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["classSlots", organizationId, filterServiceId, filterFrom, filterTo, filterAvailableOnly],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.classSlots.list({
				organizationId,
				serviceId: filterServiceId || undefined,
				from: filterFrom ? `${filterFrom}T00:00:00.000Z` : undefined,
				to: filterTo ? `${filterTo}T23:59:59.999Z` : undefined,
				isAvailable: filterAvailableOnly || undefined,
			});
		},
		enabled: !!organizationId,
	});

	const { data: services = [] } = useQuery({
		queryKey: ["services", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.services.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: membersData = [] } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.members.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const { data: signups = [], isLoading: signupsLoading } = useQuery({
		queryKey: ["classSlotSignups", viewingSignupsSlot?.id],
		queryFn: async () => {
			if (!organizationId || !viewingSignupsSlot) return [];
			return client.classSlots.getSignups({
				organizationId,
				id: viewingSignupsSlot.id,
			});
		},
		enabled: !!organizationId && !!viewingSignupsSlot,
	});

	// ---------------------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------------------

	const classSlotsKey = ["classSlots", organizationId];

	const createMutation = useApiMutation({
		mutationFn: (form: CreateFormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.classSlots.create({
				organizationId,
				serviceId: form.serviceId,
				branchId: form.branchId,
				date: `${form.date}T00:00:00.000Z`,
				startTime: form.startTime,
				endTime: form.endTime,
				capacity: parseInt(form.capacity, 10),
				instructorId: form.instructorId || undefined,
				location: form.location || undefined,
			});
		},
		successMessage: "Class slot created successfully.",
		errorMessage: (err) => `Failed to create class slot: ${err.message}`,
		invalidate: [classSlotsKey],
		onSuccess: () => {
			setCreateSheetOpen(false);
			setCreateForm(EMPTY_CREATE_FORM);
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: ({
			id,
			form,
		}: { id: string; form: EditFormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.classSlots.update({
				organizationId,
				id,
				startTime: form.startTime || undefined,
				endTime: form.endTime || undefined,
				capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
				instructorId: form.instructorId || undefined,
				location: form.location || undefined,
			});
		},
		successMessage: "Class slot updated successfully.",
		errorMessage: (err) => `Failed to update class slot: ${err.message}`,
		invalidate: [classSlotsKey],
		onSuccess: () => {
			setEditSheetOpen(false);
			setEditingSlot(null);
			setEditForm(EMPTY_EDIT_FORM);
		},
	});

	const cancelMutation = useApiMutation({
		mutationFn: ({
			id,
			reason,
		}: { id: string; reason: string }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.classSlots.cancel({
				organizationId,
				id,
				cancellationReason: reason || undefined,
			});
		},
		successMessage: "Class slot cancelled.",
		errorMessage: (err) => `Failed to cancel class slot: ${err.message}`,
		invalidate: [classSlotsKey],
		onSuccess: () => {
			setCancelDialogOpen(false);
			setCancellingSlot(null);
			setCancellationReason("");
		},
	});

	// --- Enrollment ---
	const [enrollClientUserId, setEnrollClientUserId] = useState("");

	const { data: customerMembers = [] } = useQuery({
		queryKey: ["members", organizationId, "client"],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.members.list({ organizationId, role: "client", status: "active" });
		},
		enabled: !!organizationId && signupsSheetOpen,
	});

	const enrollMutation = useApiMutation({
		mutationFn: (clientUserId: string) => {
			if (!organizationId || !viewingSignupsSlot) throw new Error("Missing context");
			return client.classSlots.enrollClient({
				organizationId,
				classSlotId: viewingSignupsSlot.id,
				clientUserId,
			});
		},
		successMessage: "Customer enrolled.",
		errorMessage: (err) => `Failed to enroll: ${err.message}`,
		invalidate: [
			["classSlots", organizationId],
			["classSlotSignups", viewingSignupsSlot?.id],
		],
		onSuccess: () => setEnrollClientUserId(""),
	});

	const removeEnrollmentMutation = useApiMutation({
		mutationFn: (appointmentId: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.classSlots.cancelEnrollment({ organizationId, appointmentId });
		},
		successMessage: "Enrollment cancelled.",
		errorMessage: (err) => `Failed to cancel enrollment: ${err.message}`,
		invalidate: [
			["classSlots", organizationId],
			["classSlotSignups", viewingSignupsSlot?.id],
		],
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	const serviceNameById = (id: string) => {
		const svc = services.find((s: any) => s.id === id);
		return svc ? svc.name : id;
	};

	const memberNameById = (id: string | null) => {
		if (!id) return "—";
		const m = membersData.find((mem: { id: string; name: string }) => mem.id === id);
		return m ? m.name : id;
	};

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------

	const handleApplyFilters = () => {
		queryClient.invalidateQueries({ queryKey: ["classSlots", organizationId] });
	};

	const handleOpenEdit = (slot: ClassSlotRow) => {
		setEditingSlot(slot);
		setEditForm({
			startTime: slot.startTime,
			endTime: slot.endTime,
			capacity: String(slot.capacity),
			instructorId: slot.instructorId ?? "",
			location: slot.location ?? "",
		});
		setEditSheetOpen(true);
	};

	const handleOpenCancel = (slot: ClassSlotRow) => {
		setCancellingSlot(slot);
		setCancellationReason("");
		setCancelDialogOpen(true);
	};

	const handleViewSignups = (slot: ClassSlotRow) => {
		setViewingSignupsSlot(slot);
		setSignupsSheetOpen(true);
	};

	// ---------------------------------------------------------------------------
	// Table columns
	// ---------------------------------------------------------------------------

	const columns: ColumnDef<ClassSlotRow>[] = [
		{
			accessorKey: "date",
			header: "Date",
			cell: ({ row }) => {
				const raw = row.getValue<Date>("date");
				return new Date(raw).toLocaleDateString();
			},
		},
		{
			accessorKey: "serviceId",
			header: "Service",
			cell: ({ row }) => {
				const id = row.getValue<string>("serviceId");
				return (
					<span className="font-mono text-xs">{serviceNameById(id)}</span>
				);
			},
		},
		{
			id: "time",
			header: "Time",
			cell: ({ row }) => {
				const { startTime, endTime } = row.original;
				return `${startTime} – ${endTime}`;
			},
		},
		{
			accessorKey: "instructorId",
			header: "Instructor",
			cell: ({ row }) => {
				const id = row.getValue<string | null>("instructorId");
				return memberNameById(id);
			},
		},
		{
			accessorKey: "location",
			header: "Location",
			cell: ({ row }) => row.getValue<string | null>("location") ?? "—",
		},
		{
			accessorKey: "capacity",
			header: "Capacity",
		},
		{
			accessorKey: "spotsBooked",
			header: "Booked",
			cell: ({ row }) => {
				const slot = row.original;
				const count = slot.spotsBooked;
				if (count === 0) return <span className="text-muted-foreground">0</span>;
				return (
					<button
						type="button"
						onClick={() => handleViewSignups(slot)}
						className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
					>
						<Users className="size-3.5" />
						{count}
					</button>
				);
			},
		},
		{
			accessorKey: "spotsAvailable",
			header: "Available",
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => {
				const { isCancelled, spotsAvailable } = row.original;
				if (isCancelled) {
					return <StatusBadge status={"cancelled" as CanonicalStatus} />;
				}
				if (spotsAvailable === 0) {
					return <StatusBadge status={"inactive" as CanonicalStatus} label="Full" />;
				}
				return <StatusBadge status={"active" as CanonicalStatus} label="Available" />;
			},
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const slot = row.original;
				return (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleViewSignups(slot)}
						>
							<Users className="size-3.5 mr-1" />
							Signups
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={slot.isCancelled}
							onClick={() => handleOpenEdit(slot)}
						>
							Edit
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={slot.isCancelled}
							onClick={() => handleOpenCancel(slot)}
							className="text-destructive hover:text-destructive"
						>
							Cancel Class
						</Button>
					</div>
				);
			},
		},
	];

	// ---------------------------------------------------------------------------
	// Guard states
	// ---------------------------------------------------------------------------

	if (!organizationId) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
				<div className="flex shrink-0 items-center gap-3 px-6 pt-6 pb-4">
					<div className="p-2 rounded-lg bg-primary/10">
						<Grid3x3 className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Class Slots</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">Group classes scheduled at your branches</p>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center text-muted-foreground">
					<p className="text-sm">No organization selected.</p>
				</div>
			</div>
		);
	}

	// ── KPI computation (client-side, from loaded rows) ──────────────────────
	const today = new Date();
	const todayStr = today.toLocaleDateString("en-CA"); // YYYY-MM-DD
	const weekFromNow = new Date(today);
	weekFromNow.setDate(weekFromNow.getDate() + 7);

	const todayCount = classSlots.filter((s) => {
		const slotDate = new Date(s.date).toLocaleDateString("en-CA");
		return slotDate === todayStr && !s.isCancelled;
	}).length;

	const thisWeekCount = classSlots.filter((s) => {
		const d = new Date(s.date);
		return d >= today && d <= weekFromNow && !s.isCancelled;
	}).length;

	const availableCapacity = classSlots
		.filter((s) => !s.isCancelled)
		.reduce((sum, s) => sum + s.spotsAvailable, 0);

	const fullSlotsCount = classSlots.filter(
		(s) => !s.isCancelled && s.spotsAvailable === 0,
	).length;

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Grid3x3 className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Class Slots</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Group classes scheduled at your branches
						</p>
					</div>
				</div>
				<Button onClick={() => setCreateSheetOpen(true)}>
					<Plus className="mr-2 size-4" />
					Create Class Slot
				</Button>
			</div>

			{/* Filters band */}
			<div className="shrink-0 border-b border-border/40 px-6 py-3">
				{isError ? (
					<StatusCallout variant="error" title="Couldn't load class slots" onRetry={() => refetch()} />
				) : (
					<div className="flex flex-wrap items-end gap-4">
						{/* Service filter */}
						<div className="flex flex-col gap-1.5 min-w-[180px]">
							<Label htmlFor="filter-service">Service</Label>
							<Select
								value={filterServiceId}
								onValueChange={setFilterServiceId}
							>
								<SelectTrigger id="filter-service" className="w-full">
									<SelectValue placeholder="All services" />
								</SelectTrigger>
								<SelectContent>
									{services.map((svc: any) => (
										<SelectItem key={svc.id} value={svc.id}>
											{svc.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Date from */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="filter-from">From</Label>
							<Input
								id="filter-from"
								type="date"
								value={filterFrom}
								onChange={(e) => setFilterFrom(e.target.value)}
								className="w-40"
							/>
						</div>

						{/* Date to */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="filter-to">To</Label>
							<Input
								id="filter-to"
								type="date"
								value={filterTo}
								onChange={(e) => setFilterTo(e.target.value)}
								className="w-40"
							/>
						</div>

						{/* Available only checkbox */}
						<div className="flex items-center gap-2 pb-0.5">
							<Checkbox
								id="filter-available"
								checked={filterAvailableOnly}
								onCheckedChange={(checked) =>
									setFilterAvailableOnly(checked === true)
								}
							/>
							<Label htmlFor="filter-available" className="cursor-pointer">
								Show available only
							</Label>
						</div>

						{/* Apply + Clear */}
						<div className="flex items-center gap-2 pb-0.5">
							<Button variant="secondary" onClick={handleApplyFilters}>
								Apply
							</Button>
							<Button
								variant="ghost"
								onClick={() => {
									setFilterServiceId("");
									setFilterFrom("");
									setFilterTo("");
									setFilterAvailableOnly(false);
								}}
							>
								Clear
							</Button>
						</div>
					</div>
				)}
			</div>

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
				{/* KPI Strip */}
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div className="rounded-xl border bg-card p-3 shadow-sm">
						<div className="flex items-center gap-1.5">
							<Calendar className="size-3.5 text-muted-foreground" />
							<p className="text-muted-foreground text-xs uppercase tracking-wide">Today</p>
						</div>
						<p className="mt-1 font-bold text-2xl tabular-nums">{todayCount}</p>
						<p className="mt-0.5 text-xs text-muted-foreground">classes</p>
					</div>
					<div className="rounded-xl border bg-card p-3 shadow-sm">
						<div className="flex items-center gap-1.5">
							<Clock className="size-3.5 text-muted-foreground" />
							<p className="text-muted-foreground text-xs uppercase tracking-wide">This Week</p>
						</div>
						<p className="mt-1 font-bold text-2xl tabular-nums">{thisWeekCount}</p>
						<p className="mt-0.5 text-xs text-muted-foreground">classes</p>
					</div>
					<div className="rounded-xl border bg-card p-3 shadow-sm">
						<div className="flex items-center gap-1.5">
							<Users className="size-3.5 text-muted-foreground" />
							<p className="text-muted-foreground text-xs uppercase tracking-wide">Available Spots</p>
						</div>
						<p className="mt-1 font-bold text-2xl tabular-nums text-green-700">{availableCapacity}</p>
						<p className="mt-0.5 text-xs text-muted-foreground">across all slots</p>
					</div>
					<div className="rounded-xl border bg-card p-3 shadow-sm">
						<div className="flex items-center gap-1.5">
							<Grid3x3 className="size-3.5 text-muted-foreground" />
							<p className="text-muted-foreground text-xs uppercase tracking-wide">Full Slots</p>
						</div>
						<p className="mt-1 font-bold text-2xl tabular-nums text-destructive">{fullSlotsCount}</p>
						<p className="mt-0.5 text-xs text-muted-foreground">at capacity</p>
					</div>
				</div>

				{/* Table */}
				{isLoading ? (
					<PageLoader />
				) : classSlots.length === 0 ? (
					<EmptyState
						icon={Calendar}
						title="No class slots scheduled"
						description="Create your first class slot to start scheduling group sessions."
						action={{ label: "Create Class Slot", onClick: () => setCreateSheetOpen(true) }}
					/>
				) : (
					<DataTable<ClassSlotRow, unknown>
						columns={columns}
						data={classSlots}
					/>
				)}
			</div>

			{/* ----------------------------------------------------------------- */}
			{/* Create Dialog                                                      */}
			{/* ----------------------------------------------------------------- */}
			<Dialog open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Create Class Slot</DialogTitle>
						<DialogDescription>
							Schedule a new group class slot.
						</DialogDescription>
					</DialogHeader>

					<Separator className="my-4" />

					<div className="space-y-4 px-1">
						{/* Service */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-service">
								Service <span className="text-destructive">*</span>
							</Label>
							<Select
								value={createForm.serviceId}
								onValueChange={(v) =>
									setCreateForm((prev) => ({ ...prev, serviceId: v }))
								}
							>
								<SelectTrigger id="create-service" className="w-full">
									<SelectValue placeholder="Select a service" />
								</SelectTrigger>
								<SelectContent>
									{services.map((svc: any) => (
										<SelectItem key={svc.id} value={svc.id}>
											{svc.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Branch */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-branch">
								Branch <span className="text-destructive">*</span>
							</Label>
							<BranchSelector
								value={createForm.branchId}
								onChange={(v) =>
									setCreateForm((prev) => ({ ...prev, branchId: v }))
								}
								organizationId={organizationId ?? ""}
								placeholder="Select a branch"
							/>
						</div>

						{/* Date */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-date">
								Date <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-date"
								type="date"
								value={createForm.date}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										date: e.target.value,
									}))
								}
							/>
						</div>

						{/* Start Time */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-start">
								Start Time <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-start"
								type="time"
								value={createForm.startTime}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										startTime: e.target.value,
									}))
								}
							/>
						</div>

						{/* End Time */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-end">
								End Time <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-end"
								type="time"
								value={createForm.endTime}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										endTime: e.target.value,
									}))
								}
							/>
						</div>

						{/* Capacity */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-capacity">
								Capacity <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-capacity"
								type="number"
								min={1}
								value={createForm.capacity}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										capacity: e.target.value,
									}))
								}
							/>
						</div>

						{/* Instructor */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-instructor">Instructor (optional)</Label>
							<Select
								value={createForm.instructorId}
								onValueChange={(v) =>
									setCreateForm((prev) => ({ ...prev, instructorId: v }))
								}
							>
								<SelectTrigger id="create-instructor" className="w-full">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									{membersData.map((m: { id: string; name: string }) => (
										<SelectItem key={m.id} value={m.id}>
											{m.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Location */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-location">Location (optional)</Label>
							<Input
								id="create-location"
								type="text"
								placeholder="e.g. Studio A"
								value={createForm.location}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										location: e.target.value,
									}))
								}
							/>
						</div>
					</div>

					<DialogFooter className="mt-6">
						<Button
							variant="outline"
							onClick={() => setCreateSheetOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={() => createMutation.mutate(createForm)}
							disabled={
								createMutation.isPending ||
								!createForm.serviceId ||
								!createForm.branchId ||
								!createForm.date ||
								!createForm.startTime ||
								!createForm.endTime
							}
						>
							{createMutation.isPending ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ----------------------------------------------------------------- */}
			{/* Edit Dialog                                                        */}
			{/* ----------------------------------------------------------------- */}
			<Dialog open={editSheetOpen} onOpenChange={setEditSheetOpen}>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit Class Slot</DialogTitle>
						<DialogDescription>
							Update the details for this class slot.
						</DialogDescription>
					</DialogHeader>

					<Separator className="my-4" />

					<div className="space-y-4 px-1">
						{/* Start Time */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-start">Start Time</Label>
							<Input
								id="edit-start"
								type="time"
								value={editForm.startTime}
								onChange={(e) =>
									setEditForm((prev) => ({
										...prev,
										startTime: e.target.value,
									}))
								}
							/>
						</div>

						{/* End Time */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-end">End Time</Label>
							<Input
								id="edit-end"
								type="time"
								value={editForm.endTime}
								onChange={(e) =>
									setEditForm((prev) => ({
										...prev,
										endTime: e.target.value,
									}))
								}
							/>
						</div>

						{/* Capacity */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-capacity">Capacity</Label>
							<Input
								id="edit-capacity"
								type="number"
								min={1}
								value={editForm.capacity}
								onChange={(e) =>
									setEditForm((prev) => ({
										...prev,
										capacity: e.target.value,
									}))
								}
							/>
						</div>

						{/* Instructor */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-instructor">Instructor</Label>
							<Select
								value={editForm.instructorId}
								onValueChange={(v) =>
									setEditForm((prev) => ({ ...prev, instructorId: v }))
								}
							>
								<SelectTrigger id="edit-instructor" className="w-full">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									{membersData.map((m: { id: string; name: string }) => (
										<SelectItem key={m.id} value={m.id}>
											{m.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Location */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-location">Location</Label>
							<Input
								id="edit-location"
								type="text"
								placeholder="e.g. Studio A"
								value={editForm.location}
								onChange={(e) =>
									setEditForm((prev) => ({
										...prev,
										location: e.target.value,
									}))
								}
							/>
						</div>
					</div>

					<DialogFooter className="mt-6">
						<Button
							variant="outline"
							onClick={() => setEditSheetOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (editingSlot) {
									updateMutation.mutate({
										id: editingSlot.id,
										form: editForm,
									});
								}
							}}
							disabled={updateMutation.isPending || !editingSlot}
						>
							{updateMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ----------------------------------------------------------------- */}
			{/* Signups Dialog                                                     */}
			{/* ----------------------------------------------------------------- */}
			<Dialog
				open={signupsSheetOpen}
				onOpenChange={(open) => {
					setSignupsSheetOpen(open);
					if (!open) setViewingSignupsSlot(null);
				}}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Users className="size-5" />
							Signups
						</DialogTitle>
						{viewingSignupsSlot && (
							<DialogDescription>
								{serviceNameById(viewingSignupsSlot.serviceId)},{" "}
								{new Date(viewingSignupsSlot.date).toLocaleDateString()} at{" "}
								{viewingSignupsSlot.startTime}
							</DialogDescription>
						)}
					</DialogHeader>

					<Separator className="my-4" />

					{viewingSignupsSlot &&
						!viewingSignupsSlot.isCancelled &&
						viewingSignupsSlot.spotsBooked < viewingSignupsSlot.capacity && (
							<div className="mb-4 flex items-end gap-2">
								<div className="flex-1">
									<Label htmlFor="enroll-client" className="text-xs">
										Enroll customer
									</Label>
									<Select value={enrollClientUserId} onValueChange={setEnrollClientUserId}>
										<SelectTrigger id="enroll-client">
											<SelectValue placeholder="Select customer..." />
										</SelectTrigger>
										<SelectContent>
											{customerMembers.length === 0 ? (
												<div className="px-2 py-1.5 text-xs text-muted-foreground">
													No active customers. Invite one first.
												</div>
											) : (
												customerMembers.map(
													(m: { id: string; userId: string; name: string }) => (
														<SelectItem key={m.id} value={m.userId}>
															{m.name}
														</SelectItem>
													),
												)
											)}
										</SelectContent>
									</Select>
								</div>
								<Button
									size="sm"
									onClick={() => enrollMutation.mutate(enrollClientUserId)}
									disabled={!enrollClientUserId || enrollMutation.isPending}
								>
									{enrollMutation.isPending ? "Enrolling..." : "Enroll"}
								</Button>
							</div>
						)}

					{signupsLoading ? (
						<div className="flex items-center justify-center py-12">
							<LoadingSpinner size="md" />
						</div>
					) : signups.length === 0 ? (
						<p className="text-center text-muted-foreground py-12 text-sm">
							No sign-ups yet.
						</p>
					) : (
						<div className="space-y-2">
							{signups.map((signup, i) => (
								// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- composite key: appointmentId may repeat across recurring signups, index disambiguates
								<div
									key={`${signup.appointmentId}-${i}`}
									className="rounded-lg border p-3 space-y-1"
								>
									<div className="flex items-center justify-between">
										<span className="font-medium text-sm">{signup.name}</span>
										<StatusBadge
											status={
												signup.attended === true
													? ("completed" as CanonicalStatus)
													: signup.attended === false
														? ("no-show" as CanonicalStatus)
														: ("pending" as CanonicalStatus)
											}
											label={
												signup.attended === true
													? "Attended"
													: signup.attended === false
														? "No-show"
														: "Pending"
											}
										/>
									</div>
									{signup.email && (
										<p className="text-xs text-muted-foreground">
											{signup.email}
										</p>
									)}
									{signup.phone && (
										<p className="text-xs text-muted-foreground">
											{signup.phone}
										</p>
									)}
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3 text-xs text-muted-foreground">
											<span className="capitalize">{signup.clientType === "walk_in" ? "Walk-in" : "Member"}</span>
											<span>·</span>
											<span className="capitalize">{signup.appointmentStatus}</span>
										</div>
										{signup.appointmentStatus !== "cancelled" && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => removeEnrollmentMutation.mutate(signup.appointmentId)}
												disabled={removeEnrollmentMutation.isPending}
											>
												Remove
											</Button>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* ----------------------------------------------------------------- */}
			{/* Cancel Confirmation Dialog                                         */}
			{/* ----------------------------------------------------------------- */}
			<Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cancel Class Slot</DialogTitle>
						<DialogDescription>
							{cancellingSlot
								? `Are you sure you want to cancel the class on ${new Date(cancellingSlot.date).toLocaleDateString()} at ${cancellingSlot.startTime}? This action cannot be undone.`
								: "Are you sure you want to cancel this class slot?"}
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-1.5 py-2">
						<Label htmlFor="cancel-reason">
							Cancellation reason (optional)
						</Label>
						<Textarea
							id="cancel-reason"
							placeholder="e.g. Instructor unavailable"
							value={cancellationReason}
							onChange={(e) => setCancellationReason(e.target.value)}
							rows={3}
						/>
					</div>

					<DialogFooter className="gap-2">
						<DialogClose asChild>
							<Button variant="outline">Keep Class</Button>
						</DialogClose>
						<Button
							variant="destructive"
							disabled={cancelMutation.isPending}
							onClick={() => {
								if (cancellingSlot) {
									cancelMutation.mutate({
										id: cancellingSlot.id,
										reason: cancellationReason,
									});
								}
							}}
						>
							{cancelMutation.isPending ? "Cancelling..." : "Cancel Class"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
