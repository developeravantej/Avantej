import {
	createPackageInstance,
	createInstallmentSchedule,
} from "@avantej-core/services";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import { notifyStaffOfPendingPackage } from "@avantej-core/services/notification.service";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	sourceSchema,
	paymentStatusSchema,
	statusSchema,
	PACKAGE_APPROVAL_REQUIRED_KEY,
} from "./schemas";

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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"create",
			);

			try {
				// Resolve installment plan from DB if a plan code is provided
				let planRow: typeof installmentPlans.$inferSelect | null = null;
				if (input.paymentPlanType) {
					planRow =
						(await context.tenantDb.query.installmentPlans.findFirst({
							where: and(
								eq(installmentPlans.code, input.paymentPlanType),
								eq(installmentPlans.isActive, true),
							),
						})) ?? null;
					if (!planRow) {
						throw new ORPCError("BAD_REQUEST", {
							message: `Unknown installment plan: ${input.paymentPlanType}`,
						});
					}
				}

				const resolvedInstallmentsTotal = planRow?.numInstallments ?? 1;
				const isInstallmentPlan =
					planRow !== null && planRow.numInstallments > 1;
				// Interval precedence: explicit input overrides plan default
				const effectiveIntervalDays =
					input.installmentIntervalDays ?? planRow?.defaultIntervalDays ?? 30;

				// Apply installment plan price premium. Callers send the BASE/list price;
				// server scales by (10000 + price_premium_bps) / 10000 when a plan with a
				// non-zero premium is selected. See zplan/17-04_14-00_installment-premium/plan.md §4.3.
				const basePrice = input.totalPrice ?? null;
				const pricePremiumBps = planRow?.pricePremiumBps ?? 0;
				const adjustedTotalPrice =
					basePrice != null && pricePremiumBps > 0
						? Math.round((basePrice * (10000 + pricePremiumBps)) / 10000)
						: basePrice;

				// LC-C3: scale tax amount by the same premium so the ledger stays consistent
				const scaledTaxAmount =
					pricePremiumBps > 0 && input.taxAmount
						? Math.round((input.taxAmount * (10000 + pricePremiumBps)) / 10000)
						: (input.taxAmount ?? 0);

				// Build XOR owner — exactly one of clientId / walkInCustomerId must be provided
				const ownerField: { clientId: string } | { walkInCustomerId: string } =
					input.walkInCustomerId
						? { walkInCustomerId: input.walkInCustomerId }
						: { clientId: input.clientId! };

				// Snapshot the customer's name at create time (read-scaling). Best-effort:
				// null is fine — list views fall back to a live lookup when the snapshot is null.
				let customerNameSnapshot: string | null = null;
				if (input.clientId) {
					try {
						const cpDb = getControlPanelDb(context);
						const row = await cpDb
							.select({ name: cpUsers.name })
							.from(cpUsers)
							.where(eq(cpUsers.id, input.clientId))
							.limit(1);
						customerNameSnapshot = row[0]?.name ?? null;
					} catch {
						customerNameSnapshot = null;
					}
				}

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

				// LC-C4: createPackageInstance + createInstallmentSchedule are atomic —
				// both must succeed or both roll back. Pass tx to both calls.
				const created = await context.tenantDb.transaction(async (tx: any) => {
					const instance = await createPackageInstance(tx, {
						serviceId: input.serviceId,
						...ownerField,
						customerName: customerNameSnapshot,
						source: input.source,
						assignedBy: input.assignedBy ?? null,
						purchaseNumber: input.purchaseNumber ?? null,
						paymentId: input.paymentId ?? null,
						totalPrice: adjustedTotalPrice,
						taxAmount: scaledTaxAmount,
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

					// Installment schedule uses instance.totalPrice which already includes any plan price premium.
					// Generate installment schedule if payment plan is an installment plan (numInstallments > 1).
					if (isInstallmentPlan) {
						await createInstallmentSchedule(
							tx,
							{
								packageInstanceId: instance.id,
								creditsTotal: instance.creditsTotal,
								totalPrice: instance.totalPrice ?? 0,
								taxAmount: instance.taxAmount ?? 0,
								installmentsTotal: resolvedInstallmentsTotal,
								intervalDays: effectiveIntervalDays,
								purchaseDate: new Date(),
							},
							{ inTransaction: true },
						);
					}

					return instance;
				});

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
						error instanceof Error
							? error.message
							: "Failed to create package instance",
				});
			}
		}),
};
