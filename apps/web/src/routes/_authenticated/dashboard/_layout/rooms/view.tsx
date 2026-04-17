import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { DoorOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/tables/rooms/view/data-table";
import type { RoomRow } from "@/components/tables/rooms/view/columns";

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/rooms/view"
)({
	validateSearch: (search: Record<string, unknown>) => ({
		returnTo: search.returnTo as string | undefined,
	}),
	component: RoomsViewPage,
});

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_TABS = [
	{ label: "Active", value: true as boolean | undefined },
	{ label: "All", value: undefined as boolean | undefined },
	{ label: "Inactive", value: false as boolean | undefined },
];

const TYPE_OPTIONS = [
	{ value: "consultation", label: "Consultation" },
	{ value: "group_session", label: "Group Session" },
	{ value: "private", label: "Private" },
	{ value: "training", label: "Training" },
	{ value: "individual", label: "Individual" },
] as const;

type RoomType = (typeof TYPE_OPTIONS)[number]["value"];

// ── Form state ────────────────────────────────────────────────────────────────

interface RoomFormState {
	name: string;
	type: RoomType | "";
	capacity: string;
	branchId: string;
	isActive: boolean;
}

const EMPTY_FORM: RoomFormState = {
	name: "",
	type: "",
	capacity: "",
	branchId: "",
	isActive: true,
};

// ── Page ──────────────────────────────────────────────────────────────────────

function RoomsViewPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();
	const { returnTo } = useSearch({ from: "/_authenticated/dashboard/_layout/rooms/view" });

	const canCreate = hasPermission("appointment_management:create");
	const canUpdate = hasPermission("appointment_management:update");

	// ---- Filter state ----
	const [activeFilter, setActiveFilter] = useState<boolean | undefined>(true);

	// ---- Sheet / form state ----
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null);
	const [form, setForm] = useState<RoomFormState>(EMPTY_FORM);

	// ---- Hierarchy nodes query (for branch combobox) ----
	const { data: nodesData } = useQuery({
		queryKey: ["hierarchyNodes", organizationId],
		queryFn: async () => {
			if (!organizationId) return { nodes: [] };
			return client.hierarchy.listNodes({ organizationId });
		},
		enabled: !!organizationId,
	});
	const branches = useMemo(
		() => (nodesData?.nodes ?? []).filter((n) => n.type === "branch"),
		[nodesData]
	);
	const branchById = useMemo(
		() => new Map(branches.map((b) => [b.id, b.name])),
		[branches]
	);

	// ---- Rooms query ----
	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: [
			...orpc.rooms.list.key(),
			{ organizationId, isActive: activeFilter },
		],
		queryFn: () =>
			client.rooms.list({
				organizationId: organizationId!,
				isActive: activeFilter,
			}),
		enabled: !!organizationId,
	});

	// ---- Map to RoomRow ----
	const tableData: RoomRow[] = apiData.map((r) => ({
		id: r.id,
		name: r.name,
		type: r.type as RoomRow["type"],
		branchId: r.branchId,
		branchName: branchById.get(r.branchId) ?? r.branchId,
		capacity: r.capacity,
		isActive: r.isActive,
		createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
		updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
	}));

	// ---- Mutations ----
	function invalidateRooms() {
		queryClient.invalidateQueries({
			queryKey: [...orpc.rooms.list.key(), { organizationId }],
		});
	}

	const createMutation = useMutation({
		mutationFn: (data: { name: string; type: RoomType; capacity: number; branchId: string }) =>
			client.rooms.create({ organizationId: organizationId!, ...data }),
		onSuccess: () => {
			invalidateRooms();
			toast.success("Room created successfully");
			closeSheet();
		},
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Failed to create room"),
	});

	const updateMutation = useMutation({
		mutationFn: ({
			id,
			data,
		}: {
			id: string;
			data: { name: string; type: RoomType; capacity: number; branchId: string; isActive: boolean };
		}) => client.rooms.update({ organizationId: organizationId!, id, ...data }),
		onSuccess: () => {
			invalidateRooms();
			toast.success("Room updated successfully");
			closeSheet();
		},
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Failed to update room"),
	});

	const deactivateMutation = useMutation({
		mutationFn: (id: string) =>
			client.rooms.update({ organizationId: organizationId!, id, isActive: false }),
		onSuccess: () => invalidateRooms(),
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Failed to deactivate room"),
	});

	const reactivateMutation = useMutation({
		mutationFn: (id: string) =>
			client.rooms.update({ organizationId: organizationId!, id, isActive: true }),
		onSuccess: () => invalidateRooms(),
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Failed to reactivate room"),
	});

	// ---- Sheet helpers ----
	function openCreate() {
		setEditingRoom(null);
		setForm(EMPTY_FORM);
		setIsSheetOpen(true);
	}

	function openEdit(room: RoomRow) {
		setEditingRoom(room);
		setForm({
			name: room.name,
			type: room.type,
			capacity: String(room.capacity),
			branchId: room.branchId,
			isActive: room.isActive,
		});
		setIsSheetOpen(true);
	}

	function closeSheet() {
		setIsSheetOpen(false);
		setEditingRoom(null);
		setForm(EMPTY_FORM);
	}

	function handleSubmit() {
		const name = form.name.trim();
		if (!name) {
			toast.error("Name is required");
			return;
		}
		if (!form.type) {
			toast.error("Type is required");
			return;
		}
		const capacity = parseInt(form.capacity, 10);
		if (Number.isNaN(capacity) || capacity < 1) {
			toast.error("Capacity must be at least 1");
			return;
		}
		if (!form.branchId) {
			toast.error("Branch is required");
			return;
		}

		if (editingRoom) {
			updateMutation.mutate({
				id: editingRoom.id,
				data: {
					name,
					type: form.type as RoomType,
					capacity,
					branchId: form.branchId,
					isActive: form.isActive,
				},
			});
		} else {
			createMutation.mutate({
				name,
				type: form.type as RoomType,
				capacity,
				branchId: form.branchId,
			});
		}
	}

	const isBusy = createMutation.isPending || updateMutation.isPending;

	// ---- Guard ----
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view rooms.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="text-lg font-medium text-destructive">Failed to load data</p>
				<p className="text-sm text-muted-foreground mb-4">
					{error instanceof Error ? error.message : "An unexpected error occurred"}
				</p>
				<Button variant="outline" onClick={() => refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			{/* returnTo banner */}
			{returnTo && (
				<Alert className="bg-yellow-50 border-yellow-300">
					<AlertDescription>
						Creating a room to complete an appointment?{" "}
						<Link
							to={returnTo}
							className="underline font-medium"
						>
							Back to appointment &rarr;
						</Link>
					</AlertDescription>
				</Alert>
			)}

			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<DoorOpen className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Rooms</h1>
						<p className="text-sm text-muted-foreground">
							Manage rooms available for appointments
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline">{tableData.length} room(s)</Badge>
					{canCreate && (
						<Button onClick={openCreate} className="gap-2">
							<Plus className="h-4 w-4" />
							Create Room
						</Button>
					)}
				</div>
			</div>

			{/* Status tabs */}
			<div className="flex items-center gap-1 border-b">
				{ACTIVE_TABS.map((tab) => {
					const isSelected = activeFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setActiveFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isSelected
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Empty state */}
			{tableData.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<p className="text-lg font-medium">No rooms found</p>
					<p className="text-sm">
						{activeFilter === true
							? "No active rooms. Create one to get started."
							: activeFilter === false
								? "No inactive rooms."
								: "No rooms created yet."}
					</p>
				</div>
			)}

			{/* Table */}
			{tableData.length > 0 && (
				<DataTable
					data={tableData}
					onEdit={canUpdate ? openEdit : () => {}}
					onDeactivate={async (id) => {
						await deactivateMutation.mutateAsync(id);
					}}
					onReactivate={async (id) => {
						await reactivateMutation.mutateAsync(id);
					}}
					isDeactivating={deactivateMutation.isPending}
					isReactivating={reactivateMutation.isPending}
				/>
			)}

			{/* Create / Edit Sheet */}
			<Sheet open={isSheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
				<SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
					<SheetHeader>
						<SheetTitle>{editingRoom ? "Edit Room" : "Create Room"}</SheetTitle>
						<SheetDescription>
							{editingRoom
								? "Update the room details below."
								: "Fill in the details to create a new room."}
						</SheetDescription>
					</SheetHeader>

					<div className="flex flex-col gap-4 px-4 py-2">
						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<label htmlFor="room-name" className="text-sm font-medium">
								Name <span className="text-destructive">*</span>
							</label>
							<Input
								id="room-name"
								value={form.name}
								onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
								placeholder="e.g. Studio A"
							/>
						</div>

						{/* Type */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Type <span className="text-destructive">*</span>
							</label>
							<Select
								value={form.type}
								onValueChange={(val) =>
									setForm((prev) => ({ ...prev, type: val as RoomType }))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a type" />
								</SelectTrigger>
								<SelectContent>
									{TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Capacity */}
						<div className="flex flex-col gap-1.5">
							<label htmlFor="room-capacity" className="text-sm font-medium">
								Capacity <span className="text-destructive">*</span>
							</label>
							<Input
								id="room-capacity"
								type="number"
								min={1}
								value={form.capacity}
								onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
								placeholder="e.g. 10"
							/>
						</div>

						{/* Branch combobox */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Branch <span className="text-destructive">*</span>
							</label>
							{branches.length === 0 ? (
								<p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
									No branches found. Create a branch first.
								</p>
							) : (
								<BranchCombobox
									value={form.branchId}
									onChange={(id) => setForm((prev) => ({ ...prev, branchId: id }))}
									branches={branches}
									placeholder="Search branch..."
								/>
							)}
						</div>

						{/* Active toggle (edit only) */}
						{editingRoom && (
							<div className="flex items-center gap-3">
								<input
									id="room-active"
									type="checkbox"
									checked={form.isActive}
									onChange={(e) =>
										setForm((prev) => ({ ...prev, isActive: e.target.checked }))
									}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
								/>
								<label htmlFor="room-active" className="text-sm font-medium">
									Active
								</label>
							</div>
						)}
					</div>

					<SheetFooter className="px-4">
						<Button variant="outline" onClick={closeSheet} disabled={isBusy}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={isBusy}>
							{isBusy
								? editingRoom
									? "Saving..."
									: "Creating..."
								: editingRoom
									? "Save Changes"
									: "Create Room"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
}

// ── BranchCombobox ────────────────────────────────────────────────────────────

interface BranchNode {
	id: string;
	name: string;
	type: string;
}

function BranchCombobox({
	value,
	onChange,
	branches,
	placeholder,
}: {
	value: string;
	onChange: (id: string) => void;
	branches: BranchNode[];
	placeholder: string;
}) {
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const selectedBranch = branches.find((b) => b.id === value);
	const displayValue = open ? search : (selectedBranch?.name ?? "");
	const filtered = branches.filter((b) =>
		b.name.toLowerCase().includes(search.toLowerCase())
	);

	return (
		<div className="relative" ref={containerRef}>
			<Input
				placeholder={placeholder}
				value={displayValue}
				onChange={(e) => {
					setSearch(e.target.value);
					if (!open) setOpen(true);
				}}
				onFocus={() => {
					setSearch("");
					setOpen(true);
				}}
				onBlur={() => setTimeout(() => setOpen(false), 150)}
			/>
			{open && (
				<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
					<div className="max-h-48 overflow-y-auto p-1">
						{filtered.length === 0 ? (
							<div className="px-2 py-3 text-sm text-muted-foreground text-center">
								No branches found
							</div>
						) : (
							filtered.map((b) => (
								<button
									key={b.id}
									type="button"
									className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										onChange(b.id);
										setSearch("");
										setOpen(false);
									}}
								>
									{b.name}
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
