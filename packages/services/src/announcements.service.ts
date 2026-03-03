import { eq, and, desc, inArray, lte, gte, isNull, or, sql } from "drizzle-orm";
import { announcements } from "@avantej-core/db/schema/tenant/announcements";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateAnnouncementParams = {
	branchId?: string;
	title: string;
	message: string;
	priority?: "low" | "normal" | "high" | "urgent";
	targetAudience?: "all" | "staff" | "clients";
	startDate?: Date;
	endDate?: Date;
	isPinned?: boolean;
	createdBy: string;
};

export async function listAnnouncements(
	tenantDb: TenantDb,
	params: {
		branchId?: string;
		isActive?: boolean;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
): Promise<(typeof announcements.$inferSelect)[]> {
	const { branchId, isActive, accessibleNodeIds, limit = 50, offset = 0 } = params;

	const conditions = [];

	if (branchId !== undefined) {
		conditions.push(eq(announcements.branchId, branchId));
	}

	if (isActive !== undefined) {
		conditions.push(eq(announcements.isActive, isActive));
	}

	if (accessibleNodeIds !== undefined) {
		conditions.push(
			or(
				inArray(announcements.branchId, accessibleNodeIds),
				isNull(announcements.branchId),
			)!,
		);
	}

	return tenantDb
		.select()
		.from(announcements)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function listActiveAnnouncements(
	tenantDb: TenantDb,
	params: {
		accessibleNodeIds: string[];
		memberType?: "staff" | "clients";
		limit?: number;
	},
): Promise<(typeof announcements.$inferSelect)[]> {
	const { accessibleNodeIds, memberType, limit = 50 } = params;

	const now = new Date();

	const conditions = [
		eq(announcements.isActive, true),
		or(isNull(announcements.startDate), lte(announcements.startDate, now))!,
		or(isNull(announcements.endDate), gte(announcements.endDate, now))!,
		or(
			isNull(announcements.branchId),
			inArray(announcements.branchId, accessibleNodeIds),
		)!,
	];

	if (memberType) {
		conditions.push(
			or(
				eq(announcements.targetAudience, "all"),
				eq(announcements.targetAudience, memberType),
			)!,
		);
	}

	const priorityOrder = sql`CASE ${announcements.priority}
		WHEN 'urgent' THEN 4
		WHEN 'high' THEN 3
		WHEN 'normal' THEN 2
		WHEN 'low' THEN 1
		ELSE 0
	END`;

	return tenantDb
		.select()
		.from(announcements)
		.where(and(...conditions))
		.orderBy(
			desc(announcements.isPinned),
			desc(priorityOrder),
			desc(announcements.createdAt),
		)
		.limit(limit);
}

export async function createAnnouncement(
	tenantDb: TenantDb,
	data: CreateAnnouncementParams,
): Promise<typeof announcements.$inferSelect> {
	const [row] = await tenantDb
		.insert(announcements)
		.values({
			branchId: data.branchId ?? null,
			title: data.title,
			message: data.message,
			priority: data.priority ?? "normal",
			targetAudience: data.targetAudience ?? "all",
			startDate: data.startDate ?? null,
			endDate: data.endDate ?? null,
			isActive: true,
			isPinned: data.isPinned ?? false,
			createdBy: data.createdBy,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create announcement");
	}
	return row;
}

export async function updateAnnouncement(
	tenantDb: TenantDb,
	id: string,
	data: Partial<CreateAnnouncementParams & { isActive: boolean }>,
): Promise<typeof announcements.$inferSelect> {
	const [row] = await tenantDb
		.update(announcements)
		.set({
			...(data.branchId !== undefined && { branchId: data.branchId }),
			...(data.title !== undefined && { title: data.title }),
			...(data.message !== undefined && { message: data.message }),
			...(data.priority !== undefined && { priority: data.priority }),
			...(data.targetAudience !== undefined && { targetAudience: data.targetAudience }),
			...(data.startDate !== undefined && { startDate: data.startDate }),
			...(data.endDate !== undefined && { endDate: data.endDate }),
			...(data.isActive !== undefined && { isActive: data.isActive }),
			...(data.isPinned !== undefined && { isPinned: data.isPinned }),
			...(data.createdBy !== undefined && { createdBy: data.createdBy }),
			updatedAt: new Date(),
		})
		.where(eq(announcements.id, id))
		.returning();

	if (!row) {
		throw new Error("Announcement not found");
	}
	return row;
}

export async function deleteAnnouncement(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof announcements.$inferSelect> {
	const [row] = await tenantDb
		.update(announcements)
		.set({
			isActive: false,
			updatedAt: new Date(),
		})
		.where(eq(announcements.id, id))
		.returning();

	if (!row) {
		throw new Error("Announcement not found");
	}
	return row;
}
