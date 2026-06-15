import { client, orpc } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { FormState } from "@/components/trainers/TrainerFormDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type Options = {
	organizationId: string;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTrainerActions({
	organizationId,
	onCreateSuccess,
	onUpdateSuccess,
}: Options) {
	// The trainer list is driven by orpc.members.list (role: "trainer"); invalidate
	// that exact query key, not the legacy ["trainers", …] key which never matched.
	const invalidateTrainers = [
		orpc.members.list.key(),
		["trainerProfiles", organizationId],
	];

	const createTrainer = useApiMutation<unknown, FormState>({
		mutationFn: async (values) => {
			// Step 1: create member with role "trainer"
			const result = await client.members.create({
				organizationId,
				email: values.email,
				role: "trainer",
				hierarchyScopeId: values.hierarchyScopeId,
			});
			// Step 2: upsert profile fields
			const memberId = result.member.id;
			const certs = values.certifications
				? values.certifications
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean)
				: undefined;
			await client.memberProfiles.upsert({
				organizationId,
				memberId,
				displayName: values.displayName || undefined,
				bio: values.bio || undefined,
				specialization: values.specialization || undefined,
				phoneNumber: values.phoneNumber || undefined,
				certifications: certs && certs.length > 0 ? certs : undefined,
			});
			return result;
		},
		successMessage: "Trainer added successfully.",
		invalidate: invalidateTrainers,
		onSuccess: () => {
			onCreateSuccess?.();
		},
	});

	const updateProfile = useApiMutation<
		unknown,
		{ memberId: string; values: FormState }
	>({
		mutationFn: async ({ memberId, values }) => {
			const certs = values.certifications
				? values.certifications
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean)
				: undefined;
			return client.memberProfiles.upsert({
				organizationId,
				memberId,
				displayName: values.displayName || undefined,
				bio: values.bio || undefined,
				specialization: values.specialization || undefined,
				phoneNumber: values.phoneNumber || undefined,
				certifications: certs && certs.length > 0 ? certs : undefined,
			});
		},
		successMessage: "Trainer profile updated.",
		// trainerProfiles is a hand-rolled query (client.memberProfiles.get fan-out in
		// useTrainerData) with no oRPC-generated key — the string prefix matches it.
		// Also refresh the orpc.members.list-driven trainer roster (profile fields shown there).
		invalidate: [orpc.members.list.key(), ["trainerProfiles", organizationId]],
		onSuccess: () => {
			onUpdateSuccess?.();
		},
	});

	const suspend = useApiMutation<unknown, string>({
		mutationFn: (memberId) =>
			client.members.suspend({ organizationId, memberId }),
		successMessage: "Trainer suspended.",
		invalidate: [orpc.members.list.key()],
	});

	const reactivate = useApiMutation<unknown, string>({
		mutationFn: (memberId) =>
			client.members.reactivate({ organizationId, memberId }),
		successMessage: "Trainer reactivated.",
		invalidate: [orpc.members.list.key()],
	});

	const assignTier = useApiMutation<
		unknown,
		{ memberId: string; tierId: string | null }
	>({
		mutationFn: ({ memberId, tierId }) =>
			client.trainerTiers.assignToMember({ organizationId, memberId, tierId }),
		successMessage: "Tier assigned",
		invalidate: [orpc.members.list.key()],
	});

	const isAnyPending =
		createTrainer.isPending ||
		updateProfile.isPending ||
		suspend.isPending ||
		reactivate.isPending ||
		assignTier.isPending;

	return {
		createTrainer,
		updateProfile,
		suspend,
		reactivate,
		assignTier,
		isAnyPending,
	};
}
