import { eq, and, desc, sql, count } from "drizzle-orm";
import {
	promotions,
	promotionUsages,
} from "@avantej-core/db/schema/tenant/promotions";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";
import { calculatePromoDiscount } from "./money-math";

export class PromoValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PromoValidationError";
	}
}

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreatePromotionParams = {
	code: string;
	name: string;
	description?: string;
	type: "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y";
	value: number;
	minimumOrderAmount?: number;
	maximumDiscount?: number;
	usageLimit?: number;
	perCustomerLimit?: number;
	validFrom: Date;
	validUntil?: Date;
	isActive?: boolean;
	branchId?: string;
	applicableProductIds?: string[];
	applicableServiceIds?: string[];
	createdBy: string;
};

export async function listPromotions(
	tenantDb: TenantDb,
	params: {
		isActive?: boolean;
		type?: string;
		branchId?: string;
		limit?: number;
		offset?: number;
	} = {},
) {
	const { isActive, type, branchId, limit = 50, offset = 0 } = params;

	const conditions = [];

	if (isActive !== undefined) {
		conditions.push(eq(promotions.isActive, isActive));
	}

	if (type) {
		conditions.push(
			eq(
				promotions.type,
				type as "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y",
			),
		);
	}

	if (branchId) {
		conditions.push(eq(promotions.branchId, branchId));
	}

	return tenantDb
		.select()
		.from(promotions)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(promotions.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function validatePromoCode(
	tenantDb: TenantDb,
	code: string,
	params: {
		customerId?: string;
		orderAmount: number;
		productIds?: string[];
		serviceIds?: string[];
		branchId?: string;
	},
) {
	// 1. Find promotion by code with a row-level lock to prevent concurrent
	//    usage-count races (BE-C2). .for("update") is a no-op outside a
	//    transaction so non-transactional callers are unaffected.
	const lockedPromotion = await tenantDb
		.select()
		.from(promotions)
		.where(sql`lower(${promotions.code}) = lower(${code})`)
		.for("update")
		.then((rows) => rows[0] ?? null);

	if (!lockedPromotion) {
		throw new PromoValidationError("Promotion code not found.");
	}

	const promotion = lockedPromotion;

	// 2. Check isActive
	if (!promotion.isActive) {
		throw new PromoValidationError("Promotion is not active.");
	}

	const now = new Date();

	// 3. Check validFrom
	if (promotion.validFrom > now) {
		throw new PromoValidationError("Promotion not yet valid.");
	}

	// 4. Check validUntil
	if (promotion.validUntil && promotion.validUntil < now) {
		throw new PromoValidationError("Promotion has expired.");
	}

	// 5. Check global usage limit
	if (
		promotion.usageLimit !== null &&
		promotion.usageCount >= promotion.usageLimit
	) {
		throw new PromoValidationError("Promotion usage limit reached.");
	}

	// 6. Check per-customer limit — skipped when customerId is not provided (BE-M2)
	if (params.customerId) {
		const [customerUsage] = await tenantDb
			.select({ usageCount: count() })
			.from(promotionUsages)
			.where(
				and(
					eq(promotionUsages.promotionId, promotion.id),
					eq(promotionUsages.customerId, params.customerId),
				),
			);

		const perCustomerLimit = promotion.perCustomerLimit ?? 1;
		if (customerUsage && customerUsage.usageCount >= perCustomerLimit) {
			throw new PromoValidationError("You have already used this promotion.");
		}
	}

	// 7. Check minimum order amount
	if (params.orderAmount < (promotion.minimumOrderAmount ?? 0)) {
		throw new PromoValidationError("Order amount too low for this promotion.");
	}

	// 7a. Check branch scope (F-CRM-06). A null promotion.branchId is org-wide
	//     and applies to any branch; a non-null branchId must match exactly.
	if (promotion.branchId !== null && params.branchId !== promotion.branchId) {
		throw new PromoValidationError("Promotion is not valid for this branch.");
	}

	// 7b. Check applicable product/service scope (F-CRM-03). When either
	//     applicable list is non-empty, the order must contain at least one item
	//     from the matching set. Empty/null lists = applies to everything.
	const applicableProductIds = promotion.applicableProductIds ?? [];
	const applicableServiceIds = promotion.applicableServiceIds ?? [];
	const isProductScoped = applicableProductIds.length > 0;
	const isServiceScoped = applicableServiceIds.length > 0;

	if (isProductScoped || isServiceScoped) {
		const orderProductIds = params.productIds ?? [];
		const orderServiceIds = params.serviceIds ?? [];

		const productMatch =
			isProductScoped &&
			orderProductIds.some((id) => applicableProductIds.includes(id));
		const serviceMatch =
			isServiceScoped &&
			orderServiceIds.some((id) => applicableServiceIds.includes(id));

		if (!productMatch && !serviceMatch) {
			throw new PromoValidationError(
				"Promotion does not apply to any item in this order.",
			);
		}
	}

	// 8. Calculate discount amount (pure helper — see money-math.ts / .test.ts)
	const discountAmount = calculatePromoDiscount({
		type: promotion.type,
		value: promotion.value,
		orderAmount: params.orderAmount,
		maximumDiscount: promotion.maximumDiscount,
	});

	// 9. Return result
	return { promotion, discountAmount };
}

export async function applyPromotion(
	tenantDb: TenantDb,
	promotionId: string,
	data: {
		customerId: string;
		salesOrderId: string;
		discountAmount: number;
	},
) {
	return tenantDb.transaction(async (tx) => {
		// Re-validate isActive inside the transaction to close the TOCTOU window
		// between an earlier validatePromoCode call and this apply step (SP-03).
		const [current] = await tx
			.select({ isActive: promotions.isActive })
			.from(promotions)
			.where(eq(promotions.id, promotionId))
			.for("update");

		if (!current) {
			throw new Error("PROMO_NOT_FOUND: Promotion not found");
		}

		if (!current.isActive) {
			throw new Error("PROMO_INACTIVE: Promotion code is no longer active");
		}

		// Atomic check-and-increment of the global usage limit (F-CRM-04). The
		// conditional WHERE makes the limit enforcement concurrency-safe: only one
		// of N racing transactions can take the final slot. 0 rows affected means
		// the limit was already reached, so we reject before recording usage.
		const [updated] = await tx
			.update(promotions)
			.set({
				usageCount: sql`${promotions.usageCount} + 1`,
			})
			.where(
				and(
					eq(promotions.id, promotionId),
					sql`(${promotions.usageLimit} IS NULL OR ${promotions.usageCount} < ${promotions.usageLimit})`,
				),
			)
			.returning();

		if (!updated) {
			throw new Error("PROMO_LIMIT_REACHED: Promotion usage limit reached");
		}

		await tx.insert(promotionUsages).values({
			promotionId,
			customerId: data.customerId,
			salesOrderId: data.salesOrderId,
			discountAmount: data.discountAmount,
		});

		return updated;
	});
}

export async function createPromotion(
	tenantDb: TenantDb,
	data: CreatePromotionParams,
	actor: { userId: string; memberId: string; role: string },
) {
	return tenantDb.transaction(async (tx) => {
		const [row] = await tx
			.insert(promotions)
			.values({
				code: data.code,
				name: data.name,
				description: data.description ?? null,
				type: data.type,
				value: data.value,
				minimumOrderAmount: data.minimumOrderAmount ?? 0,
				maximumDiscount: data.maximumDiscount ?? null,
				usageLimit: data.usageLimit ?? null,
				usageCount: 0,
				perCustomerLimit: data.perCustomerLimit ?? 1,
				validFrom: data.validFrom,
				validUntil: data.validUntil ?? null,
				isActive: data.isActive ?? true,
				branchId: data.branchId ?? null,
				applicableProductIds: data.applicableProductIds ?? null,
				applicableServiceIds: data.applicableServiceIds ?? null,
				createdBy: data.createdBy,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create promotion");
		}

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "promotion.create",
			entityType: "promotion",
			entityId: row.id,
			branchId: data.branchId,
			summary: `Created promotion "${data.name}" (code: ${data.code})`,
			changes: {
				code: data.code,
				name: data.name,
				type: data.type,
				value: data.value,
			},
		});

		return row;
	});
}

export async function updatePromotion(
	tenantDb: TenantDb,
	id: string,
	data: Partial<CreatePromotionParams>,
) {
	const [row] = await tenantDb
		.update(promotions)
		.set({
			...(data.code !== undefined && { code: data.code }),
			...(data.name !== undefined && { name: data.name }),
			...(data.description !== undefined && { description: data.description }),
			...(data.type !== undefined && { type: data.type }),
			...(data.value !== undefined && { value: data.value }),
			...(data.minimumOrderAmount !== undefined && {
				minimumOrderAmount: data.minimumOrderAmount,
			}),
			...(data.maximumDiscount !== undefined && {
				maximumDiscount: data.maximumDiscount,
			}),
			...(data.usageLimit !== undefined && { usageLimit: data.usageLimit }),
			...(data.perCustomerLimit !== undefined && {
				perCustomerLimit: data.perCustomerLimit,
			}),
			...(data.validFrom !== undefined && { validFrom: data.validFrom }),
			...(data.validUntil !== undefined && { validUntil: data.validUntil }),
			...(data.isActive !== undefined && { isActive: data.isActive }),
			...(data.branchId !== undefined && { branchId: data.branchId }),
			...(data.applicableProductIds !== undefined && {
				applicableProductIds: data.applicableProductIds,
			}),
			...(data.applicableServiceIds !== undefined && {
				applicableServiceIds: data.applicableServiceIds,
			}),
			updatedAt: new Date(),
		})
		.where(eq(promotions.id, id))
		.returning();

	if (!row) {
		throw new Error("Promotion not found");
	}
	return row;
}

export async function deactivatePromotion(
	tenantDb: TenantDb,
	id: string,
	actor: { userId: string; memberId: string; role: string },
) {
	return tenantDb.transaction(async (tx) => {
		const [row] = await tx
			.update(promotions)
			.set({
				isActive: false,
				updatedAt: new Date(),
			})
			.where(eq(promotions.id, id))
			.returning();

		if (!row) {
			throw new Error("Promotion not found");
		}

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "promotion.deactivate",
			entityType: "promotion",
			entityId: id,
			branchId: row.branchId ?? undefined,
			summary: `Deactivated promotion "${row.name}" (code: ${row.code})`,
			changes: { code: row.code, name: row.name },
		});

		return row;
	});
}
