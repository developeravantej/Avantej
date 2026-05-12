import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useTrainerData } from "@/hooks/useTrainerData";
import { useTrainerActions } from "@/hooks/useTrainerActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { Users, Plus, Search } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { TrainerCard, type TrainerRow } from "@/components/trainers/TrainerCard";
import { TrainerDetailDialog } from "@/components/trainers/TrainerDetailDialog";
import {
	TrainerFormDialog,
	type FormState,
} from "@/components/trainers/TrainerFormDialog";

export function TrainersListPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const hierarchyNodes = currentOrg?.hierarchy?.nodes ?? [];

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingTrainer, setEditingTrainer] = useState<TrainerRow | null>(null);
	const [selectedTrainer, setSelectedTrainer] = useState<TrainerRow | null>(
		null,
	);

	const { trainers, trainerTiers, isLoading, isError, refetch } =
		useTrainerData(organizationId, debouncedSearch);

	const {
		createTrainer,
		updateProfile,
		suspend,
		reactivate,
		assignTier,
		isAnyPending,
	} = useTrainerActions({
		organizationId: organizationId ?? "",
		onCreateSuccess: () => setSheetOpen(false),
		onUpdateSuccess: () => setSheetOpen(false),
	});

	function handleFormSubmit(form: FormState, memberId: string | null) {
		if (memberId) {
			updateProfile.mutate({ memberId, values: form });
		} else {
			createTrainer.mutate(form);
		}
	}

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage trainers.
			</div>
		);
	}

	if (isLoading) return <PageLoader />;

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Couldn't load trainers"
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-4">
			{/* Action bar */}
			<div className="flex items-center justify-between gap-4">
				<div className="relative w-72">
					<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search name, email, or specialization..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Button
					onClick={() => {
						setEditingTrainer(null);
						setSheetOpen(true);
					}}
					disabled={isAnyPending}
				>
					<Plus className="h-4 w-4 mr-2" />
					Add Trainer
				</Button>
			</div>

			{trainers.length === 0 ? (
				<EmptyState
					icon={Users}
					title="No trainers found"
					description={
						debouncedSearch
							? "No trainers match your search. Try a different query."
							: "Add your first trainer to get started."
					}
					action={
						!debouncedSearch
							? {
									label: "Add Trainer",
									onClick: () => {
										setEditingTrainer(null);
										setSheetOpen(true);
									},
								}
							: undefined
					}
					context={debouncedSearch ? "search" : "empty"}
				/>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{trainers.map((trainer) => (
						<TrainerCard
							key={trainer.id}
							trainer={trainer}
							onSelect={setSelectedTrainer}
							trainerTiers={trainerTiers}
							onAssignTier={(memberId, tierId) =>
								assignTier.mutate({ memberId, tierId })
							}
							isTierMutating={assignTier.isPending}
						/>
					))}
				</div>
			)}

			<TrainerDetailDialog
				trainer={selectedTrainer}
				onClose={() => setSelectedTrainer(null)}
				onEdit={(trainer) => {
					setEditingTrainer(trainer);
					setSheetOpen(true);
				}}
				onSuspend={(id) => suspend.mutate(id)}
				onReactivate={(id) => reactivate.mutate(id)}
				isMutating={isAnyPending}
			/>

			{sheetOpen && (
				<TrainerFormDialog
					key={editingTrainer?.id ?? "create"}
					open={sheetOpen}
					onClose={() => setSheetOpen(false)}
					trainer={editingTrainer}
					organizationId={organizationId}
					hierarchyNodes={hierarchyNodes}
					onSubmit={handleFormSubmit}
					isMutating={isAnyPending}
				/>
			)}
		</div>
	);
}
