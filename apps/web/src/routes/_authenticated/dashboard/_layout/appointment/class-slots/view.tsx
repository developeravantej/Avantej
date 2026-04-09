import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, Plus } from "lucide-react";
import { toast } from "sonner";

import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
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
		await requirePermission("appointment_management:read");
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
		error,
	} = useQuery({
		queryKey: ["classSlots", organizationId],
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

	// ---------------------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------------------

	const createMutation = useMutation({
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
		onSuccess: () => {
			toast.success("Class slot created successfully.");
			setCreateSheetOpen(false);
			setCreateForm(EMPTY_CREATE_FORM);
			queryClient.invalidateQueries({ queryKey: ["classSlots", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(`Failed to create class slot: ${err.message}`);
		},
	});

	const updateMutation = useMutation({
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
		onSuccess: () => {
			toast.success("Class slot updated successfully.");
			setEditSheetOpen(false);
			setEditingSlot(null);
			setEditForm(EMPTY_EDIT_FORM);
			queryClient.invalidateQueries({ queryKey: ["classSlots", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(`Failed to update class slot: ${err.message}`);
		},
	});

	const cancelMutation = useMutation({
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
		onSuccess: () => {
			toast.success("Class slot cancelled.");
			setCancelDialogOpen(false);
			setCancellingSlot(null);
			setCancellationReason("");
			queryClient.invalidateQueries({ queryKey: ["classSlots", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(`Failed to cancel class slot: ${err.message}`);
		},
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	const serviceNameById = (id: string) => {
		const svc = services.find((s) => s.id === id);
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
					return <Badge variant="destructive">Cancelled</Badge>;
				}
				if (spotsAvailable === 0) {
					return <Badge variant="secondary">Full</Badge>;
				}
				return <Badge variant="default">Available</Badge>;
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
			<div className="space-y-4">
				<h1 className="text-3xl font-bold font-heading">Class Slots</h1>
				<p className="text-muted-foreground">No organization selected.</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold font-heading">Class Slots</h1>
				<p className="text-destructive">
					{error instanceof Error
						? error.message
						: "Failed to load class slots"}
				</p>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Calendar className="h-6 w-6 text-muted-foreground" />
					<h1 className="text-3xl font-bold font-heading">Class Slots</h1>
				</div>
				<Button onClick={() => setCreateSheetOpen(true)}>
					<Plus className="mr-2 h-4 w-4" />
					Create Class Slot
				</Button>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
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
							{services.map((svc) => (
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

			{/* Table */}
			{isLoading ? (
				<div className="flex items-center justify-center min-h-96">
					<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
						<span className="sr-only">Loading...</span>
					</div>
				</div>
			) : (
				<DataTable<ClassSlotRow, unknown> columns={columns} data={classSlots} />
			)}

			{/* ----------------------------------------------------------------- */}
			{/* Create Sheet                                                       */}
			{/* ----------------------------------------------------------------- */}
			<Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
				<SheetContent className="overflow-y-auto sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Create Class Slot</SheetTitle>
						<SheetDescription>
							Schedule a new group class slot.
						</SheetDescription>
					</SheetHeader>

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
									{services.map((svc) => (
										<SelectItem key={svc.id} value={svc.id}>
											{svc.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Branch ID */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-branch">
								Branch ID <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-branch"
								type="text"
								placeholder="Enter branch UUID"
								value={createForm.branchId}
								onChange={(e) =>
									setCreateForm((prev) => ({
										...prev,
										branchId: e.target.value,
									}))
								}
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

					<SheetFooter className="mt-6">
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
					</SheetFooter>
				</SheetContent>
			</Sheet>

			{/* ----------------------------------------------------------------- */}
			{/* Edit Sheet                                                         */}
			{/* ----------------------------------------------------------------- */}
			<Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
				<SheetContent className="overflow-y-auto sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Edit Class Slot</SheetTitle>
						<SheetDescription>
							Update the details for this class slot.
						</SheetDescription>
					</SheetHeader>

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

					<SheetFooter className="mt-6">
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
					</SheetFooter>
				</SheetContent>
			</Sheet>

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
