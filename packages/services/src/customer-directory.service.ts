/**
 * Customer Directory Service
 *
 * Provides paginated list and detail views for registered customers (members with role='client').
 * Cross-DB enrichment (name/email from control panel) is done in a single batch query.
 */

import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;
type TenantDb = NeonDatabase<typeof tenantSchema>;

export interface CustomerDirectoryRow {
	memberId: string;
	userId: string;
	name: string;
	email: string;
	phone: string | null;
	hierarchyScopeId: string;
	branchName: string | null;
	activePackageCount: number;
	lifetimeValueCents: number;
	outstandingBalanceCents: number;
	appointmentCount: number;
	lastVisitAt: Date | null;
	createdAt: Date;
	isDeleted: boolean | null;
}

/**
 * List customers (members with role='client') with aggregated metrics.
 *
 * RBAC: only customers whose hierarchyScopeId is in accessibleNodeIds are returned.
 * Cross-DB enrichment is done as a single batch lookup against the control panel.
 *
 * Note: when `search` is provided, `total` reflects phone-match only (approximate
 * when name/email search is combined with pagination — known v1 limitation).
 */
export async function listCustomerDirectory(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	_organizationId: string,
	params: {
		search?: string;
		branchId?: string;
		accessibleNodeIds: string[];
		limit?: number;
		offset?: number;
		includeDeleted?: boolean;
	},
): Promise<{ rows: CustomerDirectoryRow[]; total: number }> {
	const {
		search,
		branchId,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
		includeDeleted = false,
	} = params;

	if (accessibleNodeIds.length === 0) {
		return { rows: [], total: 0 };
	}

	const searchPattern = search ? `%${search}%` : null;

	// ----------------------------------------------------------------
	// Step 1: fetch aggregated metrics from tenant DB
	// ----------------------------------------------------------------
	// We use raw sql here because Drizzle's query builder does not model
	// COUNT(...) FILTER (WHERE ...) cleanly.
	const aggregationQuery = sql`
		SELECT
			m.id                                                       AS member_id,
			m.user_id                                                  AS user_id,
			m.hierarchy_scope_id                                       AS hierarchy_scope_id,
			m.joined_at                                                AS joined_at,
			cp.phone                                                   AS phone,
			cp.is_deleted                                              AS is_deleted,
			CAST(
				COUNT(DISTINCT pi.id) FILTER (WHERE pi.status = 'active')
			AS INTEGER)                                                AS active_package_count,
			COALESCE(
				SUM(p.total_amount) FILTER (WHERE p.status = 'succeeded'), 0
			)::INTEGER                                                 AS lifetime_value_cents,
			COALESCE(
				SUM(i.amount + COALESCE(i.tax_amount, 0))
				FILTER (WHERE i.status IN ('pending', 'overdue')), 0
			)::INTEGER                                                 AS outstanding_balance_cents,
			CAST(
				COUNT(DISTINCT ac.appointment_id)
			AS INTEGER)                                                AS appointment_count,
			MAX(ac.created_at)                                         AS last_visit_at
		FROM members m
		LEFT JOIN customer_profiles cp ON cp.user_id = m.user_id
		LEFT JOIN package_instances pi ON pi.client_id = m.user_id
		LEFT JOIN installments i ON i.package_instance_id = pi.id
		LEFT JOIN payments p ON p.customer_id = m.user_id
		LEFT JOIN appointment_clients ac ON ac.client_id = m.user_id
		WHERE m.role = 'client'
			AND m.hierarchy_scope_id = ANY(${sql.raw(`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
			${includeDeleted ? sql`` : sql`AND (cp.is_deleted IS NULL OR cp.is_deleted = false)`}
			${branchId ? sql`AND m.hierarchy_scope_id = ${branchId}::uuid` : sql``}
			${searchPattern ? sql`AND cp.phone ILIKE ${searchPattern}` : sql``}
		GROUP BY m.id, m.user_id, m.hierarchy_scope_id, m.joined_at, cp.phone, cp.is_deleted
		ORDER BY m.joined_at DESC
		LIMIT ${limit} OFFSET ${offset}
	`;

	const countQuery = sql`
		SELECT CAST(COUNT(*) AS INTEGER) AS total
		FROM members m
		LEFT JOIN customer_profiles cp ON cp.user_id = m.user_id
		WHERE m.role = 'client'
			AND m.hierarchy_scope_id = ANY(${sql.raw(`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
			${includeDeleted ? sql`` : sql`AND (cp.is_deleted IS NULL OR cp.is_deleted = false)`}
			${branchId ? sql`AND m.hierarchy_scope_id = ${branchId}::uuid` : sql``}
			${searchPattern ? sql`AND cp.phone ILIKE ${searchPattern}` : sql``}
	`;

	const [aggregationResult, countResult] = await Promise.all([
		tenantDb.execute(aggregationQuery),
		tenantDb.execute(countQuery),
	]);

	const tenantRows = aggregationResult.rows as Array<{
		member_id: string;
		user_id: string;
		hierarchy_scope_id: string;
		joined_at: Date;
		phone: string | null;
		is_deleted: boolean | null;
		active_package_count: number;
		lifetime_value_cents: number;
		outstanding_balance_cents: number;
		appointment_count: number;
		last_visit_at: Date | null;
	}>;

	const total = (countResult.rows[0] as { total: number })?.total ?? 0;

	if (tenantRows.length === 0) {
		return { rows: [], total };
	}

	// ----------------------------------------------------------------
	// Step 2: cross-DB batch lookup for name/email
	// ----------------------------------------------------------------
	const userIds = tenantRows.map((r) => r.user_id);
	const userRows = await controlPanelDb
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, userIds));

	const userMap = new Map(userRows.map((u) => [u.id, u]));

	// ----------------------------------------------------------------
	// Step 3: batch lookup hierarchy node names
	// ----------------------------------------------------------------
	const scopeIds = [...new Set(tenantRows.map((r) => r.hierarchy_scope_id))];
	const nodeRows = await tenantDb
		.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(inArray(hierarchyNodes.id, scopeIds));

	const nodeMap = new Map(nodeRows.map((n) => [n.id, n.name]));

	// ----------------------------------------------------------------
	// Step 4: merge and optionally filter by name/email search
	// ----------------------------------------------------------------
	let rows: CustomerDirectoryRow[] = tenantRows.map((r) => {
		const userDetail = userMap.get(r.user_id);
		return {
			memberId: r.member_id,
			userId: r.user_id,
			name: userDetail?.name ?? "Unknown",
			email: userDetail?.email ?? "",
			phone: r.phone,
			hierarchyScopeId: r.hierarchy_scope_id,
			branchName: nodeMap.get(r.hierarchy_scope_id) ?? null,
			activePackageCount: r.active_package_count,
			lifetimeValueCents: r.lifetime_value_cents,
			outstandingBalanceCents: r.outstanding_balance_cents,
			appointmentCount: r.appointment_count,
			lastVisitAt: r.last_visit_at,
			createdAt: r.joined_at,
			isDeleted: r.is_deleted ?? null,
		};
	});

	// If search provided, also filter by name/email match (cross-DB supplement)
	if (search) {
		const lower = search.toLowerCase();
		rows = rows.filter(
			(r) =>
				r.name.toLowerCase().includes(lower) ||
				r.email.toLowerCase().includes(lower) ||
				r.phone?.toLowerCase().includes(lower),
		);
	}

	return { rows, total };
}

// ----------------------------------------------------------------
// getCustomerDetail — all data for the detail drawer
// ----------------------------------------------------------------

export interface CustomerDetail {
	member: typeof members.$inferSelect;
	user: { name: string; email: string };
	profile: typeof customerProfiles.$inferSelect | null;
	packageInstances: (typeof packageInstances.$inferSelect)[];
	recentPayments: (typeof payments.$inferSelect)[];
	appointmentCount: number;
	outstandingBalanceCents: number;
}

/**
 * Fetch all data needed for the customer detail drawer.
 *
 * Tenant-side: one round trip (parallel queries, then merge).
 * Control panel: one batch lookup for the user record.
 *
 * Returns null if the member does not exist.
 */
export async function getCustomerDetail(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	_organizationId: string,
	memberId: string,
): Promise<CustomerDetail | null> {
	// Fetch member row first
	const member = await tenantDb.query.members.findFirst({
		where: eq(members.id, memberId),
	});

	if (!member) return null;

	const { userId } = member;

	// Parallel tenant-side queries
	const [
		profile,
		pkgInstances,
		recentPayments,
		apptCountResult,
		outstandingResult,
		userRows,
	] = await Promise.all([
		// Profile (may be null)
		tenantDb.query.customerProfiles.findFirst({
			where: eq(customerProfiles.userId, userId),
		}),

		// All package instances ordered: active first, then by expiresAt DESC
		tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.clientId, userId))
			.orderBy(
				sql`CASE WHEN status = 'active' THEN 0 ELSE 1 END`,
				sql`expires_at DESC`,
			),

		// Last 10 payments
		tenantDb
			.select()
			.from(payments)
			.where(eq(payments.customerId, userId))
			.orderBy(sql`created_at DESC`)
			.limit(10),

		// Appointment count
		tenantDb.execute(
			sql`SELECT CAST(COUNT(DISTINCT appointment_id) AS INTEGER) AS cnt FROM appointment_clients WHERE client_id = ${userId}`,
		),

		// Outstanding balance: sum of pending/overdue installments for this customer's packages
		tenantDb.execute(
			sql`
				SELECT COALESCE(
					SUM(i.amount + COALESCE(i.tax_amount, 0))
					FILTER (WHERE i.status IN ('pending', 'overdue')), 0
				)::INTEGER AS outstanding
				FROM package_instances pi
				JOIN installments i ON i.package_instance_id = pi.id
				WHERE pi.client_id = ${userId}
			`,
		),

		// Cross-DB user lookup
		controlPanelDb
			.select({ id: user.id, name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, userId)),
	]);

	const userDetail = userRows[0];
	const appointmentCount =
		(apptCountResult.rows[0] as { cnt: number })?.cnt ?? 0;
	const outstandingBalanceCents =
		(outstandingResult.rows[0] as { outstanding: number })?.outstanding ?? 0;

	return {
		member,
		user: {
			name: userDetail?.name ?? "Unknown",
			email: userDetail?.email ?? "",
		},
		profile: profile ?? null,
		packageInstances: pkgInstances,
		recentPayments,
		appointmentCount,
		outstandingBalanceCents,
	};
}
