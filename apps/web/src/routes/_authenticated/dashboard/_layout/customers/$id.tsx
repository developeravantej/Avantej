/**
 * Customer 360 Page
 *
 * Full-page profile view for a single registered customer.
 * Provides an overview, packages with installments, payments history,
 * and appointment history all in one place.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, PauseCircle } from "lucide-react";
import { useState } from "react";
import { PackageRow } from "@/components/customers/customer-360/package-row";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";

// ─── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/$id",
)({
	component: Customer360Page,
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

function memberStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "active":
			return "default";
		case "inactive":
			return "secondary";
		default:
			return "outline";
	}
}

function appointmentStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "confirmed":
			return "default";
		case "completed":
			return "secondary";
		case "pending":
			return "outline";
		case "cancelled":
		case "no-show":
			return "destructive";
		default:
			return "outline";
	}
}

function paymentStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "succeeded":
			return "default";
		case "pending":
			return "secondary";
		case "failed":
			return "destructive";
		default:
			return "outline";
	}
}

// ─── Loading skeleton ───────────────────────────────────────────────────────────

function PageSkeleton() {
	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center gap-3">
				<Skeleton className="size-16 rounded-full" />
				<div className="space-y-2">
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
			</div>
			<div className="grid grid-cols-4 gap-4">
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-24 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-72 rounded-xl" />
		</div>
	);
}

// ─── KPI Strip ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
	label: string;
	value: string | number;
	valueClassName?: string;
}

function KpiCard({ label, value, valueClassName }: KpiCardProps) {
	return (
		<Card>
			<CardContent className="px-4 py-4">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p className={`mt-1 font-semibold text-xl tabular-nums ${valueClassName ?? ""}`}>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

// ─── Main page ──────────────────────────────────────────────────────────────────

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// === 3.1 membership freeze ===
// Owns: Pause Membership action + freeze drawer.
// Slot reservations for sibling agents (do NOT remove these comments):
//   * Agent 3.2 lead-source: insert above the freeze button in the action bar.
//   * Agent 3.6 household:   insert as a separate tab between Packages and Payments.

type FreezeFormState = {
	packageInstanceId: string;
	startDate: string;
	endDate: string;
	reason: "medical" | "travel" | "other";
	feeWaived: boolean;
	notes: string;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function FreezeMembershipDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	memberId: string;
	packages: Array<{ id: string; status: string | null; serviceName?: string | null }>;
}) {
	const { open, onOpenChange, organizationId, memberId, packages } = props;
	const queryClient = useQueryClient();
	const eligible = packages.filter((p) => p.status !== "paused");
	const [form, setForm] = useState<FreezeFormState>(() => ({
		packageInstanceId: eligible[0]?.id ?? "",
		startDate: todayIso(),
		endDate: todayIso(),
		reason: "medical",
		feeWaived: false,
		notes: "",
	}));
	const [submitError, setSubmitError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			client.memberships.freeze({
				organizationId,
				packageInstanceId: form.packageInstanceId,
				memberId,
				startDate: new Date(form.startDate),
				endDate: new Date(form.endDate),
				reason: form.reason,
				feeWaived: form.feeWaived,
				notes: form.notes || undefined,
			}),
		onSuccess: async () => {
			setSubmitError(null);
			await queryClient.invalidateQueries({
				queryKey: ["customerDirectory", "detail", organizationId],
			});
			onOpenChange(false);
		},
		onError: (err: unknown) => {
			setSubmitError(err instanceof Error ? err.message : "Failed to freeze membership");
		},
	});

	const canSubmit =
		form.packageInstanceId &&
		form.startDate &&
		form.endDate &&
		new Date(form.endDate).getTime() > new Date(form.startDate).getTime() &&
		!mutation.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pause Membership</DialogTitle>
					<DialogDescription>
						Freeze a package for medical leave, travel, or other reasons. The package
						auto-resumes on the end date. Audit-logged.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="freeze-pkg">Package</Label>
						<Select
							value={form.packageInstanceId}
							onValueChange={(v) => setForm((f) => ({ ...f, packageInstanceId: v }))}
						>
							<SelectTrigger id="freeze-pkg">
								<SelectValue placeholder="Select a package" />
							</SelectTrigger>
							<SelectContent>
								{eligible.length === 0 ? (
									<SelectItem value="" disabled>
										No active packages
									</SelectItem>
								) : (
									eligible.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.serviceName ?? p.id.slice(0, 8)} · {p.status ?? "—"}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="freeze-start">Start date</Label>
							<Input
								id="freeze-start"
								type="date"
								value={form.startDate}
								onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="freeze-end">End date</Label>
							<Input
								id="freeze-end"
								type="date"
								value={form.endDate}
								onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="freeze-reason">Reason</Label>
						<Select
							value={form.reason}
							onValueChange={(v) =>
								setForm((f) => ({ ...f, reason: v as FreezeFormState["reason"] }))
							}
						>
							<SelectTrigger id="freeze-reason">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="medical">Medical</SelectItem>
								<SelectItem value="travel">Travel</SelectItem>
								<SelectItem value="other">Other</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<label className="flex items-center gap-2 text-sm">
						<Checkbox
							checked={form.feeWaived}
							onCheckedChange={(v) =>
								setForm((f) => ({ ...f, feeWaived: v === true }))
							}
						/>
						<span>Waive freeze fee</span>
					</label>

					<div className="space-y-1.5">
						<Label htmlFor="freeze-notes">Notes (optional)</Label>
						<Textarea
							id="freeze-notes"
							rows={2}
							value={form.notes}
							onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
							placeholder="Internal notes for audit trail"
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
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={!canSubmit}
					>
						{mutation.isPending ? "Pausing…" : "Pause membership"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
// === /3.1 ===

// === 3.2 lead source ===
// Owns: customer-360 lead-source / referrer / campaign attribution panel.
// Slot reservations for sibling agents (do NOT remove these comments):
//   * Agent 3.6 household: insert as a separate tab between Packages and Payments
//     (see 3.1's slot map above). This 3.2 panel sits between the header and KPIs.

type LeadSourceProfileShape = {
	leadSourceId?: string | null;
	referrerMemberId?: string | null;
	campaignId?: string | null;
} | null;

function LeadSourceSection(props: {
	organizationId: string;
	targetUserId: string;
	profile: LeadSourceProfileShape;
	canEdit: boolean;
}) {
	const { organizationId, targetUserId, profile, canEdit } = props;
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
		? (leadSources.find((s) => s.id === profile.leadSourceId)?.name ?? "—")
		: null;

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
							{profile?.leadSourceId || profile?.referrerMemberId || profile?.campaignId
								? "Edit"
								: "Add"}
						</Button>
					)}
				</CardHeader>
				<CardContent>
					{!profile?.leadSourceId &&
					!profile?.referrerMemberId &&
					!profile?.campaignId ? (
						<p className="py-2 text-muted-foreground text-sm">
							No attribution recorded.
						</p>
					) : (
						<div className="grid gap-2 text-sm sm:grid-cols-3">
							<div>
								<p className="text-muted-foreground text-xs">Source</p>
								<p className="font-medium">{sourceName ?? "—"}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Referrer</p>
								<p className="font-medium">
									{profile?.referrerMemberId
										? profile.referrerMemberId.slice(0, 8)
										: "—"}
								</p>
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
										leadSources.map((s) => (
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
// === /3.2 ===

// === 3.6 household ===
// Owns: customer-360 household membership panel.
// Shows the customer's household (if any), its members, plus quick actions to
// create a new household, attach this customer to an existing one, or detach.
//
// Slot reservations: this section sits BELOW the 3.2 lead-source panel and
// ABOVE the KPI strip. Do not touch the 3.1 freeze region or the 3.2 region.

type HouseholdProfileShape = {
	id?: string | null;
	householdId?: string | null;
} | null;

function HouseholdSection(props: {
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
// === /3.6 ===

function Customer360Page() {
	const { id } = Route.useParams();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	// === 3.1 membership freeze === permission flag, used by header action.
	const canFreeze = hasPermission("customer_management:update");
	const [freezeOpen, setFreezeOpen] = useState(false);
	// === /3.1 ===
	const idIsValid = UUID_RE.test(id);

	// ── Primary query ──────────────────────────────────────────────────────
	const {
		data: detail,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["customerDirectory", "detail", organizationId, id],
		queryFn: () =>
			client.customerDirectory.getById({
				organizationId: organizationId!,
				memberId: id,
			}),
		enabled: !!organizationId && canRead && idIsValid,
		staleTime: 60_000,
		retry: (failureCount, err) => {
			// Don't retry on NOT_FOUND / FORBIDDEN
			if (
				err instanceof Error &&
				(err.message.includes("NOT_FOUND") ||
					err.message.includes("FORBIDDEN") ||
					err.message.includes("404") ||
					err.message.includes("403"))
			) {
				return false;
			}
			return failureCount < 2;
		},
	});

	// ── Upcoming appointments (overview tab) ───────────────────────────────
	const { data: upcomingAppts } = useQuery({
		queryKey: [
			"appointments",
			"upcoming",
			organizationId,
			detail?.member.userId,
		],
		queryFn: () =>
			client.appointments.list({
				organizationId: organizationId!,
				clientUserId: detail!.member.userId,
				status: "confirmed",
				limit: 3,
			}),
		enabled: !!organizationId && !!detail?.member.userId,
		staleTime: 60_000,
	});

	// ── All appointments (appointments tab) ────────────────────────────────
	const { data: allAppts } = useQuery({
		queryKey: [
			"appointments",
			"all",
			organizationId,
			detail?.member.userId,
		],
		queryFn: () =>
			client.appointments.list({
				organizationId: organizationId!,
				clientUserId: detail!.member.userId,
				limit: 50,
			}),
		enabled: !!organizationId && !!detail?.member.userId,
		staleTime: 60_000,
	});

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center p-6 text-muted-foreground">
				Select an organization to view this customer.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center p-6">
				<Alert variant="destructive" className="max-w-md">
					<AlertDescription>
						You don't have permission to view customer profiles.
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	if (!idIsValid) {
		return (
			<div className="flex min-h-96 flex-col items-center justify-center gap-4 p-6">
				<Alert variant="destructive" className="max-w-md">
					<AlertDescription>
						Invalid customer link. This URL doesn't point to a valid customer.
					</AlertDescription>
				</Alert>
				<Button variant="outline" asChild>
					<Link to="/dashboard/customers/view" search={{ tab: "registered" }}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Customers
					</Link>
				</Button>
			</div>
		);
	}

	if (isLoading) return <PageSkeleton />;

	if (error || !detail) {
		const isNotFound =
			error instanceof Error &&
			(error.message.includes("NOT_FOUND") ||
				error.message.includes("404"));
		return (
			<div className="flex min-h-96 flex-col items-center justify-center gap-4 p-6">
				<Alert variant="destructive" className="max-w-md">
					<AlertDescription>
						{isNotFound
							? "Customer not found. They may have been removed."
							: "Failed to load customer profile. Please try again."}
					</AlertDescription>
				</Alert>
				<Button variant="outline" asChild>
					<Link to="/dashboard/customers/view" search={{ tab: "registered" }}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Customers
					</Link>
				</Button>
			</div>
		);
	}

	// ── Derived values ─────────────────────────────────────────────────────

	const { member, user, profile, packageInstances, recentPayments, appointmentCount, outstandingBalanceCents } = detail;
	const activePackageCount = packageInstances.filter((p) => p.status === "active").length;
	const initials = getInitials(user.name ?? "?");

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 p-6">
			{/* Back navigation */}
			<Button variant="ghost" size="sm" asChild className="-ml-1">
				<Link to="/dashboard/customers/view" search={{ tab: "registered" }}>
					<ArrowLeft className="mr-1 h-4 w-4" />
					Customers
				</Link>
			</Button>

			{/* ── Customer Header ─────────────────────────────────────────── */}
			<div className="flex items-start gap-4">
				<span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xl">
					{initials}
				</span>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-bold text-2xl leading-tight">{user.name}</h1>
						<Badge variant={memberStatusVariant(member.status ?? "")}>
							{member.status ?? "unknown"}
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">{user.email}</p>
					{profile?.phone && (
						<p className="text-muted-foreground text-sm">
							{profile.phone}
						</p>
					)}
					<p className="text-muted-foreground text-xs">
						Joined {formatDate(member.joinedAt)}
					</p>
				</div>
				{/* === 3.1 membership freeze === */}
				<div className="flex shrink-0 items-start gap-2">
					{canFreeze && packageInstances.some((p) => p.status !== "paused") && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setFreezeOpen(true)}
						>
							<PauseCircle className="mr-1.5 h-4 w-4" />
							Pause Membership
						</Button>
					)}
				</div>
				{/* === /3.1 === */}
			</div>

			{/* === 3.1 membership freeze === dialog mount */}
			{canFreeze && (
				<FreezeMembershipDialog
					open={freezeOpen}
					onOpenChange={setFreezeOpen}
					organizationId={organizationId}
					memberId={member.id}
					packages={packageInstances.map((p) => ({
						id: p.id,
						status: p.status,
						serviceName: (p as { serviceName?: string | null }).serviceName ?? null,
					}))}
				/>
			)}
			{/* === /3.1 === */}

			{/* === 3.2 lead source === */}
			<LeadSourceSection
				organizationId={organizationId}
				targetUserId={member.userId}
				profile={profile ?? null}
				canEdit={canFreeze}
			/>
			{/* === /3.2 === */}

			{/* === 3.6 household === */}
			<HouseholdSection
				organizationId={organizationId}
				profile={profile ?? null}
				canEdit={canFreeze}
			/>
			{/* === /3.6 === */}

			{/* ── KPI Strip ──────────────────────────────────────────────── */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<KpiCard label="LTV" value="N/A" valueClassName="text-muted-foreground" />
				<KpiCard
					label="Outstanding"
					value={formatPrice(outstandingBalanceCents, "MYR")}
					valueClassName={outstandingBalanceCents > 0 ? "text-red-600" : ""}
				/>
				<KpiCard label="Active Packages" value={activePackageCount} />
				<KpiCard label="Appointments" value={appointmentCount} />
			</div>

			{/* ── Tabs ───────────────────────────────────────────────────── */}
			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="packages">
						Packages{" "}
						{packageInstances.length > 0 && (
							<span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
								{packageInstances.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="payments">Payments</TabsTrigger>
					<TabsTrigger value="appointments">Appointments</TabsTrigger>
				</TabsList>

				{/* ── Overview tab ───────────────────────────────────────── */}
				<TabsContent value="overview" className="mt-4 space-y-4">
					{/* Recent Payments */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Recent Payments</CardTitle>
						</CardHeader>
						<CardContent>
							{recentPayments.length === 0 ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No payments on record.
								</p>
							) : (
								<div className="space-y-2">
									{recentPayments.slice(0, 5).map((payment) => (
										<div
											key={payment.id}
											className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
										>
											<div className="flex flex-col gap-0.5">
												<span className="font-medium tabular-nums">
													{formatPrice(payment.totalAmount ?? 0, "MYR")}
												</span>
												<span className="text-muted-foreground text-xs">
													{formatDate(payment.createdAt)}
													{payment.paymentMethod
														? ` · ${payment.paymentMethod}`
														: ""}
												</span>
											</div>
											<Badge
												variant={paymentStatusVariant(payment.status ?? "")}
											>
												{payment.status ?? "unknown"}
											</Badge>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Upcoming Appointments */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Upcoming Appointments</CardTitle>
						</CardHeader>
						<CardContent>
							{!upcomingAppts || upcomingAppts.length === 0 ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No upcoming appointments.
								</p>
							) : (
								<div className="space-y-2">
									{upcomingAppts.map((appt) => (
										<div
											key={appt.id}
											className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
										>
											<div className="flex flex-col gap-0.5">
												<span className="font-medium">
													{(appt as { serviceName?: string | null }).serviceName ?? "—"}
												</span>
												<span className="text-muted-foreground text-xs">
													{formatDateTime(appt.startTime)}
												</span>
											</div>
											<Badge variant={appointmentStatusVariant(appt.status ?? "")}>
												{appt.status ?? "unknown"}
											</Badge>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── Packages tab ───────────────────────────────────────── */}
				<TabsContent value="packages" className="mt-4">
					{packageInstances.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center text-muted-foreground text-sm">
								No packages found.
							</CardContent>
						</Card>
					) : (
						<div className="space-y-3">
							{packageInstances.map((pkg) => (
								<PackageRow
									key={pkg.id}
									pkg={pkg as Parameters<typeof PackageRow>[0]["pkg"]}
									organizationId={organizationId}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* ── Payments tab ───────────────────────────────────────── */}
				<TabsContent value="payments" className="mt-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Payment History</CardTitle>
						</CardHeader>
						<CardContent>
							{recentPayments.length === 0 ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No payment records found.
								</p>
							) : (
								<div className="overflow-hidden rounded-md border">
									<table className="w-full text-sm">
										<thead className="bg-muted/50">
											<tr>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Date
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Amount
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Method
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Status
												</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{recentPayments.map((payment) => (
												<tr key={payment.id}>
													<td className="px-3 py-2 text-muted-foreground tabular-nums">
														{formatDate(payment.createdAt)}
													</td>
													<td className="px-3 py-2 font-medium tabular-nums">
														{formatPrice(payment.totalAmount ?? 0, "MYR")}
													</td>
													<td className="px-3 py-2 text-muted-foreground">
														{payment.paymentMethod ?? "—"}
													</td>
													<td className="px-3 py-2">
														<Badge
															variant={paymentStatusVariant(payment.status ?? "")}
															className="text-xs"
														>
															{payment.status ?? "unknown"}
														</Badge>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── Appointments tab ─────────────────────────────────────── */}
				<TabsContent value="appointments" className="mt-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Appointment History</CardTitle>
						</CardHeader>
						<CardContent>
							{!allAppts || allAppts.length === 0 ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No appointments found.
								</p>
							) : (
								<div className="overflow-hidden rounded-md border">
									<table className="w-full text-sm">
										<thead className="bg-muted/50">
											<tr>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Service
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Date
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Time
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
													Status
												</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{allAppts.map((appt) => {
												const start = appt.startTime
													? appt.startTime instanceof Date
														? appt.startTime
														: new Date(appt.startTime)
													: null;
												return (
													<tr key={appt.id}>
														<td className="px-3 py-2 font-medium">
															{(appt as { serviceName?: string | null }).serviceName ?? "—"}
														</td>
														<td className="px-3 py-2 text-muted-foreground tabular-nums">
															{start ? start.toISOString().slice(0, 10) : "—"}
														</td>
														<td className="px-3 py-2 text-muted-foreground tabular-nums">
															{start ? start.toTimeString().slice(0, 5) : "—"}
														</td>
														<td className="px-3 py-2">
															<Badge
																variant={appointmentStatusVariant(appt.status ?? "")}
																className="text-xs"
															>
																{appt.status ?? "unknown"}
															</Badge>
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
