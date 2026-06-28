import {
	eq,
	and,
	desc,
	inArray,
	lte,
	gte,
	isNull,
	or,
	sql,
	notExists,
	exists,
} from "drizzle-orm";
import { announcements } from "@avantej-core/db/schema/tenant/announcements";
import { announcementScopes } from "@avantej-core/db/schema/tenant/announcement-scopes";
import { members } from "@avantej-core/db/schema/tenant/members";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { resolveScopeNodeIds } from "./hierarchy-scope";

type TenantDb = NeonDatabase<typeof tenantSchema>;

/**
 * Expand a list of hierarchy node IDs into the full descendant set
 * (including the input nodes themselves) using a recursive CTE.
 * Returns an empty array when called with an empty input.
 */
async function expandDescendantNodeIds(
	tx: TenantDb,
	rootIds: string[],
): Promise<string[]> {
	if (rootIds.length === 0) return [];
	const result = await tx.execute(sql`
		WITH RECURSIVE descendants AS (
			SELECT id FROM hierarchy_nodes WHERE id IN (${sql.join(
				rootIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)})
			UNION
			SELECT hn.id
			FROM hierarchy_nodes hn
			INNER JOIN descendants d ON hn.parent_id = d.id
		)
		SELECT id FROM descendants
	`);
	return result.rows
		.map((row) => row.id)
		.filter((id): id is string => typeof id === "string");
}

/**
 * Fan out announcement notifications to every member whose hierarchy scope
 * falls under the announcement's scope, respecting the announcement's
 * targetAudience. Org-wide announcements (no scoped branches and no
 * branchId) notify all active members. Runs inside an existing tx.
 */
async function dispatchAnnouncementNotifications(
	tx: TenantDb,
	params: {
		announcementId: string;
		title: string;
		message: string;
		priority: "low" | "normal" | "high" | "urgent";
		targetAudience: "all" | "staff" | "clients";
		scopedBranchIds: string[];
		branchId: string | null;
	},
): Promise<void> {
	const rootNodeIds =
		params.scopedBranchIds.length > 0
			? params.scopedBranchIds
			: params.branchId
				? [params.branchId]
				: [];

	const memberConditions = [
		eq(members.status, "active"),
		isNull(members.deletedAt),
	];

	if (rootNodeIds.length > 0) {
		const accessibleNodeIds = await expandDescendantNodeIds(tx, rootNodeIds);
		if (accessibleNodeIds.length === 0) return;
		memberConditions.push(inArray(members.hierarchyScopeId, accessibleNodeIds));
	}

	if (params.targetAudience === "staff") {
		memberConditions.push(inArray(members.role, ["admin", "trainer", "staff"]));
	} else if (params.targetAudience === "clients") {
		memberConditions.push(eq(members.role, "client"));
	}

	const targetMembers = await tx
		.select({ userId: members.userId })
		.from(members)
		.where(and(...memberConditions));

	if (targetMembers.length === 0) return;

	// De-dup userIds defensively (members table has a unique index on user_id,
	// but be safe across edge cases).
	const seen = new Set<string>();
	const rows = targetMembers
		.filter((m) => {
			if (seen.has(m.userId)) return false;
			seen.add(m.userId);
			return true;
		})
		.map((m) => ({
			userId: m.userId,
			type: "system" as const,
			title: params.title,
			message: params.message,
			relatedId: params.announcementId,
			relatedType: "announcement" as const,
		}));

	if (rows.length === 0) return;
	await tx.insert(notifications).values(rows);
}

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
	requiresAcknowledgement?: boolean;
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
	const {
		branchId,
		isActive,
		accessibleNodeIds,
		isAdmin = false,
		limit = 50,
		offset = 0,
	} = params;

	const conditions = [];

	if (branchId !== undefined) {
		// Expand the picked scope node (which may be a non-leaf country/region/
		// state) to its accessible LEAF subtree, instead of matching the column
		// against the node id directly. resolveScopeNodeIds also guards that the
		// picked node is within the caller's accessible ceiling (FORBIDDEN if
		// not), so a non-leaf scope now returns its branches' announcements.
		const scopeIds = await resolveScopeNodeIds(
			tenantDb,
			branchId,
			accessibleNodeIds ?? [],
		);
		if (scopeIds.length > 0) {
			conditions.push(inArray(announcements.branchId, scopeIds));
		}
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
				requiresAcknowledgement: data.requiresAcknowledgement ?? false,
				createdBy: data.createdBy,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create announcement");
		}

		await setAnnouncementScopes(
			tx as unknown as TenantDb,
			row.id,
			data.scopedBranchIds ?? [],
		);

		await dispatchAnnouncementNotifications(tx as unknown as TenantDb, {
			announcementId: row.id,
			title: row.title,
			message: row.message,
			priority: row.priority as "low" | "normal" | "high" | "urgent",
			targetAudience: row.targetAudience as "all" | "staff" | "clients",
			scopedBranchIds: data.scopedBranchIds ?? [],
			branchId: row.branchId ?? null,
		});

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
				...(data.targetAudience !== undefined && {
					targetAudience: data.targetAudience,
				}),
				...(data.startDate !== undefined && { startDate: data.startDate }),
				...(data.endDate !== undefined && { endDate: data.endDate }),
				...(data.isActive !== undefined && { isActive: data.isActive }),
				...(data.isPinned !== undefined && { isPinned: data.isPinned }),
				...(data.requiresAcknowledgement !== undefined && {
					requiresAcknowledgement: data.requiresAcknowledgement,
				}),
				...(data.createdBy !== undefined && { createdBy: data.createdBy }),
				updatedAt: new Date(),
			})
			.where(eq(announcements.id, id))
			.returning();

		if (!row) {
			throw new Error("Announcement not found");
		}

		if (data.scopedBranchIds !== undefined) {
			await setAnnouncementScopes(
				tx as unknown as TenantDb,
				id,
				data.scopedBranchIds,
			);
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
