import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	CalendarDays,
	MoreHorizontal,
	Plus,
	Search,
	Users,
} from "lucide-react";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";
import { useApiMutation } from "@/hooks/useApiMutation";

import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchSelector } from "@/components/branch/branch-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusCallout } from "@/components/ui/status-callout";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/appointment/class-slots/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		view: (search.view === "flat" ? "flat" : "grouped") as
			| "grouped"
			| "flat",
	}),
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
	waitlistCount: number;
	pricePerSpotCents: number;
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
// Design token helpers
// ---------------------------------------------------------------------------

// Bar color thresholds: <70% green, 70-99% amber, 100% red
function fillBarColor(pct: number): string {
	if (pct >= 100) return "bg-red-500";
	if (pct >= 70) return "bg-amber-400";
	return "bg-emerald-500";
}

function fillPctColor(pct: number): string {
	if (pct >= 100) return "text-red-600 font-bold";
	if (pct >= 70) return "text-amber-600";
	return "text-[#737373]";
}

// Day-of-week short label for a date
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
function slotDayLabel(date: Date): string {
	const jsDay = new Date(date).getDay(); // 0=Sun
	const monFirst = jsDay === 0 ? 6 : jsDay - 1;
	return DAY_SHORT[monFirst] ?? "—";
}

// Duration in minutes
function durationMinutes(startTime: string, endTime: string): number {
	const [sh, sm] = startTime.split(":").map(Number);
	const [eh, em] = endTime.split(":").map(Number);
	return eh * 60 + em - (sh * 60 + sm);
}

// ---------------------------------------------------------------------------
// KPI Tile
// ---------------------------------------------------------------------------

interface KpiTileProps {
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	fillPct?: number; // if set, renders a fill bar below the value
	accent?: "default" | "amber" | "red";
}

function KpiTile({ label, value, sub, fillPct, accent = "default" }: KpiTileProps) {
	const valueColor =
		accent === "amber"
			? "text-amber-600"
			: accent === "red"
				? "text-red-600"
				: "text-[#0a0a0a]";

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373] mb-2">
				{label}
			</p>
			<p className={cn("font-mono tabular-nums text-3xl font-extrabold", valueColor)}>
				{value}
			</p>
			{fillPct !== undefined && (
				<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5e5e5]">
					<div
						className={cn("h-full rounded-full transition-[width] duration-300", fillBarColor(fillPct))}
						style={{ width: `${Math.min(fillPct, 100)}%` }}
					/>
				</div>
			)}
			{sub && (
				<p className="mt-1.5 text-xs text-[#737373]">{sub}</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Fill Rate Bar (inline in table)
// ---------------------------------------------------------------------------

interface FillBarProps {
	booked: number;
	capacity: number;
}

function FillBar({ booked, capacity }: FillBarProps) {
	const pct = capacity > 0 ? Math.min((booked / capacity) * 100, 100) : 0;
	const pctRounded = Math.round(pct);

	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[#e5e5e5]">
				<div
					className={cn("h-full rounded-full transition-[width] duration-300", fillBarColor(pct))}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className={cn("font-mono tabular-nums text-xs", fillPctColor(pct))}>
				{pctRounded}%
			</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Status badge (Design 3 style — flat pill)
// ---------------------------------------------------------------------------

type SlotStatus = "open" | "full" | "waitlist" | "cancelled";

function SlotStatusBadge({ status }: { status: SlotStatus }) {
	const map: Record<SlotStatus, { cls: string; label: string }> = {
		open: { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", label: "Open" },
		full: { cls: "bg-red-50 text-red-700 border border-red-200", label: "Full" },
		waitlist: { cls: "bg-amber-50 text-amber-700 border border-amber-200", label: "Waitlist" },
		cancelled: { cls: "bg-[#f3f3f3] text-[#737373] border border-[#e5e5e5]", label: "Cancelled" },
	};
	const { cls, label } = map[status];
	return (
		<span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold", cls)}>
			{label}
		</span>
	);
}

function deriveStatus(slot: ClassSlotRow): SlotStatus {
	if (slot.isCancelled) return "cancelled";
	if (slot.spotsAvailable === 0) return "full";
	if (slot.waitlistCount > 0) return "waitlist";
	return "open";
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

function ClassSlotsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// --- Filter state ---
	const [search, setSearch] = useState<string>("");
	const [statusFilter, setStatusFilter] = useState<"all" | "open" | "full" | "waitlist">("all");

	// --- Dialog state ---
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const [editSheetOpen, setEditSheetOpen] = useState(false);
	const [editingSlot, setEditingSlot] = useState<ClassSlotRow | null>(null);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancellingSlot, setCancellingSlot] = useState<ClassSlotRow | null>(null);
	const [cancellationReason, setCancellationReason] = useState("");
	const [signupsSheetOpen, setSignupsSheetOpen] = useState(false);
	const [viewingSignupsSlot, setViewingSignupsSlot] = useState<ClassSlotRow | null>(null);

	// --- Form state ---
	const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
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
		queryKey: ["classSlots", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.classSlots.list({ organizationId });
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
		queryKey: ["members", organizationId, "client"],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.members.list({ organizationId, role: "client", status: "active" });
		},
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
	// KPI computation (client-side)
	// ---------------------------------------------------------------------------

	const activeSlots = classSlots.filter((s) => !s.isCancelled);
	const totalSlots = activeSlots.length;

	const avgFillRate =
		activeSlots.length > 0
			? Math.round(
					(activeSlots.reduce(
						(sum, s) =>
							sum + (s.capacity > 0 ? s.spotsBooked / s.capacity : 0),
						0,
					) /
						activeSlots.length) *
						100,
				)
			: 0;

	const fullSlotsCount = activeSlots.filter((s) => s.spotsAvailable === 0).length;

	const totalWaitlisted = activeSlots.reduce((sum, s) => sum + (s.waitlistCount ?? 0), 0);

	const projectedRevenueCents = activeSlots.reduce(
		(sum, s) => sum + (s.pricePerSpotCents ?? 0) * s.capacity,
		0,
	);

	// ---------------------------------------------------------------------------
	// Filtered flat slot list (Design 3 uses a flat table, not grouped)
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
						sub="active slots"
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
						sub="across active slots"
					/>
					<KpiTile
						label="Waitlisted"
						value={<span className="font-mono tabular-nums">{totalWaitlisted}</span>}
						sub="across active slots"
						accent={totalWaitlisted > 0 ? "amber" : "default"}
					/>
					<KpiTile
						label="Projected Revenue"
						value={
							<span className="font-mono tabular-nums text-2xl">
								{formatPrice(projectedRevenueCents)}
							</span>
						}
						sub="capacity × price per spot"
					/>
				</div>

				{/* ── Dense capacity table ── */}
				<div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					{/* Table toolbar */}
					<div className="flex items-center justify-between border-b border-[#e5e5e5] bg-[#f3f3f3] px-5 py-3">
						<span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
							All Class Slots
						</span>
						{/* Status filter pills */}
						<div className="flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white p-1">
							{(["all", "open", "waitlist", "full"] as const).map((f) => (
								<button
									key={f}
									type="button"
									onClick={() => setStatusFilter(f)}
									className={cn(
										"rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition",
										statusFilter === f
											? "bg-[#0a0a0a] text-white"
											: "text-[#737373] hover:text-[#0a0a0a]",
									)}
								>
									{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
								</button>
							))}
						</div>
					</div>

					{/* Scrollable table body */}
					<div className="overflow-y-auto h-[calc(100%-49px)]">
						{isError ? (
							<div className="p-6">
								<StatusCallout
									variant="error"
									title="Couldn't load class slots"
									onRetry={() => refetch()}
								/>
							</div>
						) : isLoading ? (
							<PageLoader />
						) : classSlots.length === 0 ? (
							<EmptyState
								icon={CalendarDays}
								title="No class slots scheduled"
								description="Create your first class slot to start scheduling group sessions."
								action={{
									label: "Add Slot",
									onClick: () => setCreateSheetOpen(true),
								}}
							/>
						) : filteredSlots.length === 0 ? (
							<EmptyState
								icon={Search}
								title="No slots match your filters"
								description="Try a different search term or status filter."
							/>
						) : (
							<table className="w-full text-sm">
								<thead className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-[#f3f3f3]/80 backdrop-blur-sm">
									<tr>
										<th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Class
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Day / Time
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Instructor
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Studio
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Duration
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373] w-36">
											Fill Rate
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Capacity
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Waitlist
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Revenue
										</th>
										<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
											Status
										</th>
										<th className="px-4 py-2.5 w-10" />
									</tr>
								</thead>
								<tbody className="divide-y divide-[#e5e5e5]">
									{filteredSlots.map((slot) => {
										const status = deriveStatus(slot);
										const isFull = status === "full";
										const isCancelled = status === "cancelled";
										const dur = durationMinutes(slot.startTime, slot.endTime);
										const instrName = memberNameById(slot.instructorId);
										const dayLabel = slotDayLabel(slot.date);

										return (
											<tr
												key={slot.id}
												className={cn(
													"transition-colors",
													isFull && !isCancelled
														? "bg-[#fffbf0] hover:bg-[#fff7e6]"
														: isCancelled
															? "opacity-60 hover:bg-[#f3f3f3]"
															: "hover:bg-[#f3f3f3]/60",
												)}
											>
												{/* Class name */}
												<td className="px-5 py-3 font-semibold text-[#0a0a0a]">
													{serviceNameById(slot.serviceId)}
												</td>

												{/* Day / Time */}
												<td className="px-4 py-3 font-medium text-[#0a0a0a]">
													{dayLabel} · {slot.startTime}
												</td>

												{/* Instructor */}
												<td className="px-4 py-3 text-[#737373]">
													{instrName ?? (
														<span className="text-[#a3a3a3]">—</span>
													)}
												</td>

												{/* Studio / Location */}
												<td className="px-4 py-3 text-[#737373]">
													{slot.location ?? (
														<span className="text-[#a3a3a3]">—</span>
													)}
												</td>

												{/* Duration */}
												<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">
													{dur > 0 ? `${dur} min` : "—"}
												</td>

												{/* Fill rate bar */}
												<td className="px-4 py-3">
													{isCancelled ? (
														<span className="text-xs text-[#a3a3a3]">—</span>
													) : (
														<FillBar
															booked={slot.spotsBooked}
															capacity={slot.capacity}
														/>
													)}
												</td>

												{/* Capacity fraction */}
												<td
													className={cn(
														"px-4 py-3 font-mono tabular-nums font-semibold",
														isFull && !isCancelled ? "text-red-600" : "text-[#0a0a0a]",
													)}
												>
													{slot.spotsBooked} / {slot.capacity}
												</td>

												{/* Waitlist count */}
												<td className="px-4 py-3 font-mono tabular-nums text-[#737373]">
													{isCancelled ? (
														<span className="text-[#a3a3a3]">—</span>
													) : slot.waitlistCount > 0 ? (
														<span className="font-semibold text-amber-600">
															{slot.waitlistCount}
														</span>
													) : (
														0
													)}
												</td>

												{/* Projected revenue: pricePerSpotCents × spotsBooked */}
												<td className="px-4 py-3 font-mono tabular-nums text-[#737373]">
													{isCancelled ? (
														<span className="text-[#a3a3a3]">—</span>
													) : (
														formatPrice(slot.pricePerSpotCents * slot.spotsBooked)
													)}
												</td>

												{/* Status badge */}
												<td className="px-4 py-3">
													<SlotStatusBadge status={status} />
												</td>

												{/* Actions */}
												<td className="px-4 py-3 text-right">
													{isFull && !isCancelled ? (
														// Full slot: Waitlist button replaces normal Manage
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<button
																	type="button"
																	className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
																>
																	Waitlist ▾
																</button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuItem onClick={() => handleViewSignups(slot)}>
																	<Users className="mr-2 h-3.5 w-3.5" />
																	View Signups
																</DropdownMenuItem>
																<DropdownMenuItem onClick={() => handleOpenEdit(slot)}>
																	Edit
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => handleOpenCancel(slot)}
																	className="text-destructive focus:text-destructive"
																>
																	Cancel Class
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													) : (
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-7 w-7 p-0"
																>
																	<MoreHorizontal className="h-3.5 w-3.5" />
																	<span className="sr-only">Open menu</span>
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuItem onClick={() => handleViewSignups(slot)}>
																	<Users className="mr-2 h-3.5 w-3.5" />
																	View Signups
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() => handleOpenEdit(slot)}
																	disabled={isCancelled}
																>
																	Edit
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => handleOpenCancel(slot)}
																	disabled={isCancelled}
																	className="text-destructive focus:text-destructive"
																>
																	Cancel Class
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						)}
					</div>
				</div>
			</div>

			{/* -----------------------------------------------------------------
			    Create Dialog
			    ----------------------------------------------------------------- */}
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
									{services.map((svc) => (
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
									setCreateForm((prev) => ({ ...prev, date: e.target.value }))
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

			{/* -----------------------------------------------------------------
			    Edit Dialog
			    ----------------------------------------------------------------- */}
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
						<Button variant="outline" onClick={() => setEditSheetOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (editingSlot) {
									updateMutation.mutate({ id: editingSlot.id, form: editForm });
								}
							}}
							disabled={updateMutation.isPending || !editingSlot}
						>
							{updateMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* -----------------------------------------------------------------
			    Signups Dialog
			    ----------------------------------------------------------------- */}
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
							<Users className="h-5 w-5" />
							Signups
						</DialogTitle>
						{viewingSignupsSlot && (
							<DialogDescription>
								{serviceNameById(viewingSignupsSlot.serviceId)} —{" "}
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
									<Select
										value={enrollClientUserId}
										onValueChange={setEnrollClientUserId}
									>
										<SelectTrigger id="enroll-client">
											<SelectValue placeholder="Select customer..." />
										</SelectTrigger>
										<SelectContent>
											{customerMembers.length === 0 ? (
												<div className="px-2 py-1.5 text-xs text-muted-foreground">
													No active customers — invite one first.
												</div>
											) : (
												customerMembers.map(
													(m: {
														id: string;
														userId: string;
														name: string;
													}) => (
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
						<p className="py-12 text-center text-sm text-muted-foreground">
							No sign-ups yet.
						</p>
					) : (
						<div className="space-y-2">
							{signups.map((signup, i) => (
								<div
									key={`${signup.appointmentId}-${i}`}
									className="space-y-1 rounded-lg border border-[#e5e5e5] p-3"
								>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{signup.name}</span>
										<span
											className={cn(
												"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
												signup.attended === true
													? "bg-emerald-50 text-emerald-700 border border-emerald-200"
													: signup.attended === false
														? "bg-red-50 text-red-700 border border-red-200"
														: "bg-[#f3f3f3] text-[#737373] border border-[#e5e5e5]",
											)}
										>
											{signup.attended === true
												? "Attended"
												: signup.attended === false
													? "No-show"
													: "Pending"}
										</span>
									</div>
									{signup.email && (
										<p className="text-xs text-[#737373]">{signup.email}</p>
									)}
									{signup.phone && (
										<p className="text-xs text-[#737373]">{signup.phone}</p>
									)}
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3 text-xs text-[#737373]">
											<span className="capitalize">
												{signup.clientType === "walk_in" ? "Walk-in" : "Member"}
											</span>
											<span>·</span>
											<span className="capitalize">{signup.appointmentStatus}</span>
										</div>
										{signup.appointmentStatus !== "cancelled" && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() =>
													removeEnrollmentMutation.mutate(signup.appointmentId)
												}
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

			{/* -----------------------------------------------------------------
			    Cancel Confirmation Dialog
			    ----------------------------------------------------------------- */}
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
