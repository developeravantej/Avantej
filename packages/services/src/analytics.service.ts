import { and, gte, lte, inArray, sum, count, eq } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

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
	totalAppointments: number;
	completedAppointments: number;
	activeMembersCount: number;
	revenueByBranch: RevenueByBranch[];
}

export interface StaffPerformanceParams {
	period: "this_week" | "this_month" | "this_year";
	branchId?: string;
	accessibleNodeIds: string[];
}

export interface StaffPerformanceRow {
	staffId: string;          // members.userId (text)
	memberId: string;         // members.id (uuid)
	appointmentsCompleted: number;
	totalCommission: number;  // cents
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
		from:
			from ?? new Date(now.getFullYear(), now.getMonth(), 1),
		to:
			to ??
			new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
	};
}

export async function getDashboardKpis(
	tenantDb: TenantDb,
	params: DashboardKpiParams,
): Promise<DashboardKpisResult> {
	const { from, to } = getPeriodDates(params.period, params.from, params.to);
	const nodeIds = params.accessibleNodeIds;

	// If branchId specified and in accessible nodes — use just that branch
	// Else use all accessible nodes
	const branchFilter = params.branchId ? [params.branchId] : nodeIds;

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
		nodeIds.length > 0
			? inArray(members.hierarchyScopeId, nodeIds)
			: undefined;

	const membersResult = await tenantDb
		.select({ activeCount: count() })
		.from(members)
		.where(and(eq(members.status, "active"), memberFilter));

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
		totalAppointments: Number(apptTotal[0]?.apptCount ?? 0),
		completedAppointments: Number(apptCompleted[0]?.completedCount ?? 0),
		activeMembersCount: Number(membersResult[0]?.activeCount ?? 0),
		revenueByBranch: revByBranch.map((r) => ({
			branchId: r.branchId,
			branchName: r.branchName ?? null,
			totalRevenue: Number(r.totalRevenue ?? 0),
			orderCount: Number(r.orderCount ?? 0),
		})),
	};
}

export async function getStaffPerformance(
	tenantDb: TenantDb,
	params: StaffPerformanceParams,
): Promise<StaffPerformanceRow[]> {
	const { from, to } = getPeriodDates(params.period);
	const nodeIds = params.accessibleNodeIds;
	const branchFilter = params.branchId ? [params.branchId] : nodeIds;

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

	// Look up member IDs from members table (staffId = members.userId)
	const staffUserIds = rows.map((r) => r.staffId);
	const memberIdMap: Map<string, string> = new Map();
	if (staffUserIds.length > 0) {
		const memberRows = await tenantDb
			.select({ userId: members.userId, id: members.id })
			.from(members)
			.where(inArray(members.userId, staffUserIds));
		for (const m of memberRows) {
			memberIdMap.set(m.userId, m.id);
		}
	}

	return rows.map((r) => ({
		staffId: r.staffId,
		memberId: memberIdMap.get(r.staffId) ?? "",
		appointmentsCompleted: Number(r.appointmentCount ?? 0),
		totalCommission: Number(r.totalCommission ?? 0),
	}));
}
