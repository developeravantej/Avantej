/**
 * Approvals page — admins/trainers act on customer-purchased packages that
 * landed in `pending` status (gated by org setting package_approval.required).
 *
 * Pattern C: assignment IS approval. Trainers self-assign; admins assign any
 * trainer in their accessible branch. Admins can also reject.
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarClock,
	CheckCircle2,
	ClipboardList,
	Eye,
	Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { AssignTrainerDrawer } from "@/components/forms/assign-trainer-drawer";
import { RejectPackageDialog } from "@/components/forms/reject-package-dialog";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

type PreferredTime = {
	dayOfWeek: string;
	time: string;
	priority: number;
};

type PendingRow = {
	id: string;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	branchId: string | null;
	totalPrice: number | null;
	taxAmount: number | null;
	creditsTotal: number;
	createdAt: string | Date;
	customerName: string | null;
	customerEmail: string | null;
	preferredTrainerId: string | null;
	preferredTrainerName: string | null;
	remark: string | null;
	paymentStatus: string | null;
	paymentMethod: string | null;
	paymentPlanType: string | null;
	installmentsTotal: number | null;
	installmentsPaid: number | null;
	startsAt: string | Date | null;
	expiresAt: string | Date | null;
	preferredTimes: PreferredTime[];
};

function paymentStatusVariant(
	status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "paid":
			return "default";
		case "pending":
			return "secondary";
		case "failed":
		case "refunded":
			return "destructive";
		default:
			return "outline";
	}
}

function formatPaymentPlan(
	planType: string | null,
	total: number | null,
	paid: number | null,
): string {
	if (!planType || planType === "full") return "Full payment";
	const label = planType === "half" ? "Half (2×)" : "Quarterly (4×)";
	if (total != null && paid != null) return `${label} · ${paid}/${total} paid`;
	return label;
}

function capitalize(s: string): string {
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

function formatPrice(cents: number | null): string {
	if (cents == null) return "—";
	return `RM ${(cents / 100).toFixed(2)}`;
}

function ApprovalsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Caller's role + member.id come from the user-context's current org row.
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const callerRole = currentOrg?.role ?? null;
	// hierarchy.member.id is not in the UserContextResponse type (member only has role/hierarchyScopeId/etc.)
	// but the server may include it — narrow via unknown to avoid widening the type contract.
	type MemberWithId = NonNullable<typeof currentOrg>["hierarchy"]["member"] & { id?: string };
	const callerMemberId =
		(currentOrg?.hierarchy?.member as MemberWithId | null | undefined)?.id ?? null;

	const isAdmin = callerRole === "admin";
	const isTrainer = callerRole === "trainer";

	// Initial scope: trainers default to "assignable_to_me", admins to "all".
	const [scope] = useState<"all" | "assignable_to_me">(
		isTrainer ? "assignable_to_me" : "all",
	);

	const {
		data: rows,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["packageInstances", "listPending", organizationId, scope],
		queryFn: () =>
			client.packageInstances.listPending({
				organizationId: organizationId!,
				scope,
				limit: 100,
			}),
		enabled: !!organizationId && (isAdmin || isTrainer),
	});

	// Drawer / dialog state
	const [drawerPkg, setDrawerPkg] = useState<PendingRow | null>(null);
	const [drawerSelfAssign, setDrawerSelfAssign] = useState(false);
	const [rejectPkg, setRejectPkg] = useState<PendingRow | null>(null);
	const [detailsPkg, setDetailsPkg] = useState<PendingRow | null>(null);

	const list = useMemo(() => (rows ?? []) as PendingRow[], [rows]);

	if (!organizationId) {
		return <PageLoader label="Loading organization…" />;
	}
	if (!isAdmin && !isTrainer) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					message="You don't have permission to view approvals."
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4 p-4 md:p-6">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="font-bold text-2xl text-foreground">
						Pending Approvals
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Customer-purchased packages awaiting trainer assignment.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					Refresh
				</Button>
			</div>

			{isError && (
				<StatusCallout
					variant="error"
					message="Failed to load pending packages."
				/>
			)}

			{isLoading ? (
				<PageLoader label="Loading…" />
			) : list.length === 0 ? (
				<EmptyState
					icon={CheckCircle2}
					title="All caught up"
					description="No packages waiting for trainer assignment."
				/>
			) : (
				<div className="rounded-2xl border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Customer</TableHead>
								<TableHead>Preferred Trainer</TableHead>
								<TableHead>Service</TableHead>
								<TableHead className="text-right">Price</TableHead>
								<TableHead>Payment Status</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<div className="font-medium text-foreground">
											{row.customerName ?? "—"}
										</div>
										<div className="text-muted-foreground text-xs">
											{row.customerEmail ?? ""}
										</div>
									</TableCell>
									<TableCell>
										{row.preferredTrainerName ?? (
											<span className="text-muted-foreground text-xs">
												No preference
											</span>
										)}
									</TableCell>
									<TableCell>{row.serviceName ?? "—"}</TableCell>
									<TableCell className="text-right">
										<div>{formatPrice(row.totalPrice)}</div>
										{row.taxAmount != null && row.taxAmount > 0 && (
											<div className="text-muted-foreground text-xs">
												incl. tax {formatPrice(row.taxAmount)}
											</div>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant={paymentStatusVariant(row.paymentStatus)}
											className="w-fit text-xs capitalize"
										>
											<Wallet className="mr-1 h-3 w-3" />
											{row.paymentStatus ?? "—"}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setDetailsPkg(row)}
											>
												<Eye className="mr-1 h-4 w-4" />
												Details
											</Button>
											{isAdmin && (
												<>
													<Button
														variant="default"
														size="sm"
														onClick={() => {
															setDrawerPkg(row);
															setDrawerSelfAssign(false);
														}}
													>
														Assign Trainer
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => setRejectPkg(row)}
													>
														Reject
													</Button>
												</>
											)}
											{isTrainer && (
												<Button
													variant="default"
													size="sm"
													disabled={!callerMemberId}
													onClick={() => {
														setDrawerPkg(row);
														setDrawerSelfAssign(true);
													}}
												>
													Assign me
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<AssignTrainerDrawer
				open={!!drawerPkg}
				onOpenChange={(o) => {
					if (!o) {
						setDrawerPkg(null);
						setDrawerSelfAssign(false);
					}
				}}
				organizationId={organizationId}
				pkg={drawerPkg}
				defaultTrainerMemberId={
					drawerSelfAssign && callerMemberId
						? callerMemberId
						: (drawerPkg?.preferredTrainerId ?? undefined)
				}
				lockTrainer={drawerSelfAssign}
				onAssigned={() => refetch()}
			/>

			<RejectPackageDialog
				open={!!rejectPkg}
				onOpenChange={(o) => {
					if (!o) setRejectPkg(null);
				}}
				organizationId={organizationId}
				packageInstanceId={rejectPkg?.id ?? null}
				customerName={rejectPkg?.customerName ?? null}
				serviceName={rejectPkg?.serviceName ?? null}
				onRejected={() => refetch()}
			/>

			<Dialog
				open={!!detailsPkg}
				onOpenChange={(o) => {
					if (!o) setDetailsPkg(null);
				}}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Package Request Details</DialogTitle>
						<DialogDescription>
							Full submission from the customer.
						</DialogDescription>
					</DialogHeader>

					{detailsPkg && (
						<div className="space-y-5">
							{/* Customer */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Customer
								</h3>
								<div className="space-y-1">
									<div className="font-medium text-base text-foreground">
										{detailsPkg.customerName ?? "—"}
									</div>
									<div className="text-muted-foreground text-sm">
										{detailsPkg.customerEmail ?? "—"}
									</div>
								</div>
							</section>

							{/* Package */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Package
								</h3>
								<dl className="grid grid-cols-2 gap-3 text-sm">
									<div>
										<dt className="text-muted-foreground text-xs">
											Service
										</dt>
										<dd className="font-medium">
											{detailsPkg.serviceName ?? "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Credits
										</dt>
										<dd className="font-medium">{detailsPkg.creditsTotal}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Starts
										</dt>
										<dd className="font-medium">
											{formatDate(detailsPkg.startsAt)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Expires
										</dt>
										<dd className="font-medium">
											{formatDate(detailsPkg.expiresAt)}
										</dd>
									</div>
								</dl>
							</section>

							{/* Trainer preference */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Preferred Trainer
								</h3>
								{detailsPkg.preferredTrainerName ? (
									<Badge variant="outline">
										{detailsPkg.preferredTrainerName}
									</Badge>
								) : (
									<span className="text-muted-foreground text-sm">
										No preference provided
									</span>
								)}
							</section>

							{/* Preferred times */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Preferred Times
								</h3>
								{detailsPkg.preferredTimes.length > 0 ? (
									<div className="flex flex-wrap items-center gap-2">
										<CalendarClock className="h-4 w-4 text-muted-foreground" />
										{detailsPkg.preferredTimes.map((pt) => (
											<Badge
												key={`${pt.dayOfWeek}-${pt.time}-${pt.priority}`}
												variant="outline"
											>
												#{pt.priority} · {capitalize(pt.dayOfWeek)} {pt.time}
											</Badge>
										))}
									</div>
								) : (
									<span className="text-muted-foreground text-sm">
										None provided
									</span>
								)}
							</section>

							{/* Remark */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Customer Remark
								</h3>
								{detailsPkg.remark ? (
									<div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
										<ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
										<span className="whitespace-pre-wrap">
											{detailsPkg.remark}
										</span>
									</div>
								) : (
									<span className="text-muted-foreground text-sm">
										No remark
									</span>
								)}
							</section>

							{/* Payment */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Payment
								</h3>
								<dl className="grid grid-cols-2 gap-3 text-sm">
									<div>
										<dt className="text-muted-foreground text-xs">
											Subtotal
										</dt>
										<dd className="font-medium">
											{formatPrice(
												(detailsPkg.totalPrice ?? 0) -
													(detailsPkg.taxAmount ?? 0),
											)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">Tax</dt>
										<dd className="font-medium">
											{formatPrice(detailsPkg.taxAmount ?? 0)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Total
										</dt>
										<dd className="font-bold text-base">
											{formatPrice(detailsPkg.totalPrice)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Status
										</dt>
										<dd>
											<Badge
												variant={paymentStatusVariant(
													detailsPkg.paymentStatus,
												)}
												className="capitalize"
											>
												<Wallet className="mr-1 h-3 w-3" />
												{detailsPkg.paymentStatus ?? "—"}
											</Badge>
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Method
										</dt>
										<dd className="font-medium capitalize">
											{detailsPkg.paymentMethod ?? "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Plan
										</dt>
										<dd className="font-medium">
											{formatPaymentPlan(
												detailsPkg.paymentPlanType,
												detailsPkg.installmentsTotal,
												detailsPkg.installmentsPaid,
											)}
										</dd>
									</div>
								</dl>
							</section>

							{/* Meta */}
							<section>
								<h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Submitted
								</h3>
								<div className="text-sm">
									{formatDate(detailsPkg.createdAt)}
								</div>
							</section>
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDetailsPkg(null)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/operations/approvals",
)({
	component: ApprovalsPage,
});
