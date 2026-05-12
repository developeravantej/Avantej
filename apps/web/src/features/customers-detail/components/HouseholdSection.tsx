import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { client } from "@/utils/orpc";
import type { HouseholdProfileShape } from "../types";
import {
	AttachHouseholdDialog,
	CreateHouseholdDialog,
} from "./HouseholdDialogs";

export function HouseholdSection(props: {
	organizationId: string;
	profile: HouseholdProfileShape;
	canEdit: boolean;
}) {
	const { organizationId, profile, canEdit } = props;
	const queryClient = useQueryClient();
	const profileId = profile?.id ?? null;
	const householdId = profile?.householdId ?? null;

	const [createOpen, setCreateOpen] = useState(false);
	const [attachOpen, setAttachOpen] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const [newName, setNewName] = useState("");
	const [newNotes, setNewNotes] = useState("");
	const [makePrimary, setMakePrimary] = useState(true);

	const [pickedHouseholdId, setPickedHouseholdId] = useState("");

	// Current household + its members (only fetched when this profile is in one).
	const { data: household } = useQuery({
		queryKey: ["households", "get", organizationId, householdId],
		queryFn: () =>
			client.households.get({
				organizationId,
				householdId: householdId!,
			}),
		enabled: !!organizationId && !!householdId,
		staleTime: 60_000,
	});

	// All households in the org (for the attach picker).
	const { data: allHouseholds = [] } = useQuery({
		queryKey: ["households", "list", organizationId],
		queryFn: () => client.households.list({ organizationId }),
		enabled: !!organizationId && canEdit,
		staleTime: 60_000,
	});

	const refresh = async () => {
		setSubmitError(null);
		await queryClient.invalidateQueries({
			queryKey: ["customerDirectory", "detail", organizationId],
		});
		await queryClient.invalidateQueries({
			queryKey: ["households"],
		});
	};

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- helper-based invalidation: onSuccess invalidates households + customer queries (line 55-58)
	const createMutation = useMutation({
		mutationFn: () =>
			client.households.create({
				organizationId,
				name: newName.trim(),
				primaryContactProfileId:
					makePrimary && profileId ? profileId : null,
				notes: newNotes.trim() || null,
			}),
		onSuccess: async (created) => {
			// If we did NOT mark this customer primary, still attach them so the
			// household is non-empty for this customer's view.
			if (!makePrimary && profileId) {
				try {
					await client.households.addMember({
						organizationId,
						householdId: created.id,
						customerProfileId: profileId,
					});
				} catch (err) {
					setSubmitError(
						err instanceof Error
							? err.message
							: "Created household but failed to attach customer",
					);
				}
			}
			await refresh();
			setCreateOpen(false);
			setNewName("");
			setNewNotes("");
			setMakePrimary(true);
		},
		onError: (err: unknown) => {
			setSubmitError(
				err instanceof Error ? err.message : "Failed to create household",
			);
		},
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- helper-based invalidation: onSuccess invalidates households + customer queries
	const attachMutation = useMutation({
		mutationFn: () => {
			if (!profileId || !pickedHouseholdId) {
				throw new Error("Pick a household first.");
			}
			return client.households.addMember({
				organizationId,
				householdId: pickedHouseholdId,
				customerProfileId: profileId,
			});
		},
		onSuccess: async () => {
			await refresh();
			setAttachOpen(false);
			setPickedHouseholdId("");
		},
		onError: (err: unknown) => {
			setSubmitError(
				err instanceof Error ? err.message : "Failed to attach to household",
			);
		},
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- helper-based invalidation: onSuccess invalidates households + customer queries
	const detachMutation = useMutation({
		mutationFn: () => {
			if (!profileId) {
				throw new Error("No customer profile available.");
			}
			return client.households.removeMember({
				organizationId,
				customerProfileId: profileId,
			});
		},
		onSuccess: async () => {
			await refresh();
		},
		onError: (err: unknown) => {
			setSubmitError(
				err instanceof Error ? err.message : "Failed to remove from household",
			);
		},
	});

	const noProfile = !profileId;

	return (
		<>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between pb-3">
					<CardTitle className="text-base">Household</CardTitle>
					{canEdit && !noProfile && (
						<div className="flex gap-2">
							{householdId ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => detachMutation.mutate()}
									disabled={detachMutation.isPending}
								>
									{detachMutation.isPending ? "Removing…" : "Remove"}
								</Button>
							) : (
								<>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setSubmitError(null);
											setPickedHouseholdId("");
											setAttachOpen(true);
										}}
									>
										Attach
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setSubmitError(null);
											setNewName("");
											setNewNotes("");
											setMakePrimary(true);
											setCreateOpen(true);
										}}
									>
										Create
									</Button>
								</>
							)}
						</div>
					)}
				</CardHeader>
				<CardContent>
					{noProfile ? (
						<p className="py-2 text-muted-foreground text-sm">
							Customer profile not yet created. Save profile fields first to
							enable household linking.
						</p>
					) : !householdId ? (
						<p className="py-2 text-muted-foreground text-sm">
							Not part of a household.
						</p>
					) : !household ? (
						<p className="py-2 text-muted-foreground text-sm">
							Loading household…
						</p>
					) : (
						<div className="space-y-3 text-sm">
							<div>
								<p className="text-muted-foreground text-xs">Name</p>
								<p className="font-medium">{household.name}</p>
							</div>
							{household.notes && (
								<div>
									<p className="text-muted-foreground text-xs">Notes</p>
									<p className="text-muted-foreground">{household.notes}</p>
								</div>
							)}
							<div>
								<p className="text-muted-foreground text-xs">
									Members ({household.members.length})
								</p>
								{household.members.length === 0 ? (
									<p className="text-muted-foreground">No members yet.</p>
								) : (
									<ul className="mt-1 space-y-1">
										{household.members.map((m: { id: string; userId: string; phone?: string | null }) => {
											const isPrimary =
												household.primaryContactProfileId === m.id;
											const isThis = m.id === profileId;
											return (
												<li
													key={m.id}
													className="flex items-center justify-between rounded-md border px-3 py-2"
												>
													<span className="font-mono text-xs">
														{m.userId.slice(0, 8)}
														{m.phone ? ` · ${m.phone}` : ""}
													</span>
													<span className="flex gap-1.5">
														{isPrimary && (
															<Badge variant="default">Primary</Badge>
														)}
														{isThis && <Badge variant="outline">This customer</Badge>}
													</span>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<CreateHouseholdDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				newName={newName}
				setNewName={setNewName}
				newNotes={newNotes}
				setNewNotes={setNewNotes}
				makePrimary={makePrimary}
				setMakePrimary={setMakePrimary}
				submitError={submitError}
				onCreate={() => createMutation.mutate()}
				isPending={createMutation.isPending}
			/>

			<AttachHouseholdDialog
				open={attachOpen}
				onOpenChange={setAttachOpen}
				pickedHouseholdId={pickedHouseholdId}
				setPickedHouseholdId={setPickedHouseholdId}
				allHouseholds={allHouseholds}
				submitError={submitError}
				onAttach={() => attachMutation.mutate()}
				isPending={attachMutation.isPending}
			/>
		</>
	);
}
