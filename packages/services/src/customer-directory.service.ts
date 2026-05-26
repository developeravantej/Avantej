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
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
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
	activePackageName: string | null;
	lifetimeValueCents: number;
	outstandingBalanceCents: number;
	appointmentCount: number;
	lastVisitAt: Date | null;
	createdAt: Date;
	isDeleted: boolean | null;
	isUnclaimed: boolean;
	lifecycleStatus: "lead" | "active" | "lapsed" | "churned";
}

export interface CustomerDirectoryStats {
	totalCount: number;
	activeCount: number;
	lapsedCount: number;
	leadCount: number;
	avgLifetimeValueCents: number;
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
	//
	// active_package_name: the name of the most-recently-started active package
	// for this customer (NULL when none). Uses a lateral subquery so we get exactly
	// one row per customer without inflating the JOIN fan-out.
	//
	// lifecycle_status derivation (server-side):
	//   lead    — no visits AND no package ever
	//   active  — has an active package AND last visit within 30 days
	//   lapsed  — last visit 30–90 days ago, OR active package but no visit in 30d
	//   churned — last visit >90 days ago AND no active package
	const aggregationQuery = sql`
		SELECT
			m.id                                                       AS member_id,
			m.user_id                                                  AS user_id,
			m.hierarchy_scope_id                                       AS hierarchy_scope_id,
			m.joined_at                                                AS joined_at,
			cp.phone                                                   AS phone,
			cp.is_deleted                                              AS is_deleted,
			COALESCE(cp.is_unclaimed, false)                           AS is_unclaimed,
			CAST(
				COUNT(DISTINCT pi.id) FILTER (WHERE pi.status = 'active')
			AS INTEGER)                                                AS active_package_count,
			(
				SELECT svc.name
				FROM package_instances pi2
				JOIN services svc ON svc.id = pi2.service_id
				WHERE pi2.client_id = m.user_id
				  AND pi2.status = 'active'
				ORDER BY pi2.starts_at DESC
				LIMIT 1
			)                                                          AS active_package_name,
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
			MAX(ac.created_at)                                         AS last_visit_at,
			CASE
				WHEN COUNT(DISTINCT ac.appointment_id) = 0
				     AND COUNT(DISTINCT pi.id) = 0
				THEN 'lead'
				WHEN COUNT(DISTINCT pi.id) FILTER (WHERE pi.status = 'active') > 0
				     AND MAX(ac.created_at) >= NOW() - INTERVAL '30 days'
				THEN 'active'
				WHEN MAX(ac.created_at) > NOW() - INTERVAL '90 days'
				  OR (
				       COUNT(DISTINCT pi.id) FILTER (WHERE pi.status = 'active') > 0
				       AND (MAX(ac.created_at) IS NULL OR MAX(ac.created_at) < NOW() - INTERVAL '30 days')
				     )
				THEN 'lapsed'
				ELSE 'churned'
			END                                                        AS lifecycle_status
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
		GROUP BY m.id, m.user_id, m.hierarchy_scope_id, m.joined_at, cp.phone, cp.is_deleted, cp.is_unclaimed
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
		is_unclaimed: boolean;
		active_package_count: number;
		active_package_name: string | null;
		lifetime_value_cents: number;
		outstanding_balance_cents: number;
		appointment_count: number;
		last_visit_at: Date | null;
		lifecycle_status: "lead" | "active" | "lapsed" | "churned";
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
			activePackageName: r.active_package_name,
			lifetimeValueCents: r.lifetime_value_cents,
			outstandingBalanceCents: r.outstanding_balance_cents,
			appointmentCount: r.appointment_count,
			lastVisitAt: r.last_visit_at,
			createdAt: r.joined_at,
			isDeleted: r.is_deleted ?? null,
			isUnclaimed: r.is_unclaimed ?? false,
			lifecycleStatus: r.lifecycle_status,
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
// getCustomerStats — KPI tile aggregates
// ----------------------------------------------------------------

/**
 * Returns aggregate stats for the customer KPI tiles:
 *   - totalCount       : all registered clients in scope
 *   - activeCount      : clients with at least one active package_instance
 *   - lapsedCount      : last visit >90 days ago AND no active package
 *   - leadCount        : no visits AND no package ever
 *   - avgLifetimeValueCents : mean of per-customer sum(succeeded payments)
 *
 * RBAC is applied via accessibleNodeIds (same as list).
 */
export async function getCustomerStats(
	tenantDb: TenantDb,
	params: {
		accessibleNodeIds: string[];
		branchId?: string;
	},
): Promise<CustomerDirectoryStats> {
	const { accessibleNodeIds, branchId } = params;

	if (accessibleNodeIds.length === 0) {
		return { totalCount: 0, activeCount: 0, lapsedCount: 0, leadCount: 0, avgLifetimeValueCents: 0 };
	}

	const result = await tenantDb.execute(sql`
		WITH customer_agg AS (
			SELECT
				m.id                                                            AS member_id,
				CAST(
					COUNT(DISTINCT pi.id) FILTER (WHERE pi.status = 'active')
				AS INTEGER)                                                     AS active_pkg_count,
				CAST(
					COUNT(DISTINCT pi.id)
				AS INTEGER)                                                     AS total_pkg_count,
				CAST(
					COUNT(DISTINCT ac.appointment_id)
				AS INTEGER)                                                     AS visit_count,
				MAX(ac.created_at)                                              AS last_visit_at,
				COALESCE(
					SUM(p.total_amount) FILTER (WHERE p.status = 'succeeded'), 0
				)::INTEGER                                                      AS lifetime_value_cents
			FROM members m
			LEFT JOIN package_instances pi ON pi.client_id = m.user_id
			LEFT JOIN payments p ON p.customer_id = m.user_id
			LEFT JOIN appointment_clients ac ON ac.client_id = m.user_id
			WHERE m.role = 'client'
				AND m.hierarchy_scope_id = ANY(${sql.raw(`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
				${branchId ? sql`AND m.hierarchy_scope_id = ${branchId}::uuid` : sql``}
			GROUP BY m.id
		)
		SELECT
			CAST(COUNT(*) AS INTEGER)                                          AS total_count,
			CAST(COUNT(*) FILTER (WHERE active_pkg_count > 0) AS INTEGER)     AS active_count,
			CAST(COUNT(*) FILTER (
				WHERE last_visit_at < NOW() - INTERVAL '90 days'
				  AND active_pkg_count = 0
			) AS INTEGER)                                                      AS lapsed_count,
			CAST(COUNT(*) FILTER (
				WHERE visit_count = 0
				  AND total_pkg_count = 0
			) AS INTEGER)                                                      AS lead_count,
			CAST(COALESCE(AVG(lifetime_value_cents), 0) AS INTEGER)            AS avg_lifetime_value_cents
		FROM customer_agg
	`);

	const row = result.rows[0] as {
		total_count: number;
		active_count: number;
		lapsed_count: number;
		lead_count: number;
		avg_lifetime_value_cents: number;
	};

	return {
		totalCount: row?.total_count ?? 0,
		activeCount: row?.active_count ?? 0,
		lapsedCount: row?.lapsed_count ?? 0,
		leadCount: row?.lead_count ?? 0,
		avgLifetimeValueCents: row?.avg_lifetime_value_cents ?? 0,
	};
}

// ----------------------------------------------------------------
// getCustomerDetail — all data for the detail drawer
// ----------------------------------------------------------------

export interface CustomerDetail {
	member: typeof members.$inferSelect;
	user: { name: string; email: string };
	profile: typeof customerProfiles.$inferSelect | null;
	packageInstances: (typeof packageInstances.$inferSelect & { serviceName: string | null })[];
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

		// All package instances with service name, ordered: active first, then by expiresAt DESC
		tenantDb
			.select({ ...getTableColumns(packageInstances), serviceName: services.name })
			.from(packageInstances)
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.where(eq(packageInstances.clientId, userId))
			.orderBy(
				sql`CASE WHEN ${packageInstances.status} = 'active' THEN 0 ELSE 1 END`,
				sql`${packageInstances.expiresAt} DESC`,
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
