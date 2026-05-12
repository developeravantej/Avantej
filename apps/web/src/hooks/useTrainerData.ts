import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import type { TrainerRow, TrainerTier } from "@/components/trainers/TrainerCard";

type UseTrainerDataResult = {
	trainers: TrainerRow[];
	trainerTiers: TrainerTier[];
	isLoading: boolean;
	isError: boolean;
	refetch: () => void;
};

export function useTrainerData(
	organizationId: string | null,
	debouncedSearch: string,
): UseTrainerDataResult {
	type MemberListItem = {
		id: string;
		userId: string;
		role: string;
		hierarchyScopeId: string;
		status: string;
		joinedAt: Date | string | null;
		name: string;
		email: string;
		trainerTierId?: string | null;
	};

	const {
		data: membersData = [] as MemberListItem[],
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["trainers", organizationId],
		queryFn: async () => {
			if (!organizationId) return [] as MemberListItem[];
			return client.members.list({ organizationId, role: "trainer" });
		},
		enabled: !!organizationId,
	});

	const { data: profilesMap = {} } = useQuery({
		queryKey: ["trainerProfiles", organizationId, membersData.map((m: MemberListItem) => m.id)],
		queryFn: async () => {
			if (!organizationId || membersData.length === 0) return {};
			const results = await Promise.allSettled(
				membersData.map((m: MemberListItem) =>
					client.memberProfiles.get({ organizationId, memberId: m.id }),
				),
			);
			const map: Record<string, {
				displayName?: string | null;
				specialization?: string | null;
				phoneNumber?: string | null;
				bio?: string | null;
				certifications?: string[] | null;
			}> = {};
			results.forEach((result, i) => {
				if (result.status === "fulfilled" && result.value) {
					map[membersData[i].id] = result.value;
				}
			});
			return map;
		},
		enabled: !!organizationId && membersData.length > 0,
	});

	const { data: trainerTiers = [] } = useQuery({
		queryKey: ["trainerTiers", organizationId, "active"],
		queryFn: () =>
			client.trainerTiers.list({ organizationId: organizationId!, includeInactive: false }),
		enabled: !!organizationId,
	});

	const trainers: TrainerRow[] = membersData
		.map((m: MemberListItem) => {
			const profile = profilesMap[m.id];
			return {
				id: m.id,
				userId: m.userId,
				hierarchyScopeId: m.hierarchyScopeId,
				status: m.status,
				joinedAt: m.joinedAt,
				name: m.name,
				email: m.email,
				trainerTierId: m.trainerTierId ?? null,
				displayName: profile?.displayName ?? null,
				specialization: profile?.specialization ?? null,
				phoneNumber: profile?.phoneNumber ?? null,
				bio: profile?.bio ?? null,
				certifications: profile?.certifications ?? null,
			};
		})
		.filter((row: TrainerRow) => {
			if (!debouncedSearch) return true;
			const q = debouncedSearch.toLowerCase();
			return (
				row.name.toLowerCase().includes(q) ||
				row.email.toLowerCase().includes(q) ||
				(row.displayName?.toLowerCase().includes(q) ?? false) ||
				(row.specialization?.toLowerCase().includes(q) ?? false)
			);
		});

	return { trainers, trainerTiers, isLoading, isError, refetch };
}
