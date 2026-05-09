import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/utils/orpc";
import type { HouseholdProfileShape } from "../types";

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
										{household.members.map((m) => {
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

			{/* Create dialog */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Create household</DialogTitle>
						<DialogDescription>
							Group this customer with family members under one household.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="hh-name">Name</Label>
							<Input
								id="hh-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="e.g. The Tan Family"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="hh-notes">Notes (optional)</Label>
							<Textarea
								id="hh-notes"
								value={newNotes}
								onChange={(e) => setNewNotes(e.target.value)}
								placeholder="Any context about the household."
							/>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="hh-primary"
								checked={makePrimary}
								onCheckedChange={(c) => setMakePrimary(c === true)}
							/>
							<Label htmlFor="hh-primary" className="font-normal">
								Make this customer the primary contact
							</Label>
						</div>
						{submitError && (
							<Alert variant="destructive">
								<AlertDescription>{submitError}</AlertDescription>
							</Alert>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setCreateOpen(false)}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => createMutation.mutate()}
							disabled={createMutation.isPending || !newName.trim()}
						>
							{createMutation.isPending ? "Creating…" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Attach dialog */}
			<Dialog open={attachOpen} onOpenChange={setAttachOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Attach to household</DialogTitle>
						<DialogDescription>
							Pick an existing household to add this customer to.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="hh-pick">Household</Label>
							<Select
								value={pickedHouseholdId}
								onValueChange={setPickedHouseholdId}
							>
								<SelectTrigger id="hh-pick">
									<SelectValue placeholder="Select a household" />
								</SelectTrigger>
								<SelectContent>
									{allHouseholds.length === 0 ? (
										<SelectItem value="__none__" disabled>
											No households yet
										</SelectItem>
									) : (
										allHouseholds.map((h) => (
											<SelectItem key={h.id} value={h.id}>
												{h.name}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						</div>
						{submitError && (
							<Alert variant="destructive">
								<AlertDescription>{submitError}</AlertDescription>
							</Alert>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setAttachOpen(false)}
							disabled={attachMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => attachMutation.mutate()}
							disabled={attachMutation.isPending || !pickedHouseholdId}
						>
							{attachMutation.isPending ? "Attaching…" : "Attach"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
