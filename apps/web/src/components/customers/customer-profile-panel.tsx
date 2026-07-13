/**
 * Customer Profile Panel
 *
 * Reusable inline editable customer profile, used by:
 *  - the dedicated route /dashboard/customers/$id
 *  - the v2 customers split-pane view
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Calendar,
	CreditCard,
	Lock,
	Package,
	RotateCcw,
	Trash2,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MagicLinkActions } from "@/components/customers/customer-360/magic-link-actions";
import { PackageRow } from "@/components/customers/customer-360/package-row";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { LogsTab } from "@/features/customers-detail/components/LogsTab";
import { normalizeGender } from "@/lib/gender";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

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

// ─── Status pills ──────────────────────────────────────────────────────────────

function MemberStatusPill({ status }: { status: string }) {
	const map: Record<string, { bg: string; text: string; dot: string }> = {
		active: {
			bg: "bg-emerald-50",
			text: "text-emerald-700",
			dot: "bg-emerald-500",
		},
		inactive: {
			bg: "bg-slate-100",
			text: "text-slate-500",
			dot: "bg-slate-400",
		},
	};
	const s = map[status] ?? {
		bg: "bg-slate-100",
		text: "text-slate-500",
		dot: "bg-slate-400",
	};
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
			{status || "unknown"}
		</span>
	);
}

function PaymentStatusPill({ status }: { status: string }) {
	const map: Record<string, { bg: string; text: string; dot: string }> = {
		succeeded: {
			bg: "bg-emerald-50",
			text: "text-emerald-700",
			dot: "bg-emerald-500",
		},
		pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
		failed: { bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500" },
	};
	const s = map[status] ?? {
		bg: "bg-slate-100",
		text: "text-slate-500",
		dot: "bg-slate-400",
	};
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
			{status || "unknown"}
		</span>
	);
}

function AppointmentStatusPill({ status }: { status: string }) {
	const map: Record<string, { bg: string; text: string; dot: string }> = {
		confirmed: {
			bg: "bg-emerald-50",
			text: "text-emerald-700",
			dot: "bg-emerald-500",
		},
		completed: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
		pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
		cancelled: { bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500" },
		"no-show": { bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500" },
	};
	const s = map[status] ?? {
		bg: "bg-slate-100",
		text: "text-slate-500",
		dot: "bg-slate-400",
	};
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
			{status || "unknown"}
		</span>
	);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
	return (
		<div className="space-y-5 p-6">
			{/* Header skeleton */}
			<div className="flex items-center gap-4">
				<div className="h-14 w-14 rounded-full bg-[#e5e5e5] animate-pulse" />
				<div className="space-y-2">
					<div className="h-6 w-44 rounded bg-[#e5e5e5] animate-pulse" />
					<div className="h-4 w-56 rounded bg-[#e5e5e5] animate-pulse" />
				</div>
			</div>
			{/* KPI skeleton */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="rounded-2xl border border-[#e5e5e5] bg-white p-4 space-y-2"
					>
						<div className="h-3 w-20 rounded bg-[#e5e5e5] animate-pulse" />
						<div className="h-7 w-24 rounded bg-[#e5e5e5] animate-pulse" />
					</div>
				))}
			</div>
			{/* Content skeleton */}
			<div className="h-72 rounded-2xl border border-[#e5e5e5] bg-white animate-pulse" />
		</div>
	);
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
	label: string;
	value: string | number | null | undefined;
	danger?: boolean;
}

function KpiTile({ label, value, danger }: KpiTileProps) {
	const display =
		value === null || value === undefined || value === "N/A" ? "—" : value;
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
				{label}
			</p>
			<p
				className={`mt-1 text-2xl font-bold font-mono tabular-nums ${danger && typeof value === "number" && value > 0 ? "text-rose-600" : "text-[#0a0a0a]"}`}
			>
				{display}
			</p>
		</div>
	);
}

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<h2 className="text-base font-bold text-[#0a0a0a] mb-4">{title}</h2>
			{children}
		</div>
	);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
	icon: Icon,
	heading,
	helper,
}: {
	icon: React.ElementType;
	heading: string;
	helper: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-12 text-[#737373]">
			<Icon className="h-8 w-8 mb-3 opacity-30" />
			<p className="text-sm font-medium text-[#0a0a0a]">{heading}</p>
			<p className="text-xs mt-1">{helper}</p>
		</div>
	);
}

// ─── Main UUID check ──────────────────────────────────────────────────────────

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CustomerProfilePanelProps {
	memberId: string;
	/** Show a "Back to Customers" link above the header. Default true. */
	showBackLink?: boolean;
	/** Called after a successful soft-delete so the parent can clear the selection. */
	onDeleted?: () => void;
}

export function CustomerProfilePanel({
	memberId,
	showBackLink = true,
	onDeleted,
}: CustomerProfilePanelProps) {
	const { data: userContext, hasPermission, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");
	const idIsValid = UUID_RE.test(memberId);

	const [profileForm, setProfileForm] =
		useState<ProfileFormState>(EMPTY_PROFILE_FORM);
	const [formDirty, setFormDirty] = useState(false);
	const [nameEdit, setNameEdit] = useState("");
	const [nameEditDirty, setNameEditDirty] = useState(false);
	const [emailEdit, setEmailEdit] = useState("");
	const [emailEditDirty, setEmailEditDirty] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

	// Populate the form once data arrives for this member. Keyed on memberId +
	// the loaded profile id so it (a) runs when the fetched record first lands
	// on a fresh load, and (b) re-runs only when switching customers — never on
	// a background refetch of the same record, which would wipe unsaved edits.
	const loadedProfileKey = detail
		? `${memberId}:${detail.profile?.id ?? "none"}`
		: null;
	useEffect(() => {
		if (!detail) return;
		const profile = detail.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: normalizeGender(profile?.gender),
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		setNameEditDirty(false);
		setEmailEditDirty(false);
		// loadedProfileKey changes only on member switch or first data arrival.
		// intentional: profile in deps would wipe unsaved form edits on every background refetch
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadedProfileKey]);

	useEffect(() => {
		if (!detail) return;
		if (!nameEditDirty) setNameEdit(detail.user.name ?? "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detail?.user?.name, memberId]);

	useEffect(() => {
		if (!detail) return;
		if (!emailEditDirty) setEmailEdit(detail.user.email ?? "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detail?.user?.email, memberId]);

	const upsertMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.upsertForCustomer({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
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
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			orpc.customerDirectory.list.key(),
			["customerLogs", organizationId, memberId],
		],
		onSuccess: () => setFormDirty(false),
	});

	const updateNameMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.updateName({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
				newName: nameEdit.trim(),
			});
		},
		successMessage: "Name updated.",
		errorMessage: (err) => err.message || "Failed to update name.",
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			orpc.customerDirectory.list.key(),
			["customerLogs", organizationId, memberId],
		],
		onSuccess: () => setNameEditDirty(false),
	});

	const updateEmailMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.updateEmail({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
				newEmail: emailEdit.trim(),
			});
		},
		successMessage: (result) =>
			(result as { verificationSent?: boolean })?.verificationSent
				? "Email updated. A verification link was sent — the customer must confirm it before signing in."
				: "Email updated.",
		errorMessage: (err) => err.message || "Failed to update email.",
		invalidate: [
			["customerDirectory", "detail", organizationId, memberId],
			orpc.customerDirectory.list.key(),
			["customerLogs", organizationId, memberId],
		],
		onSuccess: () => setEmailEditDirty(false),
	});

	const deleteMutation = useApiMutation({
		mutationFn: () => {
			if (!detail) throw new Error("No customer data loaded");
			return client.customerProfiles.softDelete({
				organizationId: organizationId!,
				targetUserId: detail.member.userId,
			});
		},
		successMessage: "Customer deleted.",
		errorMessage: (err) => err.message || "Failed to delete customer.",
		invalidate: [
			orpc.customerDirectory.list.key(),
			["customerDirectory", "detail", organizationId, memberId],
		],
		onSuccess: () => {
			setDeleteDialogOpen(false);
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
		successMessage: "Customer restored.",
		errorMessage: (err) => err.message || "Failed to restore customer.",
		invalidate: [
			orpc.customerDirectory.list.key(),
			["customerDirectory", "detail", organizationId, memberId],
		],
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
				// AVANTEJ-10: scope to this customer, not the whole org.
				userId: detail!.member.userId,
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
				// AVANTEJ-10: scope to this customer, not the whole org.
				userId: detail!.member.userId,
				limit: 50,
			} as Parameters<typeof client.appointments.list>[0]),
		enabled: !!organizationId && !!detail?.member.userId,
		staleTime: 60_000,
	});

	// ── Guard states ────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 flex-col items-center justify-center text-[#737373]">
				<User className="h-8 w-8 mb-3 opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					No organisation selected
				</p>
				<p className="text-xs mt-1">
					Select an organisation to view this customer.
				</p>
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 flex-col items-center justify-center text-[#737373]">
				<Lock className="h-8 w-8 mb-3 opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					You don't have access
				</p>
				<p className="text-xs mt-1">
					Ask an admin to grant customer_management:read.
				</p>
			</div>
		);
	}

	if (!idIsValid) {
		return (
			<div className="flex min-h-96 flex-col items-center justify-center text-[#737373]">
				<User className="h-8 w-8 mb-3 opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					Invalid customer link
				</p>
				<p className="text-xs mt-1">
					This URL doesn't point to a valid customer.
				</p>
			</div>
		);
	}

	if (isLoading) return <PageSkeleton />;

	if (error || !detail) {
		const isNotFound =
			error instanceof Error &&
			(error.message.includes("NOT_FOUND") || error.message.includes("404"));
		return (
			<div className="flex min-h-96 flex-col items-center justify-center text-[#737373]">
				<User className="h-8 w-8 mb-3 opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					{isNotFound ? "Customer not found" : "Failed to load customer"}
				</p>
				<p className="text-xs mt-1">
					{isNotFound
						? "They may have been removed."
						: "Please try refreshing the page."}
				</p>
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
		<div className="space-y-5 p-6">
			{/* ── Back link ──────────────────────────────────────────────────── */}
			{showBackLink && (
				<Link
					to="/dashboard/customers/v2/view"
					search={(_prev) => ({ customer: undefined, showDeleted: undefined })}
					className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-[#737373] hover:text-[#0a0a0a] mb-1"
				>
					<ArrowLeft className="h-3 w-3" />
					Customers
				</Link>
			)}

			{/* ── Header ─────────────────────────────────────────────────────── */}
			<div className="flex items-start gap-4">
				{/* Avatar */}
				<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1] font-bold text-[#0a0a0a] text-lg select-none">
					{initials}
				</span>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2 mb-0.5">
						<h1 className="text-[22px] font-extrabold tracking-tight leading-tight text-[#0a0a0a]">
							{user.name}
						</h1>
						<MemberStatusPill status={member.status ?? "unknown"} />
					</div>
					<p className="text-sm text-[#737373]">{user.email}</p>
					{profile?.phone && (
						<p className="text-sm text-[#737373]">{profile.phone}</p>
					)}
					<p className="text-[10px] font-mono tabular-nums text-[#737373] mt-0.5">
						Joined {formatDate(member.joinedAt)}
					</p>
					{organizationId && profile?.id && (
						<div className="pt-2">
							<MagicLinkActions
								organizationId={organizationId}
								customerProfileId={profile.id}
								customerEmail={user.email}
								isUnclaimed={profile.isUnclaimed ?? false}
							/>
						</div>
					)}
				</div>
			</div>

			{/* ── KPI tiles ──────────────────────────────────────────────────── */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<KpiTile label="LTV" value={null} />
				<KpiTile
					label="Outstanding"
					value={formatPrice(outstandingBalanceCents, "MYR")}
					danger
				/>
				<KpiTile label="Active Packages" value={activePackageCount} />
				<KpiTile label="Appointments" value={appointmentCount} />
			</div>

			{/* ── Tabs ───────────────────────────────────────────────────────── */}
			<Tabs defaultValue="overview">
				{/* Tab bar */}
				<div className="flex flex-wrap items-center gap-2">
					<TabsList className="h-auto gap-2 bg-transparent p-0 flex-wrap">
						{(
							[
								{ value: "overview", label: "Overview" },
								{
									value: "packages",
									label:
										packageInstances.length > 0
											? `Packages · ${packageInstances.length}`
											: "Packages",
								},
								{ value: "payments", label: "Payments" },
								{ value: "appointments", label: "Appointments" },
								{ value: "logs", label: "Logs" },
							] as const
						).map(({ value, label }) => (
							<TabsTrigger
								key={value}
								value={value}
								className="rounded-full border border-[#e5e5e5] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#737373] transition hover:bg-[#f3f3f3] hover:text-[#0a0a0a] data-[state=active]:border-[#0a0a0a] data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-white data-[state=active]:shadow-none"
							>
								{label}
							</TabsTrigger>
						))}
					</TabsList>

					{/* New Sale link — right of tabs */}
					<Link
						to="/dashboard/sales/create"
						search={{ customer: memberId }}
						className="inline-flex items-center rounded-full border border-[#e5e5e5] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#737373] transition hover:bg-[#f3f3f3] hover:text-[#0a0a0a]"
					>
						New Sale
					</Link>

					{/* Delete / Restore — far right */}
					{(hasPermission("customer_management:delete") ||
						hasRole(["admin"])) &&
						(detail?.profile?.isDeleted ? (
							<button
								type="button"
								onClick={() => restoreMutation.mutate()}
								disabled={restoreMutation.isPending}
								className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-white px-3.5 py-1.5 text-[13px] font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
							>
								<RotateCcw className="h-3.5 w-3.5" />
								{restoreMutation.isPending ? "Restoring…" : "Restore"}
							</button>
						) : (
							// Backend rejects soft-deleting unclaimed profiles (placeholder
							// user row must be resolved via claim link first) — disable the
							// button instead of letting the request 400.
							// AVANTEJ-13: explain the disabled state with a real (Radix)
							// tooltip. A disabled <button> swallows pointer events, so the
							// trigger wraps a <span> per the repo pattern; the plain `title`
							// attr was unreliable/invisible on disabled controls.
							(() => {
								const isUnclaimed = detail?.profile?.isUnclaimed ?? false;
								const deleteBtn = (
									<button
										type="button"
										onClick={() => setDeleteDialogOpen(true)}
										disabled={isUnclaimed}
										className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-white px-3.5 py-1.5 text-[13px] font-medium text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete
									</button>
								);
								if (!isUnclaimed) return deleteBtn;
								return (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="ml-auto">{deleteBtn}</span>
											</TooltipTrigger>
											<TooltipContent>
												<p>
													Unclaimed profiles can&apos;t be deleted. Send the
													customer their claim link first.
												</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								);
							})()
						))}
				</div>

				{/* ── Delete confirmation ──────────────────────────────────── */}
				<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete customer?</DialogTitle>
							<DialogDescription>
								This will soft-delete{" "}
								<span className="font-semibold">
									{detail?.user.name ?? "this customer"}
								</span>
								. They will no longer appear in the customer list. You can
								restore them by enabling &quot;Show deleted&quot; in the
								customers view.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setDeleteDialogOpen(false)}
								disabled={deleteMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={() => deleteMutation.mutate()}
								disabled={deleteMutation.isPending}
							>
								{deleteMutation.isPending ? "Deleting…" : "Delete"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* ─────────────────────────────────────────────────────────── */}
				{/* OVERVIEW TAB                                                */}
				{/* ─────────────────────────────────────────────────────────── */}
				<TabsContent value="overview" className="mt-4 space-y-4">
					{/* Profile card */}
					<SectionCard title="Profile">
						<div className="space-y-4">
							{/* Lead source / campaign attribution badges */}
							{(profile?.leadAcquisitionType || profile?.campaignId) && (
								<div className="flex flex-wrap items-center gap-2">
									{profile?.leadAcquisitionType && (
										<span className="flex items-center gap-1.5 text-[#737373] text-xs">
											Lead source
											<span className="inline-flex items-center rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] font-medium text-[#0a0a0a]">
												{profile.leadAcquisitionType}
											</span>
										</span>
									)}
									{profile?.campaignId && (
										<span className="flex items-center gap-1.5 text-[#737373] text-xs">
											Campaign
											<span className="inline-flex items-center rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] font-medium text-[#0a0a0a]">
												{profile.campaignId}
											</span>
										</span>
									)}
								</div>
							)}

							{/* Name */}
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-name">Name</Label>
								<div className="flex gap-2">
									<Input
										id="cd-name"
										type="text"
										placeholder="Full name"
										value={nameEdit}
										onChange={(e) => {
											setNameEdit(e.target.value);
											setNameEditDirty(
												e.target.value.trim() !== (detail?.user.name ?? ""),
											);
										}}
									/>
									{nameEditDirty && (
										<button
											type="button"
											disabled={
												updateNameMutation.isPending || !nameEdit.trim()
											}
											onClick={() => updateNameMutation.mutate()}
											className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
										>
											{updateNameMutation.isPending ? "Saving…" : "Save"}
										</button>
									)}
								</div>
							</div>

							{/* Email */}
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-email">Email</Label>
								<div className="flex gap-2">
									<Input
										id="cd-email"
										type="email"
										placeholder="customer@example.com"
										value={emailEdit}
										onChange={(e) => {
											setEmailEdit(e.target.value);
											setEmailEditDirty(
												e.target.value.trim() !== (detail?.user.email ?? ""),
											);
										}}
									/>
									{emailEditDirty && (
										<button
											type="button"
											disabled={
												updateEmailMutation.isPending || !emailEdit.trim()
											}
											onClick={() => updateEmailMutation.mutate()}
											className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
										>
											{updateEmailMutation.isPending ? "Saving…" : "Save"}
										</button>
									)}
								</div>
							</div>

							{/* Phone + DOB */}
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
										setProfileForm((f) => ({ ...f, address: e.target.value }));
										setFormDirty(true);
									}}
								/>
							</div>

							{/* Emergency contact */}
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

							{/* Medical notes */}
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

							{/* Fitness goals */}
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="cd-goals">
									Fitness Goals
									<span className="ml-1 text-[#737373] text-xs">
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
										setProfileForm((f) => ({ ...f, notes: e.target.value }));
										setFormDirty(true);
									}}
								/>
							</div>

							{/* Save button */}
							<div className="flex justify-end pt-1">
								<button
									type="button"
									onClick={() => upsertMutation.mutate()}
									disabled={!formDirty || upsertMutation.isPending}
									className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-40 disabled:cursor-not-allowed"
								>
									{upsertMutation.isPending ? "Saving…" : "Save Profile"}
								</button>
							</div>
						</div>
					</SectionCard>

					{/* Recent Payments */}
					<SectionCard title="Recent Payments">
						{recentPayments.length === 0 ? (
							<EmptyState
								icon={CreditCard}
								heading="No payments on record"
								helper="Payments will appear here once a sale is completed."
							/>
						) : (
							<div className="rounded-xl border border-[#e5e5e5] overflow-hidden">
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Date
											</th>
											<th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Amount
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Method
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{recentPayments.slice(0, 5).map((payment) => (
											<tr
												key={payment.id}
												className="hover:bg-[#fafafa] transition-colors"
											>
												<td className="px-4 py-3 text-sm font-mono tabular-nums text-[#737373]">
													{formatDate(payment.createdAt)}
												</td>
												<td className="px-4 py-3 text-sm font-mono tabular-nums text-right text-[#0a0a0a] font-medium">
													{formatPrice(payment.totalAmount ?? 0, "MYR")}
												</td>
												<td className="px-4 py-3 text-sm text-[#737373]">
													{payment.paymentMethod ?? "—"}
												</td>
												<td className="px-4 py-3">
													<PaymentStatusPill status={payment.status ?? ""} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</SectionCard>

					{/* Upcoming Appointments */}
					<SectionCard title="Upcoming Appointments">
						{!upcomingAppts || upcomingAppts.length === 0 ? (
							<EmptyState
								icon={Calendar}
								heading="No upcoming appointments"
								helper="Confirmed appointments will appear here."
							/>
						) : (
							<div className="rounded-xl border border-[#e5e5e5] overflow-hidden">
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Service
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Date & Time
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{upcomingAppts.map((appt) => (
											<tr
												key={appt.id}
												className="hover:bg-[#fafafa] transition-colors"
											>
												<td className="px-4 py-3 text-sm font-medium text-[#0a0a0a]">
													{(appt as { serviceName?: string | null })
														.serviceName ?? "—"}
												</td>
												<td className="px-4 py-3 text-sm font-mono tabular-nums text-[#737373]">
													{formatDateTime(appt.startTime)}
												</td>
												<td className="px-4 py-3">
													<AppointmentStatusPill status={appt.status ?? ""} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</SectionCard>
				</TabsContent>

				{/* ─────────────────────────────────────────────────────────── */}
				{/* PACKAGES TAB                                                */}
				{/* ─────────────────────────────────────────────────────────── */}
				<TabsContent value="packages" className="mt-4">
					{packageInstances.length === 0 ? (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
							<EmptyState
								icon={Package}
								heading="No packages found"
								helper="Create a sale to assign a package to this customer."
							/>
						</div>
					) : (
						<div className="space-y-3">
							{packageInstances.map((pkg) => (
								<PackageRow
									key={pkg.id}
									pkg={{
										id: pkg.id,
										clientId: pkg.clientId ?? "",
										status: pkg.status,
										creditsUsed: pkg.creditsUsed,
										creditsTotal: pkg.creditsTotal,
										creditsUnlocked: pkg.creditsUnlocked,
										expiresAt: pkg.expiresAt,
										serviceName: pkg.serviceName,
										paymentPlanCode: pkg.paymentPlanType,
									}}
									organizationId={organizationId}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* ─────────────────────────────────────────────────────────── */}
				{/* PAYMENTS TAB                                                */}
				{/* ─────────────────────────────────────────────────────────── */}
				<TabsContent value="payments" className="mt-4">
					<SectionCard title="Payment History">
						{recentPayments.length === 0 ? (
							<EmptyState
								icon={CreditCard}
								heading="No payment records found"
								helper="Payments will appear here once a sale is completed."
							/>
						) : (
							<div className="rounded-xl border border-[#e5e5e5] overflow-hidden">
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Date
											</th>
											<th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Amount
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Method
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{recentPayments.map((payment) => (
											<tr
												key={payment.id}
												className="hover:bg-[#fafafa] transition-colors"
											>
												<td className="px-4 py-3 text-sm font-mono tabular-nums text-[#737373]">
													{formatDate(payment.createdAt)}
												</td>
												<td className="px-4 py-3 text-sm font-mono tabular-nums text-right font-medium text-[#0a0a0a]">
													{formatPrice(payment.totalAmount ?? 0, "MYR")}
												</td>
												<td className="px-4 py-3 text-sm text-[#737373]">
													{payment.paymentMethod ?? "—"}
												</td>
												<td className="px-4 py-3">
													<PaymentStatusPill status={payment.status ?? ""} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</SectionCard>
				</TabsContent>

				{/* ─────────────────────────────────────────────────────────── */}
				{/* APPOINTMENTS TAB                                            */}
				{/* ─────────────────────────────────────────────────────────── */}
				<TabsContent value="appointments" className="mt-4">
					<SectionCard title="Appointment History">
						{!allAppts || allAppts.length === 0 ? (
							<EmptyState
								icon={Calendar}
								heading="No appointments found"
								helper="Appointments will appear here once they are booked."
							/>
						) : (
							<div className="rounded-xl border border-[#e5e5e5] overflow-hidden">
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Service
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Date
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Time
											</th>
											<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{allAppts.map((appt) => {
											const start = appt.startTime
												? appt.startTime instanceof Date
													? appt.startTime
													: new Date(appt.startTime)
												: null;
											return (
												<tr
													key={appt.id}
													className="hover:bg-[#fafafa] transition-colors"
												>
													<td className="px-4 py-3 text-sm font-medium text-[#0a0a0a]">
														{(appt as { serviceName?: string | null })
															.serviceName ?? "—"}
													</td>
													<td className="px-4 py-3 text-sm font-mono tabular-nums text-[#737373]">
														{start ? start.toISOString().slice(0, 10) : "—"}
													</td>
													<td className="px-4 py-3 text-sm font-mono tabular-nums text-[#737373]">
														{start ? start.toTimeString().slice(0, 5) : "—"}
													</td>
													<td className="px-4 py-3">
														<AppointmentStatusPill status={appt.status ?? ""} />
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</SectionCard>
				</TabsContent>

				{/* ─────────────────────────────────────────────────────────── */}
				{/* LOGS TAB                                                    */}
				{/* ─────────────────────────────────────────────────────────── */}
				<TabsContent value="logs" className="mt-4">
					<LogsTab
						organizationId={organizationId!}
						memberId={member.id}
						memberUserId={member.userId}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
