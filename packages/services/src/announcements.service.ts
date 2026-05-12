import { eq, and, desc, inArray, lte, gte, isNull, or, sql, notExists, exists } from "drizzle-orm";
import { announcements } from "@avantej-core/db/schema/tenant/announcements";
import { announcementScopes } from "@avantej-core/db/schema/tenant/announcement-scopes";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type AnnouncementWithScopes = typeof announcements.$inferSelect & {
	scopedBranchIds: string[];
};

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
	scopedBranchIds?: string[];
};

function buildScopeFilter(
	tenantDb: TenantDb,
	isAdmin: boolean,
	accessibleNodeIds: string[],
) {
	if (isAdmin) return undefined;

	const notExistsClause = notExists(
		tenantDb
			.select()
			.from(announcementScopes)
			.where(eq(announcementScopes.announcementId, announcements.id)),
	);

	if (accessibleNodeIds.length === 0) {
		return notExistsClause;
	}

	return or(
		notExistsClause,
		exists(
			tenantDb
				.select()
				.from(announcementScopes)
				.where(
					and(
						eq(announcementScopes.announcementId, announcements.id),
						inArray(announcementScopes.branchId, accessibleNodeIds),
					),
				),
		),
	);
}

async function enrichWithScopes(
	tenantDb: TenantDb,
	rows: (typeof announcements.$inferSelect)[],
): Promise<AnnouncementWithScopes[]> {
	const ids = rows.map((r) => r.id);
	const scopes =
		ids.length > 0
			? await tenantDb
					.select()
					.from(announcementScopes)
					.where(inArray(announcementScopes.announcementId, ids))
			: [];

	const scopeMap = new Map<string, string[]>();
	for (const scope of scopes) {
		const existing = scopeMap.get(scope.announcementId) ?? [];
		existing.push(scope.branchId);
		scopeMap.set(scope.announcementId, existing);
	}

	return rows.map((r) => ({ ...r, scopedBranchIds: scopeMap.get(r.id) ?? [] }));
}

async function setAnnouncementScopes(
	tx: TenantDb,
	announcementId: string,
	scopedBranchIds: string[],
): Promise<void> {
	await tx
		.delete(announcementScopes)
		.where(eq(announcementScopes.announcementId, announcementId));

	if (scopedBranchIds.length > 0) {
		await tx.insert(announcementScopes).values(
			scopedBranchIds.map((branchId) => ({
				announcementId,
				branchId,
			})),
		);
	}
}

export async function listAnnouncements(
	tenantDb: TenantDb,
	params: {
		branchId?: string;
		isActive?: boolean;
		accessibleNodeIds?: string[];
		isAdmin?: boolean;
		limit?: number;
		offset?: number;
	} = {},
): Promise<AnnouncementWithScopes[]> {
	const { branchId, isActive, accessibleNodeIds, isAdmin = false, limit = 50, offset = 0 } = params;

	const conditions = [];

	if (branchId !== undefined) {
		conditions.push(eq(announcements.branchId, branchId));
	}

	if (isActive !== undefined) {
		conditions.push(eq(announcements.isActive, isActive));
	}

	if (accessibleNodeIds !== undefined) {
		const scopeFilter = buildScopeFilter(tenantDb, isAdmin, accessibleNodeIds);
		if (scopeFilter !== undefined) {
			conditions.push(scopeFilter);
		}
	}

	const rows = await tenantDb
		.select()
		.from(announcements)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
		.limit(limit)
		.offset(offset);

	return enrichWithScopes(tenantDb, rows);
}

export async function listActiveAnnouncements(
	tenantDb: TenantDb,
	params: {
		accessibleNodeIds: string[];
		isAdmin?: boolean;
		memberType?: "staff" | "clients";
		limit?: number;
	},
): Promise<AnnouncementWithScopes[]> {
	const { accessibleNodeIds, isAdmin = false, memberType, limit = 50 } = params;

	const now = new Date();

	const conditions = [
		eq(announcements.isActive, true),
		or(isNull(announcements.startDate), lte(announcements.startDate, now))!,
		or(isNull(announcements.endDate), gte(announcements.endDate, now))!,
	];

	const scopeFilter = buildScopeFilter(tenantDb, isAdmin, accessibleNodeIds);
	if (scopeFilter !== undefined) {
		conditions.push(scopeFilter);
	}

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

	const rows = await tenantDb
		.select()
		.from(announcements)
		.where(and(...conditions))
		.orderBy(
			desc(announcements.isPinned),
			desc(priorityOrder),
			desc(announcements.createdAt),
		)
		.limit(limit);

	return enrichWithScopes(tenantDb, rows);
}

export async function createAnnouncement(
	tenantDb: TenantDb,
	data: CreateAnnouncementParams,
): Promise<AnnouncementWithScopes> {
	return tenantDb.transaction(async (tx) => {
		const [row] = await tx
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

		await setAnnouncementScopes(tx as unknown as TenantDb, row.id, data.scopedBranchIds ?? []);

		return { ...row, scopedBranchIds: data.scopedBranchIds ?? [] };
	});
}

export async function updateAnnouncement(
	tenantDb: TenantDb,
	id: string,
	data: Partial<CreateAnnouncementParams & { isActive: boolean }>,
): Promise<AnnouncementWithScopes> {
	return tenantDb.transaction(async (tx) => {
		const [row] = await tx
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

		if (data.scopedBranchIds !== undefined) {
			await setAnnouncementScopes(tx as unknown as TenantDb, id, data.scopedBranchIds);
		}

		const scopedBranchIds =
			data.scopedBranchIds !== undefined
				? data.scopedBranchIds
				: (
						await (tx as unknown as TenantDb)
							.select()
							.from(announcementScopes)
							.where(eq(announcementScopes.announcementId, id))
					).map((s) => s.branchId);

		return { ...row, scopedBranchIds };
	});
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
