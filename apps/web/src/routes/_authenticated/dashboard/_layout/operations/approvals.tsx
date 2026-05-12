/**
 * Approvals page — admins/trainers act on customer-purchased packages that
 * landed in `pending` status (gated by org setting package_approval.required).
 *
 * Pattern C: assignment IS approval. Trainers self-assign; admins assign any
 * trainer in their accessible branch. Admins can also reject.
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
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

type PendingRow = {
	id: string;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	branchId: string | null;
	totalPrice: number | null;
	creditsTotal: number;
	createdAt: string | Date;
	customerName: string | null;
	customerEmail: string | null;
	preferredTrainerId: string | null;
	preferredTrainerName: string | null;
};

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
					<h1 className="font-semibold text-2xl text-foreground">
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
								<TableHead>Service</TableHead>
								<TableHead className="text-right">Credits</TableHead>
								<TableHead className="text-right">Price</TableHead>
								<TableHead>Purchased</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<div className="flex items-center gap-2">
											<span className="font-medium text-foreground">
												{row.customerName ?? "—"}
											</span>
											{row.preferredTrainerName && (
												<Badge variant="outline" className="text-xs">
													Preferred: {row.preferredTrainerName}
												</Badge>
											)}
										</div>
										<div className="text-muted-foreground text-xs">
											{row.customerEmail ?? ""}
										</div>
									</TableCell>
									<TableCell>{row.serviceName ?? "—"}</TableCell>
									<TableCell className="text-right">
										{row.creditsTotal}
									</TableCell>
									<TableCell className="text-right">
										{formatPrice(row.totalPrice)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{formatDate(row.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
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
		</div>
	);
}

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/operations/approvals",
)({
	component: ApprovalsPage,
});
