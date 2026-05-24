/**
 * Package Instances Router
 *
 * API endpoints for package instances (client assignments/purchases).
 * getActiveForClient / listForUser: client view (session user). create: staff or purchase flow.
 */

import {
  listPackageInstancesForClient,
  getPackageInstanceById,
  createPackageInstance,
  createInstallmentSchedule,

  getPackageInstanceStatusHistory,
  cancelPackageInstance,
  freezePackageInstance,
  unfreezePackageInstance,
  extendPackageInstance,
} from "@avantej-core/services";
import { listMemberships, listAssignedToMember } from "@avantej-core/services/package-instance.service";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import {
  notifyStaffOfPendingPackage,
  notifyCustomerPackageAssigned,
  notifyCustomerPackageRejected,
  clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { services } from "@avantej-core/db/schema/tenant/services";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { user, user as cpUsers } from "@avantej-core/db/schema/auth";
import { desc, and, eq, inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

const sourceSchema = z.enum(["assigned", "purchased"]);
const paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded", "partially_paid"]);
const statusSchema = z.enum([
  "pending",
  "active",
  "frozen",
  "completed",
  "expired",
  "exhausted",
  "cancelled",
]);

// Org setting that gates customer-purchased packages behind an admin/trainer
// approval. When "true" (default), `source: "purchased"` packages start in
// `status: "pending"` and require trainer assignment before being usable.
const PACKAGE_APPROVAL_REQUIRED_KEY = "package_approval.required";

export const packageInstancesCreateProcedures = {
	create: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        serviceId: z.string().uuid(),
        clientId: z.string().optional(),
        walkInCustomerId: z.string().uuid().optional(),
        source: sourceSchema,
        assignedBy: z.string().nullable().optional(),
        purchaseNumber: z.string().nullable().optional(),
        paymentId: z.string().uuid().nullable().optional(),
        totalPrice: z.number().int().min(0).nullable().optional(),
        taxAmount: z.number().int().min(0).optional(),
        paymentStatus: paymentStatusSchema.optional(),
        paymentMethod: z.string().nullable().optional(),
        eSignature: z.string().nullable().optional(),
        termsAgreedAt: z.string().datetime().nullable().optional(),
        creditsTotal: z.number().int().min(0),
        creditsUsed: z.number().int().min(0).optional(),
        startsAt: z.string().datetime(),
        expiresAt: z.string().datetime(),
        status: statusSchema.optional(),
        remark: z.string().nullable().optional(),
        paymentPlanType: z.string().nullable().optional(),
        installmentIntervalDays: z.number().int().min(1).optional(),
        preferredTrainerId: z.string().uuid().nullable().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "create")

      try {
        // Resolve installment plan from DB if a plan code is provided
        let planRow: typeof installmentPlans.$inferSelect | null = null;
        if (input.paymentPlanType) {
          planRow = await context.tenantDb.query.installmentPlans.findFirst({
            where: and(
              eq(installmentPlans.code, input.paymentPlanType),
              eq(installmentPlans.isActive, true),
            ),
          }) ?? null;
          if (!planRow) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Unknown installment plan: ${input.paymentPlanType}`,
            });
          }
        }

        const resolvedInstallmentsTotal = planRow?.numInstallments ?? 1;
        const isInstallmentPlan = planRow !== null && planRow.numInstallments > 1;
        // Interval precedence: explicit input overrides plan default
        const effectiveIntervalDays = input.installmentIntervalDays ?? planRow?.defaultIntervalDays ?? 30;

        // Apply installment plan price premium. Callers send the BASE/list price;
        // server scales by (10000 + price_premium_bps) / 10000 when a plan with a
        // non-zero premium is selected. See zplan/17-04_14-00_installment-premium/plan.md §4.3.
        const basePrice = input.totalPrice ?? null;
        const adjustedTotalPrice =
          basePrice != null && planRow && planRow.pricePremiumBps > 0
            ? Math.round((basePrice * (10000 + planRow.pricePremiumBps)) / 10000)
            : basePrice;

        // Build XOR owner — exactly one of clientId / walkInCustomerId must be provided
        const ownerField: { clientId: string } | { walkInCustomerId: string } =
          input.walkInCustomerId
            ? { walkInCustomerId: input.walkInCustomerId }
            : { clientId: input.clientId! };

        // Approval gate: customer-purchased packages start in `pending` status
        // when the org setting is enabled. Staff-assigned packages bypass.
        // Default: gate ON ("true") if the setting hasn't been written yet.
        let resolvedStatus = input.status;
        if (input.source === "purchased") {
          const gateValue = await getSetting(
            context.tenantDb,
            PACKAGE_APPROVAL_REQUIRED_KEY,
          );
          const gateEnabled = (gateValue ?? "true") === "true";
          if (gateEnabled) {
            resolvedStatus = "pending";
          }
        }

        const created = await createPackageInstance(context.tenantDb, {
          serviceId: input.serviceId,
          ...ownerField,
          source: input.source,
          assignedBy: input.assignedBy ?? null,
          purchaseNumber: input.purchaseNumber ?? null,
          paymentId: input.paymentId ?? null,
          totalPrice: adjustedTotalPrice,
          taxAmount: input.taxAmount ?? 0,
          paymentStatus: input.paymentStatus ?? "pending",
          paymentMethod: input.paymentMethod ?? null,
          eSignature: input.eSignature ?? null,
          termsAgreedAt: input.termsAgreedAt
            ? new Date(input.termsAgreedAt)
            : null,
          creditsTotal: input.creditsTotal,
          creditsUsed: input.creditsUsed ?? 0,
          startsAt: new Date(input.startsAt),
          expiresAt: new Date(input.expiresAt),
          status: resolvedStatus,
          remark: input.remark ?? null,
          paymentPlanType: input.paymentPlanType ?? null,
          installmentsTotal: resolvedInstallmentsTotal,
          installmentsPaid: 0,
          creditsUnlocked: isInstallmentPlan ? 0 : null,
          preferredTrainerId: input.preferredTrainerId ?? null,
        });

        // Installment schedule uses created.totalPrice which already includes any plan price premium
        // Generate installment schedule if payment plan is an installment plan (numInstallments > 1)
        if (isInstallmentPlan) {
          await createInstallmentSchedule(context.tenantDb, {
            packageInstanceId: created.id,
            creditsTotal: created.creditsTotal,
            totalPrice: created.totalPrice ?? 0,
            taxAmount: created.taxAmount ?? 0,
            installmentsTotal: resolvedInstallmentsTotal,
            intervalDays: effectiveIntervalDays,
            purchaseDate: new Date(),
          });
        }

        // Fan out notifications to branch admins + trainers when the package
        // landed in `pending` status (gate enabled + customer purchase).
        if (created.status === "pending") {
          try {
            await notifyStaffOfPendingPackage(context.tenantDb, created.id);
          } catch (err) {
            // Non-critical — log but don't fail the purchase.
            // eslint-disable-next-line no-console
            console.error(
              `notifyStaffOfPendingPackage failed for package ${created.id}:`,
              err,
            );
          }
        }

        return created;
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error ? error.message : "Failed to create package instance",
        });
      }
    })
};
