/**
 * Memberships Service
 *
 * Read-side queries over package_instances for membership-related dashboard widgets.
 */

import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface ExpiringMembershipRow {
	packageInstanceId: string;
	clientId: string;
	memberName: string;
	serviceName: string;
	expiresAt: Date;
	daysUntilExpiry: number;
	creditsRemaining: number;
}

export async function listExpiringMemberships(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: {
		within: 7 | 30;
		accessibleNodeIds?: string[]; // optional — package_instances has no branch column in this schema
	},
): Promise<{ rows: ExpiringMembershipRow[]; total: number }> {
	const { within } = params;

	const now = new Date();
	const threshold = new Date(now.getTime() + within * 24 * 60 * 60 * 1000);

	const where = and(
		eq(packageInstances.status, "active"),
		gte(packageInstances.expiresAt, now),
		lte(packageInstances.expiresAt, threshold),
		sql`${packageInstances.creditsRemaining} >= 0`,
	);

	// Count first (for the widget badge)
	const countResult = await tenantDb
		.select({ total: sql<number>`count(*)::int` })
		.from(packageInstances)
		.where(where);
	const total = countResult[0]?.total ?? 0;

	if (total === 0) {
		return { rows: [], total: 0 };
	}

	// Fetch top 20 rows, joining service name
	const raw = await tenantDb
		.select({
			id: packageInstances.id,
			clientId: packageInstances.clientId,
			serviceName: services.name,
			expiresAt: packageInstances.expiresAt,
			creditsRemaining: packageInstances.creditsRemaining,
		})
		.from(packageInstances)
		.leftJoin(services, eq(packageInstances.serviceId, services.id))
		.where(where)
		.orderBy(asc(packageInstances.expiresAt))
		.limit(20);

	// Batch-resolve member display names from control panel (users table)
	const memberIds = [
		...new Set(
			raw.map((r) => r.clientId).filter((c): c is string => !!c),
		),
	];
	const nameMap = new Map<string, string>();

	if (memberIds.length > 0) {
		try {
			const userRows = await controlPanelDb
				.select({ id: user.id, name: user.name, email: user.email })
				.from(user)
				.where(inArray(user.id, memberIds));
			for (const u of userRows) {
				nameMap.set(u.id, u.name || u.email || "Unknown member");
			}
		} catch {
			// best-effort
		}
	}

	const rows: ExpiringMembershipRow[] = raw.map((r) => {
		const expiresAt = r.expiresAt;
		const daysUntilExpiry = Math.max(
			0,
			Math.ceil(
				(expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
			),
		);
		return {
			packageInstanceId: r.id,
			clientId: r.clientId ?? "",
			memberName: nameMap.get(r.clientId ?? "") ?? "Unknown member",
			serviceName: r.serviceName ?? "Unknown service",
			expiresAt,
			daysUntilExpiry,
			creditsRemaining: r.creditsRemaining,
		};
	});

	return { rows, total };
}
