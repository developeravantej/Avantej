import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useState, useMemo, useRef } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/tables/rooms/view/data-table";
import type { RoomRow } from "@/components/tables/rooms/view/columns";
import { RoomFormDialog } from "./room-form-dialog";
import { RoomsActionBar } from "./rooms-action-bar";

const TYPE_OPTIONS = [
	{ value: "consultation", label: "Consultation" },
	{ value: "group_session", label: "Group Session" },
	{ value: "private", label: "Private" },
	{ value: "training", label: "Training" },
	{ value: "individual", label: "Individual" },
] as const;

type RoomType = (typeof TYPE_OPTIONS)[number]["value"];

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

export function RoomsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const canCreate = hasPermission("appointment_management:create");
	const canUpdate = hasPermission("appointment_management:update");

	const [activeFilter, setActiveFilter] = useState<boolean | undefined>(true);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null);
	const [form, setForm] = useState<RoomFormState>(EMPTY_FORM);

	const { data: nodesData } = useQuery({
		queryKey: ["hierarchyNodes", organizationId],
		queryFn: async () => {
			if (!organizationId) return { nodes: [] };
			return client.hierarchy.listNodes({ organizationId });
		},
		enabled: !!organizationId,
	});
	const branches = useMemo(
		() =>
			(nodesData?.nodes ?? []).filter(
				(n: { id: string; name: string; type: string }) => n.type === "branch",
			),
		[nodesData],
	);
	const branchById = useMemo(
		() =>
			new Map<string, string>(
				branches.map((b: { id: string; name: string }) => [b.id, b.name]),
			),
		[branches],
	);

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

	const tableData: RoomRow[] = apiData.map((r: any) => ({
		id: r.id,
		name: r.name,
		type: r.type as RoomRow["type"],
		branchId: r.branchId,
		branchName: branchById.get(r.branchId) ?? r.branchId ?? "",
		capacity: r.capacity,
		isActive: r.isActive,
		createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
		updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
	}));

	function invalidateRooms() {
		queryClient.invalidateQueries({
			queryKey: [...orpc.rooms.list.key(), { organizationId }],
		});
	}

	const createMutation = useApiMutation({
		mutationFn: (data: {
			name: string;
			type: RoomType;
			capacity: number;
			branchId: string;
		}) => client.rooms.create({ organizationId: organizationId!, ...data }),
		successMessage: "Room created successfully",
		errorMessage: (err) => err.message || "Failed to create room",
		onSuccess: () => {
			invalidateRooms();
			closeSheet();
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: ({
			id,
			data,
		}: {
			id: string;
			data: {
				name: string;
				type: RoomType;
				capacity: number;
				branchId: string;
				isActive: boolean;
			};
		}) => client.rooms.update({ organizationId: organizationId!, id, ...data }),
		successMessage: "Room updated successfully",
		errorMessage: (err) => err.message || "Failed to update room",
		onSuccess: () => {
			invalidateRooms();
			closeSheet();
		},
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- helper-based invalidation: onSuccess calls invalidateRooms() helper (defined at line 131)
	const deactivateMutation = useMutation({
		mutationFn: (id: string) =>
			client.rooms.update({
				organizationId: organizationId!,
				id,
				isActive: false,
			}),
		onSuccess: () => invalidateRooms(),
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- helper-based invalidation: onSuccess calls invalidateRooms() helper (defined at line 131)
	const reactivateMutation = useMutation({
		mutationFn: (id: string) =>
			client.rooms.update({
				organizationId: organizationId!,
				id,
				isActive: true,
			}),
		onSuccess: () => invalidateRooms(),
	});

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

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view rooms.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="font-medium text-destructive text-lg">
					Failed to load data
				</p>
				<p className="mb-4 text-muted-foreground text-sm">
					{error instanceof Error
						? error.message
						: "An unexpected error occurred"}
				</p>
				<Button variant="outline" onClick={() => refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<RoomsActionBar
				activeFilter={activeFilter}
				setActiveFilter={setActiveFilter}
				canCreate={canCreate}
				onCreate={openCreate}
			/>

			{/* Content */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{tableData.length === 0 ? (
					<div className="flex items-center justify-center min-h-96">
						<EmptyState
							title="No rooms found"
							description="Create your first room to get started."
							action={
								canCreate
									? { label: "Create Room", onClick: openCreate }
									: undefined
							}
						/>
					</div>
				) : (
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
			</div>

			<RoomFormDialog
				open={isSheetOpen}
				onOpenChange={(open) => { if (!open) closeSheet(); }}
				editingRoom={!!editingRoom}
				form={form}
				setForm={setForm}
				branches={branches}
				branchCombobox={(p) => <BranchCombobox {...p} />}
				onCancel={closeSheet}
				onSubmit={handleSubmit}
				isBusy={isBusy}
			/>
		</div>
	);
}

interface BranchNode {
	id: string;
	name: string;
	type: string;
}

function BranchCombobox({
	id,
	value,
	onChange,
	branches,
	placeholder,
}: {
	id?: string;
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
		b.name.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div className="relative" ref={containerRef}>
			<Input
				id={id}
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
