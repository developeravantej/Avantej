/**
 * Customer 360 Page
 *
 * Full-page profile view for a single registered customer.
 * Provides an overview, packages with installments, payments history,
 * and appointment history all in one place.
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PackageRow } from "@/components/customers/customer-360/package-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
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

function Customer360Page() {
	const { id } = Route.useParams();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canRead = hasPermission("customer_management:read");

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
		enabled: !!organizationId && canRead,
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
			</div>

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
