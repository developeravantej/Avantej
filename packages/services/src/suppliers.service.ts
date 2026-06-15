import { eq, and, asc, ilike, inArray } from "drizzle-orm";
import { suppliers } from "@avantej-core/db/schema/tenant/suppliers";
import { purchaseOrders } from "@avantej-core/db/schema/tenant/purchase-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CreateSupplierParams = {
	name: string;
	description?: string;
	accountNumber?: string;
	paymentTerms?: string;
	contactPerson?: string;
	contactPhone?: string;
	officePhone?: string;
	email?: string;
	website?: string;
	barcode?: string;
	isActive?: boolean;
};

export type UpdateSupplierParams = Partial<CreateSupplierParams>;

export async function listSuppliers(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { isActive?: boolean; search?: string } = {},
): Promise<(typeof suppliers.$inferSelect)[]> {
	const { isActive, search } = params;

	const conditions = [];
	if (isActive !== undefined) {
		conditions.push(eq(suppliers.isActive, isActive));
	}
	if (search) {
		conditions.push(ilike(suppliers.name, `%${search}%`));
	}

	return tenantDb.query.suppliers.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [asc(suppliers.name)],
	});
}

export async function getSupplierById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof suppliers.$inferSelect | null> {
	const row = await tenantDb.query.suppliers.findFirst({
		where: eq(suppliers.id, id),
	});
	return row ?? null;
}

export async function createSupplier(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateSupplierParams,
): Promise<typeof suppliers.$inferSelect> {
	const [row] = await tenantDb
		.insert(suppliers)
		.values({
			name: params.name,
			description: params.description ?? null,
			accountNumber: params.accountNumber ?? null,
			paymentTerms: params.paymentTerms ?? null,
			contactPerson: params.contactPerson ?? null,
			contactPhone: params.contactPhone ?? null,
			officePhone: params.officePhone ?? null,
			email: params.email ?? null,
			website: params.website ?? null,
			barcode: params.barcode ?? null,
			isActive: params.isActive ?? true,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create supplier");
	}
	return row;
}

export async function updateSupplier(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateSupplierParams,
): Promise<typeof suppliers.$inferSelect> {
	const [row] = await tenantDb
		.update(suppliers)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.description !== undefined && {
				description: params.description,
			}),
			...(params.accountNumber !== undefined && {
				accountNumber: params.accountNumber,
			}),
			...(params.paymentTerms !== undefined && {
				paymentTerms: params.paymentTerms,
			}),
			...(params.contactPerson !== undefined && {
				contactPerson: params.contactPerson,
			}),
			...(params.contactPhone !== undefined && {
				contactPhone: params.contactPhone,
			}),
			...(params.officePhone !== undefined && {
				officePhone: params.officePhone,
			}),
			...(params.email !== undefined && { email: params.email }),
			...(params.website !== undefined && { website: params.website }),
			...(params.barcode !== undefined && { barcode: params.barcode }),
			...(params.isActive !== undefined && { isActive: params.isActive }),
			updatedAt: new Date(),
		})
		.where(eq(suppliers.id, id))
		.returning();

	if (!row) {
		throw new Error("Supplier not found");
	}
	return row;
}

export async function deactivateSupplier(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof suppliers.$inferSelect> {
	// Block deactivation while the supplier has open purchase orders.
	const openPo = await tenantDb.query.purchaseOrders.findFirst({
		where: and(
			eq(purchaseOrders.supplierId, id),
			inArray(purchaseOrders.status, [
				"approved",
				"ordered",
				"partially_received",
			]),
		),
		columns: { id: true },
	});
	if (openPo) {
		throw new Error(
			"Cannot deactivate supplier with active purchase orders (approved, ordered, or partially received)",
		);
	}

	const [row] = await tenantDb
		.update(suppliers)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(suppliers.id, id))
		.returning();

	if (!row) {
		throw new Error("Supplier not found");
	}
	return row;
}
