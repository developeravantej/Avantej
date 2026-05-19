/**
 * Customer 360 Page
 *
 * Full-page profile view for a single registered customer.
 * Provides an overview, packages with installments, payments history,
 * and appointment history all in one place.
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, PauseCircle } from "lucide-react";
import { useState } from "react";
import { PackageRow } from "@/components/customers/customer-360/package-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import { AppointmentsTab } from "@/features/customers-detail/components/AppointmentsTab";
import { FreezeMembershipDialog } from "@/features/customers-detail/components/FreezeMembershipDialog";
import { HouseholdSection } from "@/features/customers-detail/components/HouseholdSection";
import { KpiCard } from "@/features/customers-detail/components/KpiCard";
import { LeadSourceSection } from "@/features/customers-detail/components/LeadSourceSection";
import { OverviewTab } from "@/features/customers-detail/components/OverviewTab";
import { PageSkeleton } from "@/features/customers-detail/components/PageSkeleton";
import { PaymentsTab } from "@/features/customers-detail/components/PaymentsTab";
import { getInitials, memberStatusVariant, formatDate } from "@/features/customers-detail/utils";

// ─── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/$id",
)({
	component: Customer360Page,
});

// ─── Constants ─────────────────────────────────────────────────────────────────

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Main page ─────────────────────────────────────────────────────────────────

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
			} as any),
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
			} as any),
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
					<Link to="/dashboard/customers/v2/view" search={{} as any}>
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
					<Link to="/dashboard/customers/v2/view" search={{} as any}>
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
				<Link to="/dashboard/customers/v2/view" search={{} as any}>
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
				<TabsContent value="overview" className="mt-4">
					<OverviewTab
						recentPayments={recentPayments}
						upcomingAppts={upcomingAppts}
					/>
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
					<PaymentsTab recentPayments={recentPayments} />
				</TabsContent>

				{/* ── Appointments tab ─────────────────────────────────────── */}
				<TabsContent value="appointments" className="mt-4">
					<AppointmentsTab allAppts={allAppts} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
