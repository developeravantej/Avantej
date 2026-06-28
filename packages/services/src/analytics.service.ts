import { and, gte, lte, inArray, sum, count, eq, sql } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { resolveScopeNodeIds } from "./hierarchy-scope";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export interface DashboardKpiParams {
	period: "today" | "this_week" | "this_month" | "this_year" | "custom";
	from?: Date;
	to?: Date;
	branchId?: string;
	accessibleNodeIds: string[];
}

export interface RevenueByBranch {
	branchId: string;
	branchName: string | null;
	totalRevenue: number; // cents
	orderCount: number;
}

export interface DashboardKpisResult {
	period: string;
	from: Date;
	to: Date;
	totalSales: number; // cents
	salesOrderCount: number;
	previousPeriodSales: number; // cents — equal-length window immediately before [from, to]
	previousPeriodOrderCount: number;
	totalAppointments: number;
	completedAppointments: number;
	activeMembersCount: number;
	revenueByBranch: RevenueByBranch[];
	// ── New scalars ─────────────────────────────────────────────
	churnRatePct: number; // % of active members who lapsed during the period
	avgLtvCents: number; // running avg cumulative spend per customer up to period end
	classFillRatePct: number; // spotsBooked / capacity * 100 for the period
}

export interface RevenueSeriesParams {
	days: number;
	branchId?: string;
	accessibleNodeIds: string[];
}

export interface RevenueSeriesPoint {
	date: string; // YYYY-MM-DD (UTC)
	revenueCents: number;
}

export interface StaffPerformanceParams {
	period: "today" | "this_week" | "this_month" | "this_year";
	branchId?: string;
	accessibleNodeIds: string[];
}

export interface StaffPerformanceRow {
	staffId: string; // members.userId (text)
	memberId: string; // members.id (uuid)
	staffName: string | null; // resolved from member_profiles.display_name; null if no profile row
	appointmentsCompleted: number;
	totalCommission: number; // cents
}

// Helper to compute from/to dates for a period
function getPeriodDates(
	period: string,
	from?: Date,
	to?: Date,
): { from: Date; to: Date } {
	const now = new Date();
	if (period === "today") {
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const end = new Date(now);
		end.setHours(23, 59, 59, 999);
		return { from: start, to: end };
	}
	if (period === "this_week") {
		const start = new Date(now);
		start.setDate(now.getDate() - now.getDay());
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(start.getDate() + 6);
		end.setHours(23, 59, 59, 999);
		return { from: start, to: end };
	}
	if (period === "this_month") {
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(
			now.getFullYear(),
			now.getMonth() + 1,
			0,
			23,
			59,
			59,
			999,
		);
		return { from: start, to: end };
	}
	if (period === "this_year") {
		const start = new Date(now.getFullYear(), 0, 1);
		const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
		return { from: start, to: end };
	}
	// custom — use provided dates or fallback to this_month
	return {
		from: from ?? new Date(now.getFullYear(), now.getMonth(), 1),
		to:
			to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
	};
}

export async function getDashboardKpis(
	tenantDb: TenantDb,
	params: DashboardKpiParams,
): Promise<DashboardKpisResult> {
	const { from, to } = getPeriodDates(params.period, params.from, params.to);
	const nodeIds = params.accessibleNodeIds;
	const branchFilter = await resolveScopeNodeIds(
		tenantDb,
		params.branchId,
		nodeIds,
	);

	// 1. Sales metrics
	const salesResult = await tenantDb
		.select({
			total: sum(salesOrders.totalAmount),
			orderCount: count(),
		})
		.from(salesOrders)
		.where(
			and(
				inArray(salesOrders.status, ["confirmed", "completed"]),
				gte(salesOrders.date, from),
				lte(salesOrders.date, to),
				branchFilter.length > 0
					? inArray(salesOrders.branchId, branchFilter)
					: undefined,
			),
		);

	// 1b. Previous-period sales (equal-length window immediately before [from, to])
	const periodMs = to.getTime() - from.getTime();
	const prevTo = new Date(from.getTime() - 1);
	const prevFrom = new Date(prevTo.getTime() - periodMs);
	const prevSalesResult = await tenantDb
		.select({
			total: sum(salesOrders.totalAmount),
			orderCount: count(),
		})
		.from(salesOrders)
		.where(
			and(
				inArray(salesOrders.status, ["confirmed", "completed"]),
				gte(salesOrders.date, prevFrom),
				lte(salesOrders.date, prevTo),
				branchFilter.length > 0
					? inArray(salesOrders.branchId, branchFilter)
					: undefined,
			),
		);

	// 2. Appointment metrics — total
	const apptTotal = await tenantDb
		.select({ apptCount: count() })
		.from(appointments)
		.where(
			and(
				gte(appointments.startTime, from),
				lte(appointments.startTime, to),
				branchFilter.length > 0
					? inArray(appointments.branchId, branchFilter)
					: undefined,
			),
		);

	// 2b. Appointment metrics — completed only
	const apptCompleted = await tenantDb
		.select({ completedCount: count() })
		.from(appointments)
		.where(
			and(
				eq(appointments.status, "completed"),
				gte(appointments.startTime, from),
				lte(appointments.startTime, to),
				branchFilter.length > 0
					? inArray(appointments.branchId, branchFilter)
					: undefined,
			),
		);

	// 3. Active members count (scoped to hierarchy nodes)
	const memberFilter =
		nodeIds.length > 0 ? inArray(members.hierarchyScopeId, nodeIds) : undefined;

	const membersResult = await tenantDb
		.select({ activeCount: count() })
		.from(members)
		.where(and(eq(members.status, "active"), memberFilter));

	// 3b. Churn rate — members whose last active package expired in [from, to] with no renewal
	// "lapsed" = a customer_profile that had at least one active package that expired in [from, to]
	//            AND has no active package starting on or after the expiry date.
	// active_at_start = customer_profiles with an active package that started before `from`.
	// NAP-03: scope customer_profiles to those with at least one sales_order in accessible branches.
	const churnBranchClause =
		nodeIds.length > 0
			? sql`AND cp.user_id IN (
				SELECT DISTINCT so.customer_id FROM sales_orders so
				WHERE so.branch_id = ANY(ARRAY[${sql.join(
					nodeIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}])
			  )`
			: sql``;

	const churnResult = await tenantDb.execute<{ churn_pct: string }>(sql`
		WITH active_at_start AS (
			SELECT DISTINCT cp.id AS customer_id
			FROM customer_profiles cp
			JOIN package_instances pi ON pi.client_id = cp.user_id
			WHERE pi.status = 'active'
			  AND pi.starts_at < ${from}
			  ${churnBranchClause}
		),
		lapsed AS (
			SELECT DISTINCT cp.id AS customer_id
			FROM customer_profiles cp
			JOIN package_instances pi ON pi.client_id = cp.user_id
			WHERE pi.expires_at >= ${from}
			  AND pi.expires_at <= ${to}
			  AND NOT EXISTS (
			      SELECT 1 FROM package_instances pi2
			      WHERE pi2.client_id = cp.user_id
			        AND pi2.status = 'active'
			        AND pi2.starts_at >= pi.expires_at
			  )
			  ${churnBranchClause}
		)
		SELECT
			CASE WHEN COUNT(a.customer_id) = 0 THEN 0
			     ELSE ROUND(COUNT(l.customer_id)::numeric / COUNT(a.customer_id) * 100, 1)
			END AS churn_pct
		FROM active_at_start a
		LEFT JOIN lapsed l ON l.customer_id = a.customer_id
	`);
	const churnRatePct = Number(churnResult.rows[0]?.churn_pct ?? 0);

	// 3c. Avg LTV — average cumulative spend per customer with at least one order on/before `to`
	// NAP-03: scope to accessible branches via sales_orders.branch_id filter.
	const ltvBranchClause =
		nodeIds.length > 0
			? sql`AND branch_id = ANY(ARRAY[${sql.join(
					nodeIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}])`
			: sql``;

	const ltvResult = await tenantDb.execute<{ avg_ltv: string }>(sql`
		SELECT ROUND(AVG(customer_total)::numeric, 0) AS avg_ltv
		FROM (
			SELECT customer_id, SUM(total_amount) AS customer_total
			FROM sales_orders
			WHERE date <= ${to}
			  AND status IN ('confirmed', 'completed')
			  ${ltvBranchClause}
			GROUP BY customer_id
		) t
	`);
	const avgLtvCents = Number(ltvResult.rows[0]?.avg_ltv ?? 0);

	// 3d. Class fill rate — sum(spots_booked) / sum(capacity) for slots in [from, to]
	const fillDrizzle = await tenantDb
		.select({
			spotsBooked: sum(classSlots.spotsBooked),
			capacity: sum(classSlots.capacity),
		})
		.from(classSlots)
		.where(
			and(
				gte(classSlots.date, from),
				lte(classSlots.date, to),
				eq(classSlots.isCancelled, false),
				branchFilter.length > 0
					? inArray(classSlots.branchId, branchFilter)
					: undefined,
			),
		);
	const totalBooked = Number(fillDrizzle[0]?.spotsBooked ?? 0);
	const totalCap = Number(fillDrizzle[0]?.capacity ?? 0);
	const classFillRatePct =
		totalCap > 0 ? Math.round((totalBooked / totalCap) * 1000) / 10 : 0;

	// 4. Revenue by branch (join with hierarchyNodes for branch names)
	const revByBranch = await tenantDb
		.select({
			branchId: salesOrders.branchId,
			branchName: hierarchyNodes.name,
			totalRevenue: sum(salesOrders.totalAmount),
			orderCount: count(),
		})
		.from(salesOrders)
		.leftJoin(hierarchyNodes, eq(salesOrders.branchId, hierarchyNodes.id))
		.where(
			and(
				inArray(salesOrders.status, ["confirmed", "completed"]),
				gte(salesOrders.date, from),
				lte(salesOrders.date, to),
				branchFilter.length > 0
					? inArray(salesOrders.branchId, branchFilter)
					: undefined,
			),
		)
		.groupBy(salesOrders.branchId, hierarchyNodes.name);

	return {
		period: params.period,
		from,
		to,
		totalSales: Number(salesResult[0]?.total ?? 0),
		salesOrderCount: Number(salesResult[0]?.orderCount ?? 0),
		previousPeriodSales: Number(prevSalesResult[0]?.total ?? 0),
		previousPeriodOrderCount: Number(prevSalesResult[0]?.orderCount ?? 0),
		totalAppointments: Number(apptTotal[0]?.apptCount ?? 0),
		completedAppointments: Number(apptCompleted[0]?.completedCount ?? 0),
		activeMembersCount: Number(membersResult[0]?.activeCount ?? 0),
		revenueByBranch: revByBranch.map((r) => ({
			branchId: r.branchId,
			branchName: r.branchName ?? null,
			totalRevenue: Number(r.totalRevenue ?? 0),
			orderCount: Number(r.orderCount ?? 0),
		})),
		churnRatePct,
		avgLtvCents,
		classFillRatePct,
	};
}

export async function getStaffPerformance(
	tenantDb: TenantDb,
	params: StaffPerformanceParams,
): Promise<StaffPerformanceRow[]> {
	const { from, to } = getPeriodDates(params.period);
	const nodeIds = params.accessibleNodeIds;
	const branchFilter = await resolveScopeNodeIds(
		tenantDb,
		params.branchId,
		nodeIds,
	);

	// Get completed appointments with commissions
	// commissionSplits.staffId = members.userId (text reference, no FK)
	// Join: commissionSplits → appointments (on appointmentId)
	// Filter: appointments.status = "completed" AND appointments.startTime in range AND branchId in scope
	const rows = await tenantDb
		.select({
			staffId: commissionSplits.staffId,
			appointmentCount: count(commissionSplits.appointmentId),
			totalCommission: sum(commissionSplits.calculatedAmount),
		})
		.from(commissionSplits)
		.innerJoin(
			appointments,
			eq(commissionSplits.appointmentId, appointments.id),
		)
		.where(
			and(
				eq(appointments.status, "completed"),
				gte(appointments.startTime, from),
				lte(appointments.startTime, to),
				branchFilter.length > 0
					? inArray(appointments.branchId, branchFilter)
					: undefined,
			),
		)
		.groupBy(commissionSplits.staffId);

	// Look up member id + display name (members.userId = commissionSplits.staffId)
	const staffUserIds = rows.map((r) => r.staffId);
	const memberInfoMap: Map<
		string,
		{ memberId: string; staffName: string | null }
	> = new Map();
	if (staffUserIds.length > 0) {
		const memberRows = await tenantDb
			.select({
				userId: members.userId,
				id: members.id,
				displayName: memberProfiles.displayName,
			})
			.from(members)
			.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
			.where(inArray(members.userId, staffUserIds));
		for (const m of memberRows) {
			memberInfoMap.set(m.userId, {
				memberId: m.id,
				staffName: m.displayName ?? null,
			});
		}
	}

	return rows.map((r) => {
		const info = memberInfoMap.get(r.staffId);
		return {
			staffId: r.staffId,
			memberId: info?.memberId ?? "",
			staffName: info?.staffName ?? null,
			appointmentsCompleted: Number(r.appointmentCount ?? 0),
			totalCommission: Number(r.totalCommission ?? 0),
		};
	});
}

/**
 * Daily revenue series for the last `days` days, ending today (UTC).
 * Used by the dashboard sparkline. Returns one row per day, including
 * zero-revenue days (so the array length always equals `days`).
 */
export async function getRevenueSeries(
	tenantDb: TenantDb,
	params: RevenueSeriesParams,
): Promise<RevenueSeriesPoint[]> {
	const days = Math.max(1, Math.min(params.days, 365));
	const nodeIds = params.accessibleNodeIds;
	const branchFilter = await resolveScopeNodeIds(
		tenantDb,
		params.branchId,
		nodeIds,
	);

	const now = new Date();
	const to = new Date(now);
	to.setUTCHours(23, 59, 59, 999);
	const from = new Date(to);
	from.setUTCDate(from.getUTCDate() - (days - 1));
	from.setUTCHours(0, 0, 0, 0);

	const dayExpr = sql<string>`to_char(date_trunc('day', ${salesOrders.date}), 'YYYY-MM-DD')`;
	const rows = await tenantDb
		.select({
			day: dayExpr,
			total: sum(salesOrders.totalAmount),
		})
		.from(salesOrders)
		.where(
			and(
				inArray(salesOrders.status, ["confirmed", "completed"]),
				gte(salesOrders.date, from),
				lte(salesOrders.date, to),
				branchFilter.length > 0
					? inArray(salesOrders.branchId, branchFilter)
					: undefined,
			),
		)
		.groupBy(dayExpr);

	const byDay = new Map<string, number>();
	for (const r of rows) byDay.set(r.day, Number(r.total ?? 0));

	const out: RevenueSeriesPoint[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date(from);
		d.setUTCDate(from.getUTCDate() + i);
		const key = d.toISOString().slice(0, 10);
		out.push({ date: key, revenueCents: byDay.get(key) ?? 0 });
	}
	return out;
}

// ─── Time-series interfaces ────────────────────────────────────────────────────

export interface TimeSeriesParams {
	days: 7 | 30 | 90;
	accessibleNodeIds: string[];
}

export interface MemberCountPoint {
	date: string;
	activeMembers: number;
}

export interface ChurnSeriesPoint {
	date: string;
	churnPct: number;
}

export interface LtvSeriesPoint {
	date: string;
	avgLtvCents: number;
}

export interface FillRateSeriesPoint {
	date: string;
	fillRatePct: number;
}

// ─── Helper: build date spine [today-days+1 .. today] ────────────────────────

function buildDateSpine(days: number): { from: Date; to: Date } {
	const to = new Date();
	to.setUTCHours(23, 59, 59, 999);
	const from = new Date(to);
	from.setUTCDate(from.getUTCDate() - (days - 1));
	from.setUTCHours(0, 0, 0, 0);
	return { from, to };
}

function spineKeys(from: Date, days: number): string[] {
	const keys: string[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date(from);
		d.setUTCDate(from.getUTCDate() + i);
		keys.push(d.toISOString().slice(0, 10));
	}
	return keys;
}

/**
 * Daily active-member count for the last `days` days.
 * "Active" = customer_profile with at least one package_instance whose
 *  status = 'active' AND starts_at <= day AND expires_at >= day.
 * Uses a generate_series spine so every day always has a row.
 */
export async function getMemberCountSeries(
	tenantDb: TenantDb,
	params: TimeSeriesParams,
): Promise<MemberCountPoint[]> {
	const { from, to } = buildDateSpine(params.days);
	const nodeIds = params.accessibleNodeIds;

	// NAP-03: when scoped, restrict to customers who have at least one sales_order
	// in an accessible branch. Admin (empty nodeIds) sees org-wide.
	const memberCountBranchClause =
		nodeIds.length > 0
			? sql`AND cp.user_id IN (
				SELECT DISTINCT so.customer_id FROM sales_orders so
				WHERE so.branch_id = ANY(ARRAY[${sql.join(
					nodeIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}])
			  )`
			: sql``;

	// Single SQL: generate_series date spine + correlated count
	const rows = await tenantDb.execute<{
		day: string;
		active_members: string;
	}>(sql`
		WITH spine AS (
			SELECT generate_series(
				${from}::timestamptz,
				${to}::timestamptz,
				'1 day'::interval
			)::date AS day
		)
		SELECT
			to_char(s.day, 'YYYY-MM-DD') AS day,
			COUNT(DISTINCT cp.id)::int AS active_members
		FROM spine s
		LEFT JOIN package_instances pi
			ON  pi.status = 'active'
			AND pi.starts_at::date <= s.day
			AND pi.expires_at::date >= s.day
		LEFT JOIN customer_profiles cp
			ON  cp.user_id = pi.client_id
			AND cp.is_deleted = false
			${memberCountBranchClause}
		GROUP BY s.day
		ORDER BY s.day
	`);

	return rows.rows.map((r) => ({
		date: r.day,
		activeMembers: Number(r.active_members ?? 0),
	}));
}

/**
 * Daily churn percentage for the last `days` days.
 * Churn for day D = members who lapsed on day D / active members at start of day D * 100.
 * "Lapsed" = a customer whose last active package expired on day D with no renewal starting >= D.
 */
export async function getChurnSeries(
	tenantDb: TenantDb,
	params: TimeSeriesParams,
): Promise<ChurnSeriesPoint[]> {
	const { from, to } = buildDateSpine(params.days);
	const nodeIds = params.accessibleNodeIds;

	// NAP-03: scope to customers associated with accessible branches.
	const churnSeriesBranchFilter =
		nodeIds.length > 0
			? sql`AND pi.client_id IN (
				SELECT DISTINCT so.customer_id FROM sales_orders so
				WHERE so.branch_id = ANY(ARRAY[${sql.join(
					nodeIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}])
			  )`
			: sql``;

	const rows = await tenantDb.execute<{ day: string; churn_pct: string }>(sql`
		WITH spine AS (
			SELECT generate_series(
				${from}::timestamptz,
				${to}::timestamptz,
				'1 day'::interval
			)::date AS day
		),
		-- For each day: how many active members started before that day
		active_base AS (
			SELECT
				s.day,
				COUNT(DISTINCT pi.client_id) AS base_count
			FROM spine s
			JOIN package_instances pi
				ON  pi.status = 'active'
				AND pi.starts_at::date < s.day
				AND pi.expires_at::date >= s.day
			${churnSeriesBranchFilter}
			GROUP BY s.day
		),
		-- For each day: how many customers lapsed (last package expired that day, no renewal)
		lapsed AS (
			SELECT
				s.day,
				COUNT(DISTINCT pi.client_id) AS lapsed_count
			FROM spine s
			JOIN package_instances pi
				ON  pi.expires_at::date = s.day
			WHERE NOT EXISTS (
				SELECT 1 FROM package_instances pi2
				WHERE pi2.client_id = pi.client_id
				  AND pi2.status = 'active'
				  AND pi2.starts_at::date >= pi.expires_at::date
			)
			${churnSeriesBranchFilter}
			GROUP BY s.day
		)
		SELECT
			to_char(s.day, 'YYYY-MM-DD') AS day,
			CASE WHEN COALESCE(ab.base_count, 0) = 0 THEN 0
			     ELSE ROUND(COALESCE(l.lapsed_count, 0)::numeric / ab.base_count * 100, 1)
			END AS churn_pct
		FROM spine s
		LEFT JOIN active_base ab ON ab.day = s.day
		LEFT JOIN lapsed l ON l.day = s.day
		ORDER BY s.day
	`);

	return rows.rows.map((r) => ({
		date: r.day,
		churnPct: Number(r.churn_pct ?? 0),
	}));
}

/**
 * Daily average LTV for the last `days` days.
 * For each day: AVG of cumulative total spend per customer who placed at least
 * one order on or before that day.
 */
export async function getLtvSeries(
	tenantDb: TenantDb,
	params: TimeSeriesParams,
): Promise<LtvSeriesPoint[]> {
	const { from, to } = buildDateSpine(params.days);
	const nodeIds = params.accessibleNodeIds;

	// NAP-03: scope sales_orders to accessible branches.
	const ltvSeriesBranchClause =
		nodeIds.length > 0
			? sql`AND so.branch_id = ANY(ARRAY[${sql.join(
					nodeIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}])`
			: sql``;

	const rows = await tenantDb.execute<{
		day: string;
		avg_ltv_cents: string;
	}>(sql`
		WITH spine AS (
			SELECT generate_series(
				${from}::timestamptz,
				${to}::timestamptz,
				'1 day'::interval
			)::date AS day
		),
		-- Cumulative spend per customer as of each spine day
		customer_ltv AS (
			SELECT
				s.day,
				so.customer_id,
				SUM(so.total_amount) AS ltv
			FROM spine s
			JOIN sales_orders so
				ON  so.date::date <= s.day
				AND so.status IN ('confirmed', 'completed')
				${ltvSeriesBranchClause}
			GROUP BY s.day, so.customer_id
		)
		SELECT
			to_char(s.day, 'YYYY-MM-DD') AS day,
			COALESCE(ROUND(AVG(cl.ltv)::numeric, 0), 0) AS avg_ltv_cents
		FROM spine s
		LEFT JOIN customer_ltv cl ON cl.day = s.day
		GROUP BY s.day
		ORDER BY s.day
	`);

	return rows.rows.map((r) => ({
		date: r.day,
		avgLtvCents: Number(r.avg_ltv_cents ?? 0),
	}));
}

/**
 * Daily class fill rate for the last `days` days.
 * fill_rate = SUM(spots_booked) / SUM(capacity) * 100 for slots scheduled that day.
 */
export async function getClassFillRateSeries(
	tenantDb: TenantDb,
	params: TimeSeriesParams,
): Promise<FillRateSeriesPoint[]> {
	const { from, to } = buildDateSpine(params.days);
	const keys = spineKeys(from, params.days);
	const nodeIds = params.accessibleNodeIds;
	// NAP-03: apply branch filter from accessibleNodeIds (was missing from this function).
	const fillSeriesBranchFilter = await resolveScopeNodeIds(
		tenantDb,
		undefined,
		nodeIds,
	);

	const dayExpr = sql<string>`to_char(date_trunc('day', ${classSlots.date}), 'YYYY-MM-DD')`;

	const rows = await tenantDb
		.select({
			day: dayExpr,
			totalBooked: sum(classSlots.spotsBooked),
			totalCap: sum(classSlots.capacity),
		})
		.from(classSlots)
		.where(
			and(
				gte(classSlots.date, from),
				lte(classSlots.date, to),
				eq(classSlots.isCancelled, false),
				fillSeriesBranchFilter.length > 0
					? inArray(classSlots.branchId, fillSeriesBranchFilter)
					: undefined,
			),
		)
		.groupBy(dayExpr);

	const byDay = new Map<string, number>();
	for (const r of rows) {
		const booked = Number(r.totalBooked ?? 0);
		const cap = Number(r.totalCap ?? 0);
		byDay.set(r.day, cap > 0 ? Math.round((booked / cap) * 1000) / 10 : 0);
	}

	return keys.map((k) => ({ date: k, fillRatePct: byDay.get(k) ?? 0 }));
}
