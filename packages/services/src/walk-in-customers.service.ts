import { eq, and, desc, inArray, ilike, or, isNull } from "drizzle-orm";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateWalkInCustomerParams = {
	name: string;
	email?: string;
	phone?: string;
	branchId?: string;
	dateOfBirth?: Date;
	gender?: string;
	address?: string;
	emergencyContactName?: string;
	emergencyContactPhone?: string;
	medicalNotes?: string;
	notes?: string;
	createdBy: string;
};

export async function listWalkInCustomers(
	tenantDb: TenantDb,
	params: {
		branchId?: string;
		search?: string;
		isActive?: boolean;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
) {
	const {
		branchId,
		search,
		isActive,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	const conditions = [];

	if (isActive !== undefined) {
		conditions.push(eq(walkInCustomers.isActive, isActive));
	}

	if (branchId) {
		conditions.push(eq(walkInCustomers.branchId, branchId));
	}

	if (search) {
		conditions.push(
			or(
				ilike(walkInCustomers.name, `%${search}%`),
				ilike(walkInCustomers.email, `%${search}%`),
				ilike(walkInCustomers.phone, `%${search}%`),
			),
		);
	}

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(
			or(
				inArray(walkInCustomers.branchId, accessibleNodeIds),
				isNull(walkInCustomers.branchId),
			),
		);
	}

	return tenantDb
		.select()
		.from(walkInCustomers)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(walkInCustomers.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function getWalkInCustomerById(tenantDb: TenantDb, id: string) {
	const [row] = await tenantDb
		.select()
		.from(walkInCustomers)
		.where(eq(walkInCustomers.id, id))
		.limit(1);

	return row;
}

export async function createWalkInCustomer(
	tenantDb: TenantDb,
	data: CreateWalkInCustomerParams,
) {
	const [row] = await tenantDb
		.insert(walkInCustomers)
		.values({
			name: data.name,
			email: data.email ?? null,
			phone: data.phone ?? null,
			branchId: data.branchId ?? null,
			dateOfBirth: data.dateOfBirth ?? null,
			gender: data.gender ?? null,
			address: data.address ?? null,
			emergencyContactName: data.emergencyContactName ?? null,
			emergencyContactPhone: data.emergencyContactPhone ?? null,
			medicalNotes: data.medicalNotes ?? null,
			notes: data.notes ?? null,
			createdBy: data.createdBy,
			isActive: true,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create walk-in customer");
	}
	return row;
}

export async function updateWalkInCustomer(
	tenantDb: TenantDb,
	id: string,
	data: Partial<Omit<CreateWalkInCustomerParams, "createdBy">>,
) {
	const [row] = await tenantDb
		.update(walkInCustomers)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.email !== undefined && { email: data.email }),
			...(data.phone !== undefined && { phone: data.phone }),
			...(data.branchId !== undefined && { branchId: data.branchId }),
			...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth }),
			...(data.gender !== undefined && { gender: data.gender }),
			...(data.address !== undefined && { address: data.address }),
			...(data.emergencyContactName !== undefined && {
				emergencyContactName: data.emergencyContactName,
			}),
			...(data.emergencyContactPhone !== undefined && {
				emergencyContactPhone: data.emergencyContactPhone,
			}),
			...(data.medicalNotes !== undefined && {
				medicalNotes: data.medicalNotes,
			}),
			...(data.notes !== undefined && { notes: data.notes }),
			updatedAt: new Date(),
		})
		.where(eq(walkInCustomers.id, id))
		.returning();

	if (!row) {
		throw new Error("Walk-in customer not found");
	}
	return row;
}

export async function deactivateWalkInCustomer(
	tenantDb: TenantDb,
	id: string,
) {
	const [row] = await tenantDb
		.update(walkInCustomers)
		.set({
			isActive: false,
			updatedAt: new Date(),
		})
		.where(eq(walkInCustomers.id, id))
		.returning();

	if (!row) {
		throw new Error("Walk-in customer not found");
	}
	return row;
}
