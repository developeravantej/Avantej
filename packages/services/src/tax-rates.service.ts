import { eq, and, desc, asc } from "drizzle-orm";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateTaxRateParams = {
	name: string;
	code: string;
	rateInBasisPoints: number;
	category?: string;
	isDefault?: boolean;
	effectiveFrom: Date;
	effectiveUntil?: Date;
	description?: string;
};

export async function listTaxRates(
	tenantDb: TenantDb,
	params: { isActive?: boolean; category?: string } = {},
): Promise<(typeof taxRates.$inferSelect)[]> {
	const conditions = [];

	if (params.isActive !== undefined) {
		conditions.push(eq(taxRates.isActive, params.isActive));
	}

	if (params.category !== undefined) {
		conditions.push(eq(taxRates.category, params.category));
	}

	return tenantDb.query.taxRates.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(taxRates.isDefault), asc(taxRates.rateInBasisPoints)],
	});
}

export async function getTaxRateById(
	tenantDb: TenantDb,
	id: string,
): Promise<(typeof taxRates.$inferSelect) | undefined> {
	return tenantDb.query.taxRates.findFirst({
		where: eq(taxRates.id, id),
	});
}

export async function getDefaultTaxRate(
	tenantDb: TenantDb,
): Promise<(typeof taxRates.$inferSelect) | undefined> {
	return tenantDb.query.taxRates.findFirst({
		where: and(eq(taxRates.isDefault, true), eq(taxRates.isActive, true)),
	});
}

export async function createTaxRate(
	tenantDb: TenantDb,
	data: CreateTaxRateParams,
): Promise<typeof taxRates.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		if (data.isDefault) {
			await tx
				.update(taxRates)
				.set({ isDefault: false })
				.where(eq(taxRates.isDefault, true));
		}

		const [row] = await tx
			.insert(taxRates)
			.values({
				name: data.name,
				code: data.code,
				rateInBasisPoints: data.rateInBasisPoints,
				category: data.category ?? "SST",
				isDefault: data.isDefault ?? false,
				isActive: true,
				effectiveFrom: data.effectiveFrom,
				effectiveUntil: data.effectiveUntil,
				description: data.description,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create tax rate");
		}
		return row;
	});
}

export async function updateTaxRate(
	tenantDb: TenantDb,
	id: string,
	data: Partial<CreateTaxRateParams>,
): Promise<typeof taxRates.$inferSelect> {
	const [row] = await tenantDb
		.update(taxRates)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.code !== undefined && { code: data.code }),
			...(data.rateInBasisPoints !== undefined && {
				rateInBasisPoints: data.rateInBasisPoints,
			}),
			...(data.category !== undefined && { category: data.category }),
			...(data.effectiveFrom !== undefined && {
				effectiveFrom: data.effectiveFrom,
			}),
			...(data.effectiveUntil !== undefined && {
				effectiveUntil: data.effectiveUntil,
			}),
			...(data.description !== undefined && {
				description: data.description,
			}),
			updatedAt: new Date(),
		})
		.where(eq(taxRates.id, id))
		.returning();

	if (!row) {
		throw new Error("Tax rate not found");
	}
	return row;
}

export async function setDefaultTaxRate(
	tenantDb: TenantDb,
	id: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof taxRates.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		// Find the current default before clearing it
		const previousDefault = await tx.query.taxRates.findFirst({
			where: and(eq(taxRates.isDefault, true)),
			columns: { id: true },
		});

		await tx
			.update(taxRates)
			.set({ isDefault: false })
			.where(eq(taxRates.isDefault, true));

		const [row] = await tx
			.update(taxRates)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(eq(taxRates.id, id))
			.returning();

		if (!row) {
			throw new Error("Tax rate not found");
		}

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "tax.set_default",
			entityType: "tax_rate",
			entityId: id,
			summary: `Set default tax rate to "${row.name}" (${row.code})`,
			changes: { previousId: previousDefault?.id ?? null, newId: id },
		});

		return row;
	});
}

export async function deactivateTaxRate(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof taxRates.$inferSelect> {
	const existing = await tenantDb.query.taxRates.findFirst({
		where: eq(taxRates.id, id),
	});

	if (!existing) {
		throw new Error("Tax rate not found");
	}

	const [row] = await tenantDb
		.update(taxRates)
		.set({
			isActive: false,
			...(existing.isDefault && { isDefault: false }),
			updatedAt: new Date(),
		})
		.where(eq(taxRates.id, id))
		.returning();

	if (!row) {
		throw new Error("Failed to deactivate tax rate");
	}
	return row;
}
