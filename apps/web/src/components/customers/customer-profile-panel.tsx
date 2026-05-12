/**
 * Customer Profile Panel
 *
 * Reusable inline editable customer profile, used by:
 *  - the dedicated route /dashboard/customers/$id
 *  - the v2 customers split-pane view
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PackageRow } from "@/components/customers/customer-360/package-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Gender = "male" | "female" | "other" | "prefer_not_to_say";

type ProfileFormState = {
	phone: string;
	dateOfBirth: string;
	gender: Gender | "";
	address: string;
	emergencyContactName: string;
	emergencyContactPhone: string;
	medicalNotes: string;
	fitnessGoals: string;
	notes: string;
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
	phone: "",
	dateOfBirth: "",
	gender: "",
	address: "",
	emergencyContactName: "",
	emergencyContactPhone: "",
	medicalNotes: "",
	fitnessGoals: "",
	notes: "",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toDateInputValue(value: string | Date | null | undefined): string {
	if (!value) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toISOString().slice(0, 10);
}

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
				{[0, 1, 2, 3].map((n) => (
					<Skeleton key={`skel-${n}`} className="h-24 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-72 rounded-xl" />
		</div>
	);
}

interface KpiCardProps {
	label: string;
	value: string | number;
	valueClassName?: string;
}

function KpiCard({ label, value, valueClassName }: KpiCardProps) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p
					className={`mt-1 font-semibold text-xl tabular-nums ${valueClassName ?? ""}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CustomerProfilePanelProps {
	memberId: string;
	/** Show a "Back to Customers" link above the header. Default true. */
	showBackLink?: boolean;
	/** Fired after a successful soft-delete so the parent can clear selection. */
	onDeleted?: () => void;
}

export function CustomerProfilePanel({
	memberId,
	showBackLink = true,
	onDeleted,
}: CustomerProfilePanelProps) {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	const idIsValid = UUID_RE.test(memberId);

	const [profileForm, setProfileForm] =
		useState<ProfileFormState>(EMPTY_PROFILE_FORM);
	const [formDirty, setFormDirty] = useState(false);
	const [confirmAction, setConfirmAction] = useState<"delete" | "restore" | null>(
		null,
	);

	const {
		data: detail,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["customerDirectory", "detail", organizationId, memberId],
		queryFn: () =>
			client.customerDirectory.getById({
				organizationId: organizationId!,
				memberId,
			}),
		enabled: !!organizationId && canRead && idIsValid,
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		retry: (failureCount, err) => {
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

	useEffect(() => {
		if (!detail) return;
		const profile = detail.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: (profile?.gender as Gender) ?? "",
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		// Re-runs whenever detail loads or refetches so the form reflects
		// what's actually in the DB (was [memberId]-only, which left form
		// empty on initial async load and after save invalidation).
	}, [detail, memberId]);

	const handleGhlToast = (
		ghlSync: { status?: string; reason?: string; error?: string } | undefined,
		baseMessage: string,
	) => {
		const status = ghlSync?.status;
		if (!status || status === "synced") {
			toast.success(baseMessage);
		} else if (status === "skipped") {
			toast.info(
				`${baseMessage} (GHL sync skipped${ghlSync?.reason ? `: ${ghlSync.reason}` : ""})`,
			);
		} else {
			toast.warning(
				`${baseMessage} (GHL sync failed${ghlSync?.error ? `: ${ghlSync.error}` : ""})`,
			);
		}
	};

	const deleteMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.softDelete({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
			});
		},
		successMessage: false,
		errorMessage: (err) => err.message || "Failed to delete customer",
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			["customerDirectory", organizationId],
		],
		onSuccess: (result) => {
			handleGhlToast(
				(result as { ghlSync?: Record<string, unknown> } | undefined)?.ghlSync as
					| { status?: string; reason?: string; error?: string }
					| undefined,
				"Customer deleted",
			);
			setConfirmAction(null);
			onDeleted?.();
		},
	});

	const restoreMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.restore({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
			});
		},
		successMessage: false,
		errorMessage: (err) => err.message || "Failed to restore customer",
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			["customerDirectory", organizationId],
		],
		onSuccess: (result) => {
			handleGhlToast(
				(result as { ghlSync?: Record<string, unknown> } | undefined)?.ghlSync as
					| { status?: string; reason?: string; error?: string }
					| undefined,
				"Customer restored",
			);
			setConfirmAction(null);
		},
	});

	const upsertMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			// Empty string / cleared field => null (clear in DB).
			// Non-empty => the value. (Never send undefined here — the field
			// IS dirty either way; undefined would be "skip".)
			const orNull = (s: string) => (s.trim() ? s : null);
			const goals = profileForm.fitnessGoals.split(",").flatMap((g) => {
				const t = g.trim();
				return t ? [t] : [];
			});
			return client.customerProfiles.upsertForCustomer({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
				phone: orNull(profileForm.phone),
				dateOfBirth: orNull(profileForm.dateOfBirth),
				gender: orNull(profileForm.gender),
				address: orNull(profileForm.address),
				emergencyContactName: orNull(profileForm.emergencyContactName),
				emergencyContactPhone: orNull(profileForm.emergencyContactPhone),
				medicalNotes: orNull(profileForm.medicalNotes),
				fitnessGoals: goals.length > 0 ? goals : null,
				notes: orNull(profileForm.notes),
			});
		},
		successMessage: "Profile updated successfully.",
		errorMessage: (err) => err.message || "Failed to update profile.",
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			["customerDirectory", organizationId],
		],
		onSuccess: () => setFormDirty(false),
	});

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
				status: "confirmed",
				limit: 3,
			} as Parameters<typeof client.appointments.list>[0]),
		enabled: !!organizationId && !!detail?.member.userId,
		staleTime: 60_000,
	});

	const { data: allAppts } = useQuery({
		queryKey: ["appointments", "all", organizationId, detail?.member.userId],
		queryFn: () =>
			client.appointments.list({
				organizationId: organizationId!,
				limit: 50,
			} as Parameters<typeof client.appointments.list>[0]),
		enabled: !!organizationId && !!detail?.member.userId,
		staleTime: 60_000,
	});

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
			</div>
		);
	}

	if (isLoading) return <PageSkeleton />;

	if (error || !detail) {
		const isNotFound =
			error instanceof Error &&
			(error.message.includes("NOT_FOUND") || error.message.includes("404"));
		return (
			<div className="flex min-h-96 flex-col items-center justify-center gap-4 p-6">
				<Alert variant="destructive" className="max-w-md">
					<AlertDescription>
						{isNotFound
							? "Customer not found. They may have been removed."
							: "Failed to load customer profile. Please try again."}
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	const {
		member,
		user,
		profile,
		packageInstances,
		recentPayments,
		appointmentCount,
		outstandingBalanceCents,
	} = detail;
	const activePackageCount = packageInstances.filter(
		(p) => p.status === "active",
	).length;
	const initials = getInitials(user.name ?? "?");

	return (
		<div className="space-y-6 p-6">
			{showBackLink && (
				<Button variant="ghost" size="sm" asChild className="-ml-1">
					<Link to="/dashboard/customers/view">
						<ArrowLeft className="mr-1 size-4" />
						Customers
					</Link>
				</Button>
			)}

			<div className="flex items-start gap-4">
				<span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xl">
					{initials}
				</span>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-bold text-2xl leading-tight">{user.name}</h1>
						{profile?.isDeleted ? (
							<Badge variant="destructive">deleted</Badge>
						) : (
							<Badge variant={memberStatusVariant(member.status ?? "")}>
								{member.status ?? "unknown"}
							</Badge>
						)}
					</div>
					<p className="text-muted-foreground text-sm">{user.email}</p>
					{profile?.phone && (
						<p className="text-muted-foreground text-sm">{profile.phone}</p>
					)}
					<p className="text-muted-foreground text-xs">
						Joined {formatDate(member.joinedAt)}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<KpiCard
					label="LTV"
					value="N/A"
					valueClassName="text-muted-foreground"
				/>
				<KpiCard
					label="Outstanding"
					value={formatPrice(outstandingBalanceCents, "MYR")}
					valueClassName={outstandingBalanceCents > 0 ? "text-red-600" : ""}
				/>
				<KpiCard label="Active Packages" value={activePackageCount} />
				<KpiCard label="Appointments" value={appointmentCount} />
			</div>

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

				<TabsContent value="overview" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Profile</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="cd-phone">Phone</Label>
									<Input
										id="cd-phone"
										type="tel"
										placeholder="+60 12-345 6789"
										value={profileForm.phone}
										onChange={(e) => {
											setProfileForm((f) => ({ ...f, phone: e.target.value }));
											setFormDirty(true);
										}}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="cd-dob">Date of Birth</Label>
									<Input
										id="cd-dob"
										type="date"
										value={profileForm.dateOfBirth}
										onChange={(e) => {
											setProfileForm((f) => ({
												...f,
												dateOfBirth: e.target.value,
											}));
											setFormDirty(true);
										}}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-gender">Gender</Label>
								<Select
									value={profileForm.gender || "_none"}
									onValueChange={(v) => {
										setProfileForm((f) => ({
											...f,
											gender: v === "_none" ? "" : (v as Gender),
										}));
										setFormDirty(true);
									}}
								>
									<SelectTrigger id="cd-gender">
										<SelectValue placeholder="Not specified" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="_none">Not specified</SelectItem>
										<SelectItem value="male">Male</SelectItem>
										<SelectItem value="female">Female</SelectItem>
										<SelectItem value="other">Other</SelectItem>
										<SelectItem value="prefer_not_to_say">
											Prefer not to say
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-address">Address</Label>
								<Textarea
									id="cd-address"
									placeholder="Street, city, postcode..."
									rows={2}
									value={profileForm.address}
									onChange={(e) => {
										setProfileForm((f) => ({ ...f, address: e.target.value }));
										setFormDirty(true);
									}}
								/>
							</div>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="cd-ec-name">Emergency Contact</Label>
									<Input
										id="cd-ec-name"
										placeholder="Full name"
										value={profileForm.emergencyContactName}
										onChange={(e) => {
											setProfileForm((f) => ({
												...f,
												emergencyContactName: e.target.value,
											}));
											setFormDirty(true);
										}}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="cd-ec-phone">Emergency Phone</Label>
									<Input
										id="cd-ec-phone"
										type="tel"
										placeholder="+60 12-345 6789"
										value={profileForm.emergencyContactPhone}
										onChange={(e) => {
											setProfileForm((f) => ({
												...f,
												emergencyContactPhone: e.target.value,
											}));
											setFormDirty(true);
										}}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-medical">Medical Notes</Label>
								<Textarea
									id="cd-medical"
									placeholder="Allergies, conditions, medications..."
									rows={2}
									value={profileForm.medicalNotes}
									onChange={(e) => {
										setProfileForm((f) => ({
											...f,
											medicalNotes: e.target.value,
										}));
										setFormDirty(true);
									}}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-goals">
									Fitness Goals
									<span className="ml-1 text-muted-foreground text-xs">
										(comma-separated)
									</span>
								</Label>
								<Input
									id="cd-goals"
									placeholder="Weight loss, strength, flexibility..."
									value={profileForm.fitnessGoals}
									onChange={(e) => {
										setProfileForm((f) => ({
											...f,
											fitnessGoals: e.target.value,
										}));
										setFormDirty(true);
									}}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-notes">Notes</Label>
								<Textarea
									id="cd-notes"
									placeholder="General notes..."
									rows={2}
									value={profileForm.notes}
									onChange={(e) => {
										setProfileForm((f) => ({ ...f, notes: e.target.value }));
										setFormDirty(true);
									}}
								/>
							</div>

							<div className="flex justify-end">
								<Button
									type="button"
									onClick={() => upsertMutation.mutate()}
									disabled={!formDirty || upsertMutation.isPending}
								>
									{upsertMutation.isPending ? "Saving..." : "Save Profile"}
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base text-destructive">Danger zone</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{profile?.isDeleted && (
								<p
									className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm"
									data-testid="deleted-customer-banner"
								>
									Deleted by {profile.deletedSource ?? "unknown"} on{" "}
									{formatDate(profile.deletedAt)}
								</p>
							)}
							<div className="flex items-center justify-between gap-4">
								{profile?.isDeleted ? (
									<>
										<p className="text-muted-foreground text-sm">
											Restore this customer. Re-creates their GoHighLevel contact.
										</p>
										<Button
											type="button"
											variant="default"
											size="sm"
											className="bg-green-600 hover:bg-green-700"
											data-testid="restore-customer-btn"
											onClick={() => setConfirmAction("restore")}
											disabled={restoreMutation.isPending}
										>
											{restoreMutation.isPending ? "Restoring…" : "Restore customer"}
										</Button>
									</>
								) : (
									<>
										<p className="text-muted-foreground text-sm">
											Delete this customer. Soft-deletes in Avantej and removes the
											contact from GoHighLevel.
										</p>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											data-testid="delete-customer-btn"
											onClick={() => setConfirmAction("delete")}
											disabled={deleteMutation.isPending}
										>
											{deleteMutation.isPending ? "Deleting…" : "Delete customer"}
										</Button>
									</>
								)}
							</div>
						</CardContent>
					</Card>

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
													{(appt as { serviceName?: string | null })
														.serviceName ?? "—"}
												</span>
												<span className="text-muted-foreground text-xs">
													{formatDateTime(appt.startTime)}
												</span>
											</div>
											<Badge
												variant={appointmentStatusVariant(appt.status ?? "")}
											>
												{appt.status ?? "unknown"}
											</Badge>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

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
															variant={paymentStatusVariant(
																payment.status ?? "",
															)}
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
															{(appt as { serviceName?: string | null })
																.serviceName ?? "—"}
														</td>
														<td className="px-3 py-2 text-muted-foreground tabular-nums">
															{start ? start.toISOString().slice(0, 10) : "—"}
														</td>
														<td className="px-3 py-2 text-muted-foreground tabular-nums">
															{start ? start.toTimeString().slice(0, 5) : "—"}
														</td>
														<td className="px-3 py-2">
															<Badge
																variant={appointmentStatusVariant(
																	appt.status ?? "",
																)}
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

			<Dialog
				open={confirmAction !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{confirmAction === "restore"
								? "Restore customer?"
								: "Delete customer?"}
						</DialogTitle>
						<DialogDescription>
							{confirmAction === "restore" ? (
								<>
									<span className="font-medium text-foreground">{user.name}</span>{" "}
									will be restored and re-synced to GoHighLevel.
								</>
							) : (
								<>
									<span className="font-medium text-foreground">{user.name}</span>{" "}
									will be marked deleted in Avantej and removed from GoHighLevel.
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirmAction(null)}
							disabled={deleteMutation.isPending || restoreMutation.isPending}
						>
							Cancel
						</Button>
						{confirmAction === "restore" ? (
							<Button
								type="button"
								className="bg-green-600 hover:bg-green-700"
								onClick={() => restoreMutation.mutate()}
								disabled={restoreMutation.isPending}
								data-testid="confirm-restore-btn"
							>
								{restoreMutation.isPending ? "Restoring…" : "Restore"}
							</Button>
						) : (
							<Button
								type="button"
								variant="destructive"
								onClick={() => deleteMutation.mutate()}
								disabled={deleteMutation.isPending}
								data-testid="confirm-delete-btn"
							>
								{deleteMutation.isPending ? "Deleting…" : "Delete"}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
