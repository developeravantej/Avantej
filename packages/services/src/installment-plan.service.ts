import { eq, and, asc } from "drizzle-orm";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateInstallmentPlanParams = {
	code: string;
	name: string;
	numInstallments: number;
	defaultIntervalDays?: number;
	description?: string;
	isDefault?: boolean;
	sortOrder?: number;
	pricePremiumBps?: number;
};

export type UpdateInstallmentPlanParams = {
	name?: string;
	numInstallments?: number;
	defaultIntervalDays?: number;
	description?: string;
	sortOrder?: number;
	pricePremiumBps?: number;
};

export async function listInstallmentPlans(
	tenantDb: TenantDb,
	params: { activeOnly?: boolean } = {},
): Promise<(typeof installmentPlans.$inferSelect)[]> {
	const conditions = [];

	if (params.activeOnly) {
		conditions.push(eq(installmentPlans.isActive, true));
	}

	return tenantDb.query.installmentPlans.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [asc(installmentPlans.sortOrder), asc(installmentPlans.code)],
	});
}

export async function getInstallmentPlanById(
	tenantDb: TenantDb,
	id: string,
): Promise<(typeof installmentPlans.$inferSelect) | undefined> {
	return tenantDb.query.installmentPlans.findFirst({
		where: eq(installmentPlans.id, id),
	});
}

export async function getInstallmentPlanByCode(
	tenantDb: TenantDb,
	code: string,
): Promise<(typeof installmentPlans.$inferSelect) | null> {
	const result = await tenantDb.query.installmentPlans.findFirst({
		where: eq(installmentPlans.code, code),
	});
	return result ?? null;
}

export async function createInstallmentPlan(
	tenantDb: TenantDb,
	data: CreateInstallmentPlanParams,
): Promise<typeof installmentPlans.$inferSelect> {
	if (data.numInstallments < 1) {
		throw new Error("numInstallments must be >= 1");
	}
	if (data.pricePremiumBps !== undefined && (data.pricePremiumBps < 0 || data.pricePremiumBps > 10000)) {
		throw new Error("pricePremiumBps must be between 0 and 10000");
	}

	return tenantDb.transaction(async (tx) => {
		// If this plan is being set as default, clear all existing defaults first
		if (data.isDefault) {
			await tx
				.update(installmentPlans)
				.set({ isDefault: false })
				.where(eq(installmentPlans.isDefault, true));
		}

		const [row] = await tx
			.insert(installmentPlans)
			.values({
				code: data.code,
				name: data.name,
				numInstallments: data.numInstallments,
				defaultIntervalDays: data.defaultIntervalDays ?? 30,
				description: data.description,
				isDefault: data.isDefault ?? false,
				isActive: true,
				sortOrder: data.sortOrder ?? 0,
				pricePremiumBps: data.pricePremiumBps ?? 0,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create installment plan");
		}
		return row;
	});
}

export async function updateInstallmentPlan(
	tenantDb: TenantDb,
	id: string,
	data: UpdateInstallmentPlanParams & { code?: never },
): Promise<typeof installmentPlans.$inferSelect> {
	// `code` is immutable — callers must not pass it; TS enforces via `code?: never`
	if (data.numInstallments !== undefined && data.numInstallments < 1) {
		throw new Error("numInstallments must be >= 1");
	}
	if (data.pricePremiumBps !== undefined && (data.pricePremiumBps < 0 || data.pricePremiumBps > 10000)) {
		throw new Error("pricePremiumBps must be between 0 and 10000");
	}

	const [row] = await tenantDb
		.update(installmentPlans)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.numInstallments !== undefined && {
				numInstallments: data.numInstallments,
			}),
			...(data.defaultIntervalDays !== undefined && {
				defaultIntervalDays: data.defaultIntervalDays,
			}),
			...(data.description !== undefined && {
				description: data.description,
			}),
			...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
			...(data.pricePremiumBps !== undefined && { pricePremiumBps: data.pricePremiumBps }),
			updatedAt: new Date(),
		})
		.where(eq(installmentPlans.id, id))
		.returning();

	if (!row) {
		throw new Error("Installment plan not found");
	}
	return row;
}

export async function setDefaultInstallmentPlan(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof installmentPlans.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		// Clear all existing defaults first (same single-tx pattern as setDefaultTaxRate)
		await tx
			.update(installmentPlans)
			.set({ isDefault: false })
			.where(eq(installmentPlans.isDefault, true));

		const [row] = await tx
			.update(installmentPlans)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(eq(installmentPlans.id, id))
			.returning();

		if (!row) {
			throw new Error("Installment plan not found");
		}
		return row;
	});
}

export async function deactivateInstallmentPlan(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof installmentPlans.$inferSelect> {
	const existing = await tenantDb.query.installmentPlans.findFirst({
		where: eq(installmentPlans.id, id),
	});

	if (!existing) {
		throw new Error("Installment plan not found");
	}

	// Silently clear isDefault if the plan was the current default (mirrors deactivateTaxRate)
	const [row] = await tenantDb
		.update(installmentPlans)
		.set({
			isActive: false,
			...(existing.isDefault && { isDefault: false }),
			updatedAt: new Date(),
		})
		.where(eq(installmentPlans.id, id))
		.returning();

	if (!row) {
		throw new Error("Failed to deactivate installment plan");
	}
	return row;
}
