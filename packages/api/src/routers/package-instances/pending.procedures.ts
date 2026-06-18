import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { preferredTimes } from "@avantej-core/db/schema/tenant/preferred-times";
import { user } from "@avantej-core/db/schema/auth";
import { and, eq, ne, inArray, desc, isNull, isNotNull, or } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

export const packageInstancesPendingProcedures = {
	/**
	 * List packages awaiting trainer assignment. Returns enriched rows with
	 * customer name (control-panel join), service name, branch name, and
	 * purchase timestamp.
	 *
	 * - Admin: sees all pending packages in their accessible branches.
	 * - Trainer: by default sees pending packages in their own branch.
	 * - scope: "assignable_to_me" filters to caller's branch (default for trainers).
	 */
	listPending: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				scope: z.enum(["all", "assignable_to_me"]).optional(),
				limit: z.number().int().min(1).max(200).optional(),
				approvalStatus: z
					.enum(["awaiting_payment", "pending", "approved", "rejected"])
					.optional()
					.default("pending"),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Guard: if the caller supplied an explicit branchId, confirm it sits within
			// their accessible hierarchy. Without this check a trainer could pass an
			// arbitrary branchId outside their scope and see cross-branch pending packages.
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds);
			}
			const callerRole = context.member.role;
			if (callerRole !== "admin" && callerRole !== "trainer") {
				throw new ORPCError("FORBIDDEN", {
					message: "Only admins and trainers can view pending packages",
				});
			}

			// Determine branch filter
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			const scope =
				input.scope ?? (callerRole === "trainer" ? "assignable_to_me" : "all");

			const branchFilterIds: string[] | null = (() => {
				if (input.branchId) return [input.branchId];
				if (scope === "assignable_to_me") {
					// scope expanded 2026-05-12 — match notification fan-out (sales-pipeline-fixes session)
					// Previously filtered to context.member.hierarchyScopeId (single node), causing
					// parent-region trainers to receive notifications but see an empty queue.
					// Now uses accessibleNodeIds (full descendant set), matching notifyStaffOfPendingPackage.
					return accessibleNodeIds.length > 0
						? accessibleNodeIds
						: [context.member.hierarchyScopeId];
				}
				return accessibleNodeIds.length > 0 ? accessibleNodeIds : null;
			})();

			// Pull pending+purchased packages joined to service and customer member.
			// Branch filter is applied in SQL (before LIMIT) using a COALESCE-equivalent
			// two-branch OR: service.branchId takes priority; org-wide services (branchId IS NULL)
			// fall back to the customer member's hierarchyScopeId — matching the same logic used
			// by notifyStaffOfPendingPackage.
			//
			// We alias the members join as "clientMember" to distinguish it from the
			// preferredTrainer member lookup done later.
			const clientMember = members;
			const branchWhereClause =
				branchFilterIds && branchFilterIds.length > 0
					? or(
							// Service has an explicit branch — match directly
							and(
								isNotNull(services.branchId),
								inArray(services.branchId, branchFilterIds),
							),
							// Org-wide service (branchId IS NULL) — use customer member's scope
							and(
								isNull(services.branchId),
								inArray(clientMember.hierarchyScopeId, branchFilterIds),
							),
						)
					: undefined;

			const rows = await context.tenantDb
				.select({
					id: packageInstances.id,
					clientId: packageInstances.clientId,
					serviceId: packageInstances.serviceId,
					totalPrice: packageInstances.totalPrice,
					creditsTotal: packageInstances.creditsTotal,
					createdAt: packageInstances.createdAt,
					preferredTrainerId: packageInstances.preferredTrainerId,
					serviceName: services.name,
					branchId: services.branchId,
					paymentMethod: packageInstances.paymentMethod,
					paymentStatus: packageInstances.paymentStatus,
					approvedAt: packageInstances.approvedAt,
					updatedAt: packageInstances.updatedAt,
				})
				.from(packageInstances)
				.leftJoin(services, eq(packageInstances.serviceId, services.id))
				.leftJoin(
					clientMember,
					eq(packageInstances.clientId, clientMember.userId),
				)
				.where(
					and(
						// STATUS dimension.
						// "awaiting_payment" is an INDEPENDENT payment gate — it is NOT keyed to
						// status="pending". The Stripe webhook hardcodes status="active" and the
						// approval gate (package_approval.required) may be OFF, so unpaid packages
						// can be `active`; a status="pending" filter would silently miss them for
						// approval-off tenants. So awaiting = any non-cancelled purchased package
						// whose money hasn't been received.
						input.approvalStatus === "awaiting_payment"
							? ne(packageInstances.status, "cancelled")
							: eq(
									packageInstances.status,
									input.approvalStatus === "approved"
										? "active"
										: input.approvalStatus === "rejected"
											? "cancelled"
											: "pending",
								),
						eq(packageInstances.source, "purchased"),
						// Scope "approved" to packages that actually went through trainer assignment,
						// and "rejected" to packages explicitly rejected by an admin (cancelledBy set).
						input.approvalStatus === "approved"
							? isNotNull(packageInstances.assignedTrainerId)
							: input.approvalStatus === "rejected"
								? isNotNull(packageInstances.cancelledBy)
								: undefined,
						// PAYMENT dimension — mutually exclusive between the two live tabs so a row
						// never appears in both:
						//  - awaiting_payment: money NOT yet received (pending/failed)
						//  - pending (assignment): money received (paid/partially_paid). `partially_paid`
						//    counts as received — installment plans collect over time while the member trains.
						// Approved/Rejected tabs are NOT payment-filtered: once approved/rejected, a later
						// payment-status change (refund/failed) must not hide the row from history.
						input.approvalStatus === "awaiting_payment"
							? inArray(packageInstances.paymentStatus, ["pending", "failed"])
							: input.approvalStatus === "pending"
								? inArray(packageInstances.paymentStatus, [
										"paid",
										"partially_paid",
									])
								: undefined,
						branchWhereClause,
					),
				)
				.orderBy(desc(packageInstances.createdAt))
				.limit(input.limit ?? 50);

			// Hydrate customer name (cross-DB)
			const controlPanelDb = getControlPanelDb(context);
			type PendingRow = (typeof rows)[number];
			const clientIds: string[] = [
				...new Set<string>(
					rows
						.map((r: PendingRow) => r.clientId)
						.filter((id: string | null): id is string => !!id),
				),
			];
			let customerMap = new Map<string, { name: string; email: string }>();
			if (clientIds.length > 0) {
				const userRows = await controlPanelDb
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, clientIds));
				customerMap = new Map(
					userRows.map((u) => [u.id, { name: u.name, email: u.email }]),
				);
			}

			// Branch filter is already applied in SQL — no JS filtering needed.
			const filtered = rows;

			// Batch-resolve preferred trainer names: members.id → members.userId → user.name
			const preferredTrainerIds: string[] = [
				...new Set<string>(
					filtered
						.map((r: PendingRow) => r.preferredTrainerId)
						.filter((id: string | null): id is string => !!id),
				),
			];
			const preferredTrainerNameMap = new Map<string, string>();
			if (preferredTrainerIds.length > 0) {
				const trainerMemberRows = await context.tenantDb
					.select({ id: members.id, userId: members.userId })
					.from(members)
					.where(inArray(members.id, preferredTrainerIds));
				const trainerUserIds = trainerMemberRows.map(
					(m: { id: string; userId: string }) => m.userId,
				);
				if (trainerUserIds.length > 0) {
					const trainerUserRows = await controlPanelDb
						.select({ id: user.id, name: user.name })
						.from(user)
						.where(inArray(user.id, trainerUserIds));
					const userIdToName = new Map(
						trainerUserRows.map((u) => [u.id, u.name]),
					);
					for (const m of trainerMemberRows) {
						const name = userIdToName.get(m.userId);
						if (name) preferredTrainerNameMap.set(m.id, name);
					}
				}
			}

			// Batch-fetch preferred times for all returned package instances
			const packageInstanceIds = filtered.map((r: PendingRow) => r.id);
			const preferredTimesMap = new Map<
				string,
				Array<{ dayOfWeek: string; time: string; priority: number }>
			>();
			if (packageInstanceIds.length > 0) {
				const timesRows = await context.tenantDb
					.select({
						packageInstanceId: preferredTimes.packageInstanceId,
						dayOfWeek: preferredTimes.dayOfWeek,
						time: preferredTimes.time,
						priority: preferredTimes.priority,
					})
					.from(preferredTimes)
					.where(inArray(preferredTimes.packageInstanceId, packageInstanceIds))
					.orderBy(preferredTimes.priority);
				for (const t of timesRows) {
					const existing = preferredTimesMap.get(t.packageInstanceId) ?? [];
					existing.push({
						dayOfWeek: t.dayOfWeek,
						time: t.time,
						priority: t.priority,
					});
					preferredTimesMap.set(t.packageInstanceId, existing);
				}
			}

			return filtered.map((r: PendingRow) => ({
				...r,
				customerName: r.clientId
					? (customerMap.get(r.clientId)?.name ?? null)
					: null,
				customerEmail: r.clientId
					? (customerMap.get(r.clientId)?.email ?? null)
					: null,
				preferredTrainerName: r.preferredTrainerId
					? (preferredTrainerNameMap.get(r.preferredTrainerId) ?? null)
					: null,
				preferredTimes: preferredTimesMap.get(r.id) ?? [],
			}));
		}),
};
