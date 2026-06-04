import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { client } from "@/utils/orpc";
import type {
	AttributedMemberShape,
	LeadSourceProfileShape,
} from "../types";

export function LeadSourceSection(props: {
	organizationId: string;
	targetUserId: string;
	profile: LeadSourceProfileShape;
	primaryStaffMember?: AttributedMemberShape;
	referrerMember?: AttributedMemberShape;
	canEdit: boolean;
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}) {
	const {
		organizationId,
		targetUserId,
		profile,
		primaryStaffMember,
		referrerMember,
		canEdit,
	} = props;
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const [leadSourceId, setLeadSourceId] = useState<string>(
		profile?.leadSourceId ?? "",
	);
	const [referrerMemberId, setReferrerMemberId] = useState<string>(
		profile?.referrerMemberId ?? "",
	);
	const [campaignId, setCampaignId] = useState<string>(profile?.campaignId ?? "");

	const { data: leadSources = [] } = useQuery({
		queryKey: ["leadSources", organizationId],
		queryFn: () =>
			client.customerProfiles.listLeadSources({ organizationId }),
		enabled: !!organizationId,
		staleTime: 5 * 60_000,
	});

	const sourceName = profile?.leadSourceId
		? (leadSources.find((s: { id: string; name: string }) => s.id === profile.leadSourceId)?.name ?? "—")
		: null;

	const hasAttribution =
		!!profile?.leadSourceId ||
		!!profile?.referrerMemberId ||
		!!profile?.campaignId ||
		!!primaryStaffMember ||
		!!profile?.leadAcquisitionType;

	const mutation = useMutation({
		mutationFn: () =>
			client.customerProfiles.upsertForCustomer({
				organizationId,
				targetUserId,
				leadSourceId: leadSourceId || null,
				referrerMemberId: referrerMemberId || null,
				campaignId: campaignId.trim() || null,
			}),
		onSuccess: async () => {
			setSubmitError(null);
			await queryClient.invalidateQueries({
				queryKey: ["customerDirectory", "detail", organizationId],
			});
			setOpen(false);
		},
		onError: (err: unknown) => {
			setSubmitError(
				err instanceof Error ? err.message : "Failed to save lead source",
			);
		},
	});

	const openDialog = () => {
		setLeadSourceId(profile?.leadSourceId ?? "");
		setReferrerMemberId(profile?.referrerMemberId ?? "");
		setCampaignId(profile?.campaignId ?? "");
		setSubmitError(null);
		setOpen(true);
	};

	return (
		<>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between pb-3">
					<CardTitle className="text-base">Lead Source</CardTitle>
					{canEdit && (
						<Button variant="outline" size="sm" onClick={openDialog}>
							{hasAttribution ? "Edit" : "Add"}
						</Button>
					)}
				</CardHeader>
				<CardContent>
					{!hasAttribution ? (
						<p className="py-2 text-muted-foreground text-sm">
							No attribution recorded.
						</p>
					) : (
						<div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<p className="text-muted-foreground text-xs">Primary staff</p>
								<p className="font-medium">{primaryStaffMember?.name ?? "—"}</p>
								{primaryStaffMember && (
									<p className="text-muted-foreground text-xs">
										Lead commission slot 0
									</p>
								)}
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Source</p>
								<p className="font-medium">
									{sourceName ?? profile?.leadAcquisitionType ?? "—"}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Referrer</p>
								<p className="font-medium">{referrerMember?.name ?? "—"}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Campaign</p>
								<p className="font-medium">{profile?.campaignId ?? "—"}</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Lead Source</DialogTitle>
						<DialogDescription>
							Record where this customer came from for attribution reporting.
							Primary staff is synced from GHL and drives commission slot 0.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="ls-source">Source</Label>
							<Select value={leadSourceId} onValueChange={setLeadSourceId}>
								<SelectTrigger id="ls-source">
									<SelectValue placeholder="Select a source" />
								</SelectTrigger>
								<SelectContent>
									{leadSources.length === 0 ? (
										<SelectItem value="__none__" disabled>
											No sources configured
										</SelectItem>
									) : (
										leadSources.map((s: { id: string; name: string; category?: string | null }) => (
											<SelectItem key={s.id} value={s.id}>
												{s.name}
												{s.category ? ` · ${s.category}` : ""}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="ls-referrer">Referrer member ID (optional)</Label>
							<Input
								id="ls-referrer"
								value={referrerMemberId}
								onChange={(e) => setReferrerMemberId(e.target.value)}
								placeholder="UUID of referring member"
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="ls-campaign">Campaign tag (optional)</Label>
							<Input
								id="ls-campaign"
								value={campaignId}
								onChange={(e) => setCampaignId(e.target.value)}
								placeholder="e.g. spring-2026"
							/>
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
							onClick={() => setOpen(false)}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => mutation.mutate()}
							disabled={mutation.isPending}
						>
							{mutation.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
