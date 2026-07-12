import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import {
	type ClassSlotRow,
	type CreateFormState,
	type EditFormState,
	EMPTY_CREATE_FORM,
	EMPTY_EDIT_FORM,
} from "./types";
import { deriveStatus } from "./helpers";
import { KpiTile } from "./kpi-tile";
import { ClassSlotsTable } from "./ClassSlotsTable";
import { CreateClassSlotDialog } from "./CreateClassSlotDialog";
import { EditClassSlotDialog } from "./EditClassSlotDialog";
import { SignupsDialog } from "./SignupsDialog";
import { CancelClassSlotDialog } from "./CancelClassSlotDialog";

// ---------------------------------------------------------------------------
// KPI computation (client-side, over LOADED rows only)
// ---------------------------------------------------------------------------

/**
 * Computes the KPI tile values from the class slots currently loaded on the
 * client. NOTE: the list query returns a bounded page, so these figures cover
 * loaded rows only — they are NOT server-side aggregates across all slots.
 * The tile sublabels state this explicitly ("loaded slots").
 */
export function computeClassSlotKpis(
	classSlots: Array<{
		isCancelled: boolean;
		capacity: number;
		spotsBooked: number;
		waitlistCount?: number | null;
		pricePerSpotCents?: number | null;
	}>,
) {
	const activeSlots = classSlots.filter((s) => !s.isCancelled);
	const totalSlots = activeSlots.length;

	const avgFillRate =
		activeSlots.length > 0
			? Math.round(
					(activeSlots.reduce(
						(sum, s) => sum + (s.capacity > 0 ? s.spotsBooked / s.capacity : 0),
						0,
					) /
						activeSlots.length) *
						100,
				)
			: 0;

	const totalWaitlisted = activeSlots.reduce(
		(sum, s) => sum + (s.waitlistCount ?? 0),
		0,
	);

	const projectedRevenueCents = activeSlots.reduce(
		(sum, s) => sum + (s.pricePerSpotCents ?? 0) * s.capacity,
		0,
	);

	return { totalSlots, avgFillRate, totalWaitlisted, projectedRevenueCents };
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

export function ClassSlotsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { scopeNodeId } = useScope();

	// --- Filter state ---
	const [search, setSearch] = useState<string>("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "open" | "full" | "waitlist"
	>("all");

	// --- Dialog state ---
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const [editSheetOpen, setEditSheetOpen] = useState(false);
	const [editingSlot, setEditingSlot] = useState<ClassSlotRow | null>(null);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancellingSlot, setCancellingSlot] = useState<ClassSlotRow | null>(
		null,
	);
	const [cancellationReason, setCancellationReason] = useState("");
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
		...orpc.classSlots.list.queryOptions({
			input: { organizationId: organizationId!, branchId: scopeNodeId },
		}),
		enabled: !!organizationId,
	});

	const { data: services = [] } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const { data: membersData = [] } = useQuery({
		...orpc.members.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	// AVANTEJ-10: the Instructor <Select> mounts one Radix <SelectItem> per option
	// synchronously when opened. `membersData` is the whole roster including every
	// `client` (customers — thousands in a real tenant), which froze the main
	// thread for tens of seconds. Instructors are staff, never customers, so pass
	// only non-client members to the dialogs. Full `membersData` is kept for
	// instructor-name resolution in the list rows below.
	const instructorOptions = useMemo(
		() =>
			membersData.filter(
				(m: (typeof membersData)[number]) => m.role !== "client",
			),
		[membersData],
	);

	const { data: signups = [], isLoading: signupsLoading } = useQuery({
		...orpc.classSlots.getSignups.queryOptions({
			input: {
				organizationId: organizationId!,
				id: viewingSignupsSlot?.id ?? "",
			},
		}),
		enabled: !!organizationId && !!viewingSignupsSlot,
	});

	// ---------------------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------------------

	// AVANTEJ-17: invalidate via the oRPC list key PREFIX so it matches the live
	// query regardless of its input. The list query is keyed with
	// `branchId: scopeNodeId`, but this invalidate key omitted branchId and so
	// didn't match — the list went stale after create/update/cancel until a reload.
	const classSlotsKey = orpc.classSlots.list.key();

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
		mutationFn: ({ id, form }: { id: string; form: EditFormState }) => {
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
		mutationFn: ({ id, reason }: { id: string; reason: string }) => {
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
		...orpc.members.list.queryOptions({
			input: {
				organizationId: organizationId!,
				role: "client",
				status: "active",
			},
		}),
		enabled: !!organizationId && signupsSheetOpen,
	});

	const enrollMutation = useApiMutation({
		mutationFn: (clientUserId: string) => {
			if (!organizationId || !viewingSignupsSlot)
				throw new Error("Missing context");
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
			return client.classSlots.cancelEnrollment({
				organizationId,
				appointmentId,
			});
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
		const svc = services.find((s) => s.id === id);
		return svc ? svc.name : id;
	};

	const memberNameById = (id: string | null) => {
		if (!id) return null;
		const m = membersData.find(
			(mem: { id: string; name: string }) => mem.id === id,
		);
		return m ? m.name : id;
	};

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------

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
	// KPI computation (client-side, loaded rows only — see computeClassSlotKpis)
	// ---------------------------------------------------------------------------

	const { totalSlots, avgFillRate, totalWaitlisted, projectedRevenueCents } =
		computeClassSlotKpis(classSlots);

	// ---------------------------------------------------------------------------
	// Filtered flat slot list
	// ---------------------------------------------------------------------------

	const filteredSlots = useMemo(() => {
		let result = [...classSlots];

		// Search filter
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter((s) => {
				const svcName = serviceNameById(s.serviceId).toLowerCase();
				const instrName = (memberNameById(s.instructorId) ?? "").toLowerCase();
				const loc = (s.location ?? "").toLowerCase();
				return svcName.includes(q) || instrName.includes(q) || loc.includes(q);
			});
		}

		// Status filter
		if (statusFilter !== "all") {
			result = result.filter((s) => deriveStatus(s) === statusFilter);
		}

		return result;
	}, [classSlots, search, statusFilter, services, membersData]);

	// ---------------------------------------------------------------------------
	// Guard: no org
	// ---------------------------------------------------------------------------

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen flex-col">
				<div className="flex flex-1 items-center justify-center text-[#737373]">
					<p className="text-sm">No organization selected.</p>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			<div className="flex flex-1 flex-col overflow-hidden m-6 gap-5">
				{/* ── Page header ── */}
				<div className="flex shrink-0 items-center justify-between">
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373] mb-1">
							Capacity Overview
						</p>
						<h1 className="text-xl font-bold text-[#0a0a0a]">Class Slots</h1>
					</div>
					<div className="flex items-center gap-2">
						{/* Scope switcher (country / state / branch) */}
						<ScopeSwitcher className="w-56" />
						{/* Search */}
						<div className="flex items-center gap-1.5 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
							<Search className="h-3.5 w-3.5 text-[#737373]" />
							<input
								className="w-40 bg-transparent text-xs outline-none placeholder:text-[#a3a3a3]"
								placeholder="Search slots…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<button
							type="button"
							onClick={() => setCreateSheetOpen(true)}
							className="flex items-center gap-1.5 rounded-[9px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626]"
						>
							<Plus className="h-3.5 w-3.5" />
							New Class Slot
						</button>
					</div>
				</div>

				{/* ── KPI tiles ── */}
				<div className="shrink-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
					<KpiTile
						label="Total Slots"
						value={<span className="font-mono tabular-nums">{totalSlots}</span>}
						sub="active slots (loaded)"
					/>
					<KpiTile
						label="Avg Fill Rate"
						value={
							<>
								{avgFillRate}
								<span className="text-lg font-normal text-[#737373]">%</span>
							</>
						}
						fillPct={avgFillRate}
						sub="of loaded slots"
					/>
					<KpiTile
						label="Waitlisted"
						value={
							<span className="font-mono tabular-nums">{totalWaitlisted}</span>
						}
						sub="of loaded slots"
						accent={totalWaitlisted > 0 ? "amber" : "default"}
					/>
					<KpiTile
						label="Projected Revenue"
						value={
							<span className="font-mono tabular-nums text-2xl">
								{formatPrice(projectedRevenueCents)}
							</span>
						}
						sub="capacity × price, loaded slots"
					/>
				</div>

				{/* ── Dense capacity table ── */}
				<ClassSlotsTable
					classSlots={classSlots}
					filteredSlots={filteredSlots}
					isLoading={isLoading}
					isError={isError}
					statusFilter={statusFilter}
					setStatusFilter={setStatusFilter}
					onRetry={() => refetch()}
					onOpenCreate={() => setCreateSheetOpen(true)}
					onOpenEdit={handleOpenEdit}
					onOpenCancel={handleOpenCancel}
					onViewSignups={handleViewSignups}
					serviceNameById={serviceNameById}
					memberNameById={memberNameById}
				/>
			</div>

			{/* Dialogs */}
			<CreateClassSlotDialog
				open={createSheetOpen}
				onOpenChange={setCreateSheetOpen}
				organizationId={organizationId}
				services={services}
				membersData={instructorOptions}
				createForm={createForm}
				setCreateForm={setCreateForm}
				isPending={createMutation.isPending}
				onSubmit={(form) => createMutation.mutate(form)}
			/>

			<EditClassSlotDialog
				open={editSheetOpen}
				onOpenChange={setEditSheetOpen}
				editingSlot={editingSlot}
				membersData={instructorOptions}
				editForm={editForm}
				setEditForm={setEditForm}
				isPending={updateMutation.isPending}
				onSubmit={(id, form) => updateMutation.mutate({ id, form })}
			/>

			<SignupsDialog
				open={signupsSheetOpen}
				onOpenChange={(isOpen) => {
					setSignupsSheetOpen(isOpen);
					if (!isOpen) setViewingSignupsSlot(null);
				}}
				viewingSignupsSlot={viewingSignupsSlot}
				signups={signups}
				signupsLoading={signupsLoading}
				customerMembers={customerMembers}
				enrollClientUserId={enrollClientUserId}
				setEnrollClientUserId={setEnrollClientUserId}
				enrollIsPending={enrollMutation.isPending}
				removeEnrollmentIsPending={removeEnrollmentMutation.isPending}
				onEnroll={(clientUserId) => enrollMutation.mutate(clientUserId)}
				onRemoveEnrollment={(appointmentId) =>
					removeEnrollmentMutation.mutate(appointmentId)
				}
				serviceNameById={serviceNameById}
			/>

			<CancelClassSlotDialog
				open={cancelDialogOpen}
				onOpenChange={setCancelDialogOpen}
				cancellingSlot={cancellingSlot}
				cancellationReason={cancellationReason}
				setCancellationReason={setCancellationReason}
				isPending={cancelMutation.isPending}
				onConfirm={(id, reason) => cancelMutation.mutate({ id, reason })}
			/>
		</div>
	);
}
