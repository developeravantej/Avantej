import { useQuery } from "@tanstack/react-query";
import { orpc, client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";

// ─── Raw API item types ────────────────────────────────────────────────────────

export type MemberListItem = {
	id: string;
	userId: string;
	name?: string | null;
	email?: string | null;
	role?: string | null;
	trainerTierId?: string | null;
};

export type ServiceListItem = {
	id: string;
	name: string;
	duration: number;
	price?: number | null;
	schedulingType?: string | null;
	categoryId?: string | null;
};

export type RoomListItem = {
	id: string;
	name: string;
	capacity?: number | null;
	roomType?: string | null;
};

// ─── Mapped UI types ──────────────────────────────────────────────────────────

export type ClientRow = {
	id: string;
	userId: string;
	name: string;
	email: string;
	phone: string;
	creditPoints: number;
};

export type ServiceRow = {
	id: string;
	name: string;
	durationMinutes: number;
	creditCost: number;
	schedulingType: string;
};

export type RoomRow = {
	id: string;
	name: string;
	capacity?: number | null;
	type: string;
};

export type TrainerRow = {
	id: string;
	name: string;
	role: string;
	department: string;
};

// ─── Result type ──────────────────────────────────────────────────────────────

export type UseAppointmentFormDataResult = {
	clients: ClientRow[];
	services: ServiceRow[];
	/** Raw service items — exposes categoryId for commission lookups */
	rawServices: ServiceListItem[];
	rooms: RoomRow[];
	trainers: TrainerRow[];
	/** Raw member items — exposes userId for package instance lookups */
	rawClientMembers: MemberListItem[];
	isLoading: boolean;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppointmentFormData(): UseAppointmentFormDataResult {
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const { data: clientMembers = [], isLoading: isLoadingClients } = useQuery({
		...orpc.members.list.queryOptions({ input: { organizationId, role: "client", status: "active" } }),
		enabled: !!organizationId,
	});

	const { data: servicesData = [], isLoading: isLoadingServices } = useQuery({
		...orpc.services.list.queryOptions({ input: { organizationId, isActive: true } }),
		enabled: !!organizationId,
	});

	const { data: roomsData = [], isLoading: isLoadingRooms } = useQuery({
		queryKey: ["rooms", organizationId],
		queryFn: () => client.rooms.list({ organizationId }),
		enabled: !!organizationId,
	});

	const { data: trainersData = [], isLoading: isLoadingTrainers } = useQuery({
		queryKey: ["members", organizationId, "trainer"],
		queryFn: () => client.members.list({ organizationId, role: "trainer", status: "active" }),
		enabled: !!organizationId,
	});

	const rawClientMembers = clientMembers as MemberListItem[];
	const rawServices = servicesData as ServiceListItem[];

	const clients: ClientRow[] = rawClientMembers.map((m) => ({
		id: m.id,
		userId: m.userId,
		name: m.name ?? m.email ?? m.userId,
		email: m.email ?? "",
		phone: "",
		creditPoints: 0,
	}));

	const services: ServiceRow[] = rawServices.map((s) => ({
		id: s.id,
		name: s.name,
		durationMinutes: Math.round(s.duration / 60), // seconds → minutes
		creditCost: s.price ?? 0, // cents; TODO: confirm display unit with team
		schedulingType: s.schedulingType ?? "appointment",
	}));

	const rooms: RoomRow[] = (roomsData as RoomListItem[]).map((r) => ({
		id: r.id,
		name: r.name,
		capacity: r.capacity,
		type: r.roomType ?? "",
	}));

	const trainers: TrainerRow[] = (trainersData as MemberListItem[]).map((m) => ({
		id: m.id,
		name: m.name ?? m.email ?? m.userId,
		role: m.role ?? "",
		department: "",
	}));

	const isLoading =
		isLoadingClients || isLoadingServices || isLoadingRooms || isLoadingTrainers;

	return { clients, services, rawServices, rooms, trainers, rawClientMembers, isLoading };
}
