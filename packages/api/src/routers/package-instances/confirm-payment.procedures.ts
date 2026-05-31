import { writeAudit } from "@avantej-core/services/audit-log.service";
import { confirmInstallmentPayment } from "@avantej-core/services/installment.service";
import { notifyStaffOfPendingPackage } from "@avantej-core/services/notification.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";
import type { TenantTx } from "./types";

// Methods that confirm automatically via the payment gateway webhook — a human
// must NOT manually "mark paid" (would double-count / desync from Stripe). In
// this codebase only `stripe` is async/webhook-driven; cash/card/manual_transfer/
// fpx are recorded as received at the point of sale or by this confirmation.
const GATEWAY_AUTO_METHODS = new Set<string>(["stripe"]);

export const packageInstancesConfirmPaymentProcedures = {
	/**
	 * Confirm that payment has been RECEIVED for a purchased package — the first
	 * stage of the approvals pipeline (payment → trainer assignment).
	 *
	 * Two paths:
	 *  - Installment plan (has installment rows): delegate to confirmInstallmentPayment
	 *    on the earliest pending/overdue installment. That advances the schedule and
	 *    recomputes paymentStatus (partially_paid / paid) via syncPackagePaymentStatus.
	 *  - Single payment (no installment rows): mark the package paid directly under a
	 *    row lock.
	 *
	 * Idempotent: if the package is already paid/partially_paid (e.g. the Stripe
	 * webhook won a race), returns { alreadyConfirmed: true } without mutating.
	 *
	 * Mutates `paymentStatus` ONLY — never `status`. Trainer assignment (which sets
	 * status=active) remains a separate step.
	 */
	confirmPayment: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				paymentMethod: z.enum([
					"manual_transfer",
					"cash",
					"card",
					"fpx",
					"stripe",
				]),
				notes: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);

			const callerUserId = context.session?.user?.id;
			if (!callerUserId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", { message: "Package not found" });
			}
			if (pkg.source !== "purchased") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only purchased packages require payment confirmation",
				});
			}

			// Branch access: confirm caller can act on the service's branch.
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			if (svc?.branchId) {
				guardBranchAccessible(svc.branchId, context.accessibleNodeIds);
			}

			// Idempotency / terminal pre-checks (re-verified under lock in Branch B).
			if (
				pkg.paymentStatus === "paid" ||
				pkg.paymentStatus === "partially_paid"
			) {
				return {
					id: pkg.id,
					paymentStatus: pkg.paymentStatus,
					installmentsPaid: pkg.installmentsPaid,
					alreadyConfirmed: true,
				};
			}
			if (pkg.status === "cancelled" || pkg.paymentStatus === "refunded") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot confirm payment — package is ${pkg.status} / ${pkg.paymentStatus}`,
				});
			}
			// Online/gateway methods confirm automatically via webhook.
			if (GATEWAY_AUTO_METHODS.has(input.paymentMethod)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Online (Stripe) payments are confirmed automatically by the payment gateway and cannot be confirmed manually.",
				});
			}

			// Branch A — installment schedule exists → confirm earliest open installment.
			const [pendingInstallment] = await context.tenantDb
				.select({ id: installments.id })
				.from(installments)
				.where(
					and(
						eq(installments.packageInstanceId, pkg.id),
						inArray(installments.status, ["pending", "overdue"]),
					),
				)
				.orderBy(asc(installments.installmentNumber))
				.limit(1);

			let resultPaymentStatus: string;
			let resultInstallmentsPaid: number;

			if (pendingInstallment) {
				const { packageInstance } = await confirmInstallmentPayment(
					context.tenantDb,
					{
						installmentId: pendingInstallment.id,
						paymentMethod: input.paymentMethod,
						confirmedBy: callerUserId,
						notes: input.notes,
					},
				);
				resultPaymentStatus = packageInstance.paymentStatus;
				resultInstallmentsPaid = packageInstance.installmentsPaid;
			} else {
				// Branch B — single payment, no installment rows → mark paid under row lock.
				const updated = await context.tenantDb.transaction(
					async (tx: TenantTx) => {
						const [locked] = await tx
							.select({
								id: packageInstances.id,
								paymentStatus: packageInstances.paymentStatus,
								status: packageInstances.status,
								installmentsPaid: packageInstances.installmentsPaid,
							})
							.from(packageInstances)
							.where(eq(packageInstances.id, pkg.id))
							.for("update");
						if (!locked) {
							throw new ORPCError("NOT_FOUND", {
								message: "Package not found",
							});
						}
						// Re-check inside the lock (webhook/another staffer may have won).
						if (
							locked.paymentStatus === "paid" ||
							locked.paymentStatus === "partially_paid"
						) {
							return {
								paymentStatus: locked.paymentStatus,
								installmentsPaid: locked.installmentsPaid,
							};
						}
						if (
							locked.status === "cancelled" ||
							locked.paymentStatus === "refunded"
						) {
							throw new ORPCError("BAD_REQUEST", {
								message: `Cannot confirm payment — package is ${locked.status} / ${locked.paymentStatus}`,
							});
						}
						const now = new Date();
						const [row] = await tx
							.update(packageInstances)
							.set({
								paymentStatus: "paid",
								installmentsPaid: 1,
								paymentMethod: input.paymentMethod,
								updatedAt: now,
							})
							.where(eq(packageInstances.id, pkg.id))
							.returning();
						if (!row) {
							throw new ORPCError("INTERNAL_SERVER_ERROR", {
								message: "Failed to update package payment status",
							});
						}
						// Ledger sync (source-of-truth model): the `payments` table is the
						// money ledger that Sales & Payments reads. If this package is linked
						// to a payment record (created at sale time), flip that record to
						// "succeeded" in the same transaction so the two screens stay
						// consistent. We deliberately do NOT fabricate a brand-new payments
						// row here: off-ledger admin-created packages have no sale, and a
						// hand-built row would miss franchiser-split / platform-fee /
						// e-invoice data that POS computes from tenant config — injecting
						// financially-incomplete records is worse than leaving them off-ledger.
						if (pkg.paymentId) {
							await tx
								.update(payments)
								.set({
									status: "succeeded",
									paymentMethod: input.paymentMethod,
									updatedAt: now,
								})
								.where(
									and(
										eq(payments.id, pkg.paymentId),
										ne(payments.status, "succeeded"),
									),
								);
						}
						await writeAudit(tx, {
							actorUserId: callerUserId,
							actorMemberId: context.member.id,
							actorRole: context.member.role,
							action: "package.payment_confirmed",
							entityType: "package_instance",
							entityId: pkg.id,
							branchId: svc?.branchId ?? undefined,
							summary: `Confirmed ${input.paymentMethod} payment received for package ${pkg.id}`,
							changes: {
								paymentStatus: "paid",
								paymentMethod: input.paymentMethod,
								notes: input.notes ?? null,
								ledgerPaymentId: pkg.paymentId ?? null,
							},
						});
						return {
							paymentStatus: row.paymentStatus,
							installmentsPaid: row.installmentsPaid,
						};
					},
				);
				resultPaymentStatus = updated.paymentStatus;
				resultInstallmentsPaid = updated.installmentsPaid;
			}

			// Post-confirm: the package is now assignable (payment received). Notify
			// branch staff that it's ready for trainer assignment — but only if it is
			// still awaiting assignment (status="pending"). Approval-off packages are
			// already active and need no assignment. Best-effort; never fail the confirm.
			try {
				if (pkg.status === "pending") {
					await notifyStaffOfPendingPackage(context.tenantDb, pkg.id);
				}
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error("confirmPayment post-confirm notification failed:", err);
			}

			return {
				id: pkg.id,
				paymentStatus: resultPaymentStatus,
				installmentsPaid: resultInstallmentsPaid,
				alreadyConfirmed: false,
			};
		}),
};
