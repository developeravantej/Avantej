"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import {
	BarChart2,
	ChevronDown,
	CreditCard,
	Package,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
	fitnessGoals: string; // comma-separated for v1 simplicity
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

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

function formatRelativeTime(date: Date | string | null | undefined): string {
	if (!date) return "Never";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	const diffMs = Date.now() - d.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	if (diffSecs < 60) return "just now";
	const diffMins = Math.floor(diffSecs / 60);
	if (diffMins < 60)
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24)
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12)
		return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
	const diffYears = Math.floor(diffMonths / 12);
	return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
}

function packageStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "active":
			return "default";
		case "frozen":
			return "secondary";
		case "expired":
		case "cancelled":
			return "outline";
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

// ─── Section wrapper ────────────────────────────────────────────────────────────

function Section({
	title,
	icon: Icon,
	defaultOpen = true,
	children,
}: {
	title: string;
	icon: React.ComponentType<{ className?: string }>;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between py-2 text-left"
				>
					<div className="flex items-center gap-2">
						<Icon className="h-4 w-4 text-muted-foreground" />
						<span className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							{title}
						</span>
					</div>
					<ChevronDown
						className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</CollapsibleTrigger>
			<Separator />
			<CollapsibleContent className="pt-3 pb-4">{children}</CollapsibleContent>
		</Collapsible>
	);
}

// ─── Main component ─────────────────────────────────────────────────────────────

interface CustomerDetailSheetProps {
	memberId: string;
	organizationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
}

export function CustomerDetailSheet({
	memberId,
	organizationId,
	open,
	onOpenChange,
	onSaved,
}: CustomerDetailSheetProps) {
	// Profile form state (managed separately to allow editing without refetching)
	const [profileForm, setProfileForm] =
		useState<ProfileFormState>(EMPTY_PROFILE_FORM);
	const [formDirty, setFormDirty] = useState(false);

	// ── Data query ─────────────────────────────────────────────────────────

	const { data, isLoading } = useQuery({
		queryKey: ["customerDirectory", "detail", organizationId, memberId],
		queryFn: async () => {
			const result = await client.customerDirectory.getById({
				organizationId,
				memberId,
			});
			return result;
		},
		enabled: open && !!memberId && !!organizationId,
	});

	// Populate form when a new customer's data arrives (not on every render).
	// Keying on memberId avoids blowing away user edits on background refetch.
	useEffect(() => {
		if (!data) return;
		const profile = data.profile;
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [memberId]);

	// ── Profile upsert mutation ────────────────────────────────────────────

	const upsertMutation = useApiMutation({
		mutationFn: () => {
			if (!data) throw new Error("No customer data loaded");
			return client.customerProfiles.upsertForCustomer({
				organizationId,
				targetUserId: data.member.userId,
				phone: profileForm.phone || undefined,
				dateOfBirth: profileForm.dateOfBirth || undefined,
				gender: (profileForm.gender as Gender) || undefined,
				address: profileForm.address || undefined,
				emergencyContactName: profileForm.emergencyContactName || undefined,
				emergencyContactPhone: profileForm.emergencyContactPhone || undefined,
				medicalNotes: profileForm.medicalNotes || undefined,
				fitnessGoals: profileForm.fitnessGoals
					? profileForm.fitnessGoals
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean)
					: undefined,
				notes: profileForm.notes || undefined,
			});
		},
		successMessage: "Profile updated successfully.",
		errorMessage: (err) => err.message || "Failed to update profile.",
		// Invalidate both the detail and the list so the table refreshes
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			["customerDirectory", organizationId],
		],
		onSuccess: () => {
			setFormDirty(false);
			onSaved?.();
		},
	});

	// ── Derived display data ────────────────────────────────────────────────

	const user = data?.user;
	const member = data?.member;
	const packageInstances = data?.packageInstances ?? [];
	const recentPayments = data?.recentPayments ?? [];
	const outstandingBalanceCents = data?.outstandingBalanceCents ?? 0;
	const appointmentCount = data?.appointmentCount ?? 0;
	const lastVisitAt = data
		? (data as unknown as { lastVisitAt?: Date | null }).lastVisitAt
		: null;

	// ── Render ──────────────────────────────────────────────────────────────

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
				{isLoading || !data ? (
					<PageLoader />
				) : (
					<>
						{/* ── Dialog Header ─────────────────────────────────── */}
						<DialogHeader className="border-b px-6 pt-6 pb-4">
							<div className="flex items-center gap-3">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-sm">
									{(user?.name ?? "?")
										.split(" ")
										.filter(Boolean)
										.slice(0, 2)
										.map((n: string) => n[0].toUpperCase())
										.join("")}
								</span>
								<div className="min-w-0 flex-1">
									<DialogTitle className="font-semibold text-lg leading-tight">
										{user?.name ?? "Unknown"}
									</DialogTitle>
									<DialogDescription asChild>
										<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
											<CopyableCell value={user?.email} />
											<span className="text-muted-foreground text-xs">
												Member since {formatDate(member?.joinedAt)}
											</span>
										</div>
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>

						<div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
							{/* ── Section 1: Profile (editable) ──────────── */}
							<Section title="Profile" icon={User}>
								<div className="space-y-4">
									<div className="grid grid-cols-2 gap-4">
										{/* Phone */}
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="cd-phone">Phone</Label>
											<Input
												id="cd-phone"
												type="tel"
												placeholder="+60 12-345 6789"
												value={profileForm.phone}
												onChange={(e) => {
													setProfileForm((f) => ({
														...f,
														phone: e.target.value,
													}));
													setFormDirty(true);
												}}
											/>
										</div>

										{/* Date of Birth */}
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

									{/* Gender */}
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

									{/* Address */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="cd-address">Address</Label>
										<Textarea
											id="cd-address"
											placeholder="Street, city, postcode..."
											rows={2}
											value={profileForm.address}
											onChange={(e) => {
												setProfileForm((f) => ({
													...f,
													address: e.target.value,
												}));
												setFormDirty(true);
											}}
										/>
									</div>

									{/* Emergency Contact */}
									<div className="grid grid-cols-2 gap-4">
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

									{/* Medical Notes */}
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

									{/* Fitness Goals */}
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

									{/* Notes */}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="cd-notes">Notes</Label>
										<Textarea
											id="cd-notes"
											placeholder="General notes..."
											rows={2}
											value={profileForm.notes}
											onChange={(e) => {
												setProfileForm((f) => ({
													...f,
													notes: e.target.value,
												}));
												setFormDirty(true);
											}}
										/>
									</div>

									{/* Save button */}
									<div className="flex justify-end">
										<Button
											type="button"
											onClick={() => upsertMutation.mutate()}
											disabled={!formDirty || upsertMutation.isPending}
										>
											{upsertMutation.isPending ? "Saving..." : "Save Profile"}
										</Button>
									</div>
								</div>
							</Section>

							{/* ── Section 2: Packages ────────────────────── */}
							<Section title="Packages" icon={Package} defaultOpen={true}>
								{packageInstances.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No packages found.
									</p>
								) : (
									<div className="space-y-2">
										{packageInstances.map((pkg) => (
											<div
												key={pkg.id}
												className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
											>
												<div className="flex min-w-0 flex-col gap-0.5">
													<span className="truncate font-medium">
														{(pkg as any).serviceName ?? pkg.id}
													</span>
													<span className="text-muted-foreground text-xs">
														{pkg.creditsUsed ?? 0} / {pkg.creditsTotal ?? "∞"}{" "}
														credits
														{pkg.expiresAt
															? ` · expires ${formatDate(pkg.expiresAt)}`
															: ""}
													</span>
												</div>
												<Badge variant={packageStatusVariant(pkg.status ?? "")}>
													{pkg.status ?? "unknown"}
												</Badge>
											</div>
										))}
									</div>
								)}
							</Section>

							{/* ── Section 3: Recent Payments ─────────────── */}
							<Section
								title="Recent Payments"
								icon={CreditCard}
								defaultOpen={false}
							>
								{recentPayments.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No payments found.
									</p>
								) : (
									<div className="space-y-2">
										{recentPayments.map((payment) => (
											<div
												key={payment.id}
												className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
											>
												<div className="flex flex-col gap-0.5">
													<span className="font-medium tabular-nums">
														{formatPrice(payment.totalAmount ?? 0, "MYR")}
													</span>
													<span className="text-muted-foreground text-xs">
														{formatDate(payment.createdAt)}
														{(payment as any).method ? ` · ${(payment as any).method}` : ""}
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
							</Section>

							{/* ── Section 4: Stats ───────────────────────── */}
							<Section title="Stats" icon={BarChart2} defaultOpen={true}>
								<div className="grid grid-cols-3 gap-4">
									<div className="flex flex-col gap-1 rounded-lg border px-3 py-3">
										<span className="text-muted-foreground text-xs">
											Outstanding
										</span>
										<span
											className={`font-semibold text-base tabular-nums ${outstandingBalanceCents > 0 ? "text-red-600" : ""}`}
										>
											{formatPrice(outstandingBalanceCents, "MYR")}
										</span>
									</div>
									<div className="flex flex-col gap-1 rounded-lg border px-3 py-3">
										<span className="text-muted-foreground text-xs">
											Appointments
										</span>
										<span className="font-semibold text-base">
											{appointmentCount}
										</span>
									</div>
									<div className="flex flex-col gap-1 rounded-lg border px-3 py-3">
										<span className="text-muted-foreground text-xs">
											Last Visit
										</span>
										<span className="font-semibold text-base">
											{formatRelativeTime(lastVisitAt)}
										</span>
									</div>
								</div>
							</Section>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
