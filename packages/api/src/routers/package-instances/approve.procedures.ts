import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import {
	notifyCustomerPackageRejected,
	clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq, inArray, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import type { TenantTx } from "./types";

export const packageInstancesApproveProcedures = {
	/**
	 * Reject a pending package — admin only. Sets status: cancelled,
	 * cancellationReason, cancelledBy and notifies the customer.
	 * Refund handling is out of scope for v1.
	 */
	reject: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				reason: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "Only admins can reject packages",
				});
			}

			// 7.5: Never write an empty string to audit columns — session must be present
			const callerUserId = context.session?.user?.id;
			if (!callerUserId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", { message: "Package not found" });
			}
			if (pkg.status !== "pending") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Package is not pending (current status: ${pkg.status})`,
				});
			}

			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			if (svc?.branchId) {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You do not have access to this branch",
					});
				}
			}

			const now = new Date();

			const updated = await context.tenantDb.transaction(
				async (tx: TenantTx) => {
					// LC-C2: cancel outstanding instalment rows before setting package to cancelled
					await tx
						.update(installments)
						.set({ status: "cancelled", updatedAt: now })
						.where(
							and(
								eq(installments.packageInstanceId, pkg.id),
								inArray(installments.status, ["pending", "overdue"]),
							),
						);

					const [row] = await tx
						.update(packageInstances)
						.set({
							status: "cancelled",
							cancellationReason: input.reason ?? "Rejected by admin",
							cancelledBy: callerUserId,
							updatedAt: now,
						})
						.where(eq(packageInstances.id, pkg.id))
						.returning();
					if (!row) throw new Error("Failed to update package");

					await writeAudit(tx, {
						actorUserId: callerUserId,
						actorMemberId: context.member!.id,
						actorRole: context.member!.role,
						action: "package.rejected",
						entityType: "package_instance",
						entityId: pkg.id,
						branchId: svc?.branchId ?? undefined,
						summary: `Rejected package ${pkg.id}${
							input.reason ? `: ${input.reason}` : ""
						}`,
						changes: { reason: input.reason ?? null },
					});

					// 7.6: Status-history row — pending → cancelled on admin rejection
					await appendPackageInstanceStatusHistory(tx, pkg.id, {
						fromStatus: pkg.status,
						toStatus: "cancelled",
						changedBy: callerUserId,
						reason: input.reason ?? "Rejected by admin",
					});

					return row;
				},
			);

			try {
				if (updated.clientId) {
					await notifyCustomerPackageRejected(context.tenantDb, {
						packageInstanceId: updated.id,
						customerUserId: updated.clientId,
						serviceName: svc?.name ?? "your package",
						reason: input.reason ?? null,
					});
				}
				await clearPendingReviewNotifications(context.tenantDb, updated.id);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error("post-reject side-effects failed:", err);
			}

			return updated;
		}),
};
