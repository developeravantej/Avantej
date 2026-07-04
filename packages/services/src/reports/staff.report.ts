/**
 * WS2 reports — STAFF domain.
 *
 * Report A: Coach Productivity — one coach per row, over appointments whose
 * start_time falls in [from, to], branch-scoped via appointments.branch_id.
 * Report B: Appointments Detailed — one appointment per row, ALL statuses
 * (this report is ABOUT appointment outcomes, so cancelled/no-show included).
 *
 * taxBasis is intentionally IGNORED in both reports:
 * - commission (commission_splits.calculated_amount) is pre-tax by definition;
 * - appointments carry no tax snapshot — session_total is pre-tax.
 *
 * Branchless rows: appointments.branch_id is NOT NULL, so neither report has
 * branchless rows to fail-closed on.
 */

import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { services } from "@avantej-core/db/schema/tenant/services";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lte,
	ne,
	notExists,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DEFAULT_CURRENCY } from "../currency.service";
import {
	buildBranchCurrencyMap,
	currencyForBranch,
	exportReportCsv,
	resolveReportBranchIds,
	type ReportBaseParams,
	type ReportCsvResult,
	type ReportListResult,
	type ReportPageParams,
	type TenantDb,
} from "./_shared";

/** Per-currency commission slice for a coach (WS1: never co-mingle currencies). */
export interface CommissionByCurrency {
	currency: string;
	cents: number;
}

// ---------------------------------------------------------------------------
// Report A — Coach Productivity
// ---------------------------------------------------------------------------

export type CoachProductivityParams = ReportBaseParams & ReportPageParams;

export interface CoachProductivityRow {
	/** members.userId (Better-Auth id) — the commission_splits.staffId key. */
	staffId: string;
	staffName: string | null;
	tierName: string | null;
	completed: number;
	noShows: number;
	/** Percentage 0–100 (1 decimal); 0 when completed + noShows === 0. */
	noShowPct: number;
	cancelled: number;
	upcoming: number;
	distinctClients: number;
	creditsConsumed: number;
	/**
	 * Commission earned in-window, split per ISO currency (WS1 — a coach who
	 * works branches in >1 country accrues in >1 currency; never summed 1:1).
	 * Branch-scoped: only splits whose derived branch is in the caller's scope.
	 */
	commissionByCurrency: CommissionByCurrency[];
	/** The coach's home-branch currency — labels non-money columns / fallback. */
	currency: string;
}

interface StatusAgg {
	completed: number;
	noShows: number;
	cancelled: number;
	upcoming: number;
	creditsConsumed: number;
}

/** Fresh per-query status aggregate expressions (appointment grain). */
function statusAggregates() {
	return {
		completed:
			sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`.mapWith(
				Number,
			),
		// Status literal uses a HYPHEN ('no-show'), matching the write path.
		noShows:
			sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'no-show')`.mapWith(
				Number,
			),
		cancelled:
			sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'cancelled')`.mapWith(
				Number,
			),
		upcoming:
			sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} IN ('pending', 'confirmed'))`.mapWith(
				Number,
			),
		creditsConsumed:
			sql<number>`COALESCE(SUM(${appointments.creditsUsed}) FILTER (WHERE ${appointments.status} = 'completed'), 0)`.mapWith(
				Number,
			),
	};
}

/**
 * Coach productivity over the appointment window. Coach attribution covers
 * both write paths:
 * 1. Modern: appointment_staff rows (staff_id = members.userId).
 * 2. Legacy: appointments with NO appointment_staff rows but a trainer_id
 *    (members.id) — resolved to members.userId so both merge on one key.
 * Coach rows are few (<200/org), so the full merged set is computed in JS
 * from a handful of focused queries and paginated as an array.
 */
export async function listCoachProductivity(
	tenantDb: TenantDb,
	params: CoachProductivityParams,
): Promise<ReportListResult<CoachProductivityRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);

	const rangeConditions = () => {
		const conditions = [
			gte(appointments.startTime, params.from),
			lte(appointments.startTime, params.to),
		];
		if (branchIds !== null) {
			conditions.push(inArray(appointments.branchId, branchIds));
		}
		return conditions;
	};

	/** Legacy path filter: appointment has no appointment_staff rows at all. */
	const noStaffRows = () =>
		notExists(
			tenantDb
				.select({ one: sql`1` })
				.from(appointmentStaff)
				.where(eq(appointmentStaff.appointmentId, appointments.id)),
		);

	const [modernAgg, legacyAgg, modernClients, legacyClients] =
		await Promise.all([
			// 1. Modern attribution: group by appointment_staff.staff_id.
			tenantDb
				.select({ staffId: appointmentStaff.staffId, ...statusAggregates() })
				.from(appointmentStaff)
				.innerJoin(
					appointments,
					eq(appointmentStaff.appointmentId, appointments.id),
				)
				.where(and(...rangeConditions()))
				.groupBy(appointmentStaff.staffId),
			// 2. Legacy attribution: no staff rows, grouped by trainer_id →
			//    members.userId (joined here so both paths share the key).
			tenantDb
				.select({ staffId: members.userId, ...statusAggregates() })
				.from(appointments)
				.innerJoin(members, eq(appointments.trainerId, members.id))
				.where(
					and(
						...rangeConditions(),
						isNotNull(appointments.trainerId),
						noStaffRows(),
					),
				)
				.groupBy(members.userId),
			// 3. Distinct clients across non-cancelled appointments (modern path).
			tenantDb
				.select({
					staffId: appointmentStaff.staffId,
					distinctClients:
						sql<number>`COUNT(DISTINCT ${appointmentClients.clientId})`.mapWith(
							Number,
						),
				})
				.from(appointmentStaff)
				.innerJoin(
					appointments,
					eq(appointmentStaff.appointmentId, appointments.id),
				)
				.innerJoin(
					appointmentClients,
					eq(appointmentClients.appointmentId, appointments.id),
				)
				.where(and(...rangeConditions(), ne(appointments.status, "cancelled")))
				.groupBy(appointmentStaff.staffId),
			// 4. Distinct clients (legacy path).
			tenantDb
				.select({
					staffId: members.userId,
					distinctClients:
						sql<number>`COUNT(DISTINCT ${appointmentClients.clientId})`.mapWith(
							Number,
						),
				})
				.from(appointments)
				.innerJoin(members, eq(appointments.trainerId, members.id))
				.innerJoin(
					appointmentClients,
					eq(appointmentClients.appointmentId, appointments.id),
				)
				.where(
					and(
						...rangeConditions(),
						isNotNull(appointments.trainerId),
						ne(appointments.status, "cancelled"),
						noStaffRows(),
					),
				)
				.groupBy(members.userId),
		]);

	// Merge both attribution paths by staffId (members.userId).
	const aggByStaff = new Map<string, StatusAgg>();
	for (const row of [...modernAgg, ...legacyAgg]) {
		const prev = aggByStaff.get(row.staffId) ?? {
			completed: 0,
			noShows: 0,
			cancelled: 0,
			upcoming: 0,
			creditsConsumed: 0,
		};
		prev.completed += row.completed;
		prev.noShows += row.noShows;
		prev.cancelled += row.cancelled;
		prev.upcoming += row.upcoming;
		prev.creditsConsumed += row.creditsConsumed;
		aggByStaff.set(row.staffId, prev);
	}

	if (aggByStaff.size === 0) {
		return { rows: [], total: 0 };
	}

	// Distinct-client counts are summed across the two attribution paths; a
	// client seen by the same coach via BOTH a legacy and a modern appointment
	// in the window would be counted twice — rare (migration boundary only)
	// and accepted for v1.
	const clientsByStaff = new Map<string, number>();
	for (const row of [...modernClients, ...legacyClients]) {
		clientsByStaff.set(
			row.staffId,
			(clientsByStaff.get(row.staffId) ?? 0) + row.distinctClients,
		);
	}

	const staffIds = [...aggByStaff.keys()];

	// Commission split branch is derived (splits carry no branch column): via
	// their appointment, their sales_order, or their package_instance (→ its
	// sales_order, else its service). Aliased tables — this query is independent
	// of the appointment queries above.
	const csAppt = alias(appointments, "cp_cs_appt");
	const csSo = alias(salesOrders, "cp_cs_so");
	const csPi = alias(packageInstances, "cp_cs_pi");
	const csPiSo = alias(salesOrders, "cp_cs_piso");
	const csPiSvc = alias(services, "cp_cs_psvc");
	const csBranchExpr = sql<
		string | null
	>`coalesce(${csAppt.branchId}, ${csSo.branchId}, ${csPiSo.branchId}, ${csPiSvc.branchId})`;
	// COALESCE NULL currency (pre-WS1-backfill rows) to the tenant default so
	// they group with, not apart from, the default-currency bucket.
	const csCurrencyExpr = sql<string>`coalesce(${commissionSplits.currency}, ${DEFAULT_CURRENCY})`;

	const commissionConditions = [
		inArray(commissionSplits.staffId, staffIds),
		gte(commissionSplits.earnedAt, params.from),
		lte(commissionSplits.earnedAt, params.to),
		ne(commissionSplits.status, "void"),
		eq(commissionSplits.excluded, false),
		eq(commissionSplits.isComplimentary, false),
	];
	// RBAC: a scoped manager must NOT see commission earned outside their
	// branches. Filter on the derived branch; NULL-derived splits fail the IN
	// (SQL NULL IN (...) = false) and are hidden — fail closed.
	if (branchIds !== null) {
		commissionConditions.push(inArray(csBranchExpr, branchIds));
	}

	const [commissionRows, infoRows] = await Promise.all([
		// Commission is scoped by earned_at within [from, to] — NOT by the
		// appointment set above (a split may be earned in-window for an
		// out-of-window appointment or a POS sale, and vice versa). Grouped by
		// (staffId, currency) so multi-country coaches never co-mingle (WS1).
		tenantDb
			.select({
				staffId: commissionSplits.staffId,
				currency: csCurrencyExpr,
				commissionCents:
					sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
						Number,
					),
			})
			.from(commissionSplits)
			.leftJoin(csAppt, eq(csAppt.id, commissionSplits.appointmentId))
			.leftJoin(csSo, eq(csSo.id, commissionSplits.salesOrderId))
			.leftJoin(csPi, eq(csPi.id, commissionSplits.packageInstanceId))
			.leftJoin(csPiSo, eq(csPiSo.id, csPi.salesOrderId))
			.leftJoin(csPiSvc, eq(csPiSvc.id, csPi.serviceId))
			.where(and(...commissionConditions))
			.groupBy(commissionSplits.staffId, csCurrencyExpr),
		// Name + tier resolution (tenant-local, analytics.getStaffPerformance
		// pattern: members.userId → member_profiles.displayName).
		tenantDb
			.select({
				userId: members.userId,
				displayName: memberProfiles.displayName,
				tierName: trainerTiers.name,
				hierarchyScopeId: members.hierarchyScopeId,
			})
			.from(members)
			.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
			.leftJoin(trainerTiers, eq(members.trainerTierId, trainerTiers.id))
			.where(inArray(members.userId, staffIds)),
	]);

	// Per-currency commission buckets (WS1): each coach → one slice per currency.
	const commissionByStaff = new Map<string, CommissionByCurrency[]>();
	for (const r of commissionRows) {
		const arr = commissionByStaff.get(r.staffId) ?? [];
		arr.push({ currency: r.currency, cents: r.commissionCents });
		commissionByStaff.set(r.staffId, arr);
	}
	const infoByStaff = new Map(infoRows.map((r) => [r.userId, r]));

	// Home-branch currency (members.hierarchy_scope_id) labels the coach's
	// non-money columns and is the fallback when they have no commission yet.
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		infoRows.map((r) => r.hierarchyScopeId),
	);

	const merged: CoachProductivityRow[] = staffIds.map((staffId) => {
		const agg = aggByStaff.get(staffId)!;
		const info = infoByStaff.get(staffId);
		const denominator = agg.completed + agg.noShows;
		return {
			staffId,
			staffName: info?.displayName ?? null,
			tierName: info?.tierName ?? null,
			completed: agg.completed,
			noShows: agg.noShows,
			noShowPct:
				denominator === 0
					? 0
					: Math.round((agg.noShows / denominator) * 1000) / 10,
			cancelled: agg.cancelled,
			upcoming: agg.upcoming,
			distinctClients: clientsByStaff.get(staffId) ?? 0,
			creditsConsumed: agg.creditsConsumed,
			commissionByCurrency: (commissionByStaff.get(staffId) ?? []).sort(
				(a, b) => b.cents - a.cents,
			),
			currency: currencyForBranch(currencyMap, info?.hierarchyScopeId),
		};
	});

	merged.sort(
		(a, b) =>
			b.completed - a.completed ||
			(a.staffName ?? "").localeCompare(b.staffName ?? "") ||
			a.staffId.localeCompare(b.staffId),
	);

	return {
		rows: merged.slice(params.offset, params.offset + params.limit),
		total: merged.length,
	};
}

const COACH_CSV_HEADERS = [
	"Coach",
	"Tier",
	"Completed",
	"No-Shows",
	"No-Show %",
	"Cancelled",
	"Upcoming",
	"Distinct Clients",
	"Credits Consumed",
	// One coach can earn in >1 currency; emit "MYR 50.00; THB 300.00" so no
	// two currencies are ever collapsed into one number (WS1).
	"Commission (by currency)",
] as const;

/** "MYR 50.00; THB 300.00" — or "0.00" when the coach earned nothing. */
export function formatCommissionByCurrency(
	slices: CommissionByCurrency[],
): string {
	if (slices.length === 0) return "0.00";
	return slices
		.map((s) => `${s.currency} ${(s.cents / 100).toFixed(2)}`)
		.join("; ");
}

export async function exportCoachProductivityCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		(page) => listCoachProductivity(tenantDb, { ...params, ...page }),
		COACH_CSV_HEADERS,
		(row) => [
			row.staffName ?? row.staffId,
			row.tierName,
			row.completed,
			row.noShows,
			row.noShowPct.toFixed(1),
			row.cancelled,
			row.upcoming,
			row.distinctClients,
			row.creditsConsumed,
			formatCommissionByCurrency(row.commissionByCurrency),
		],
	);
}

// ---------------------------------------------------------------------------
// Report B — Appointments Detailed
// ---------------------------------------------------------------------------

export type AppointmentsDetailedParams = ReportBaseParams & ReportPageParams;

export interface AppointmentDetailRow {
	id: string;
	startTime: Date;
	endTime: Date;
	bookingNumber: string | null;
	serviceName: string | null;
	coachName: string | null;
	staffCount: number;
	customerName: string | null;
	clientCount: number;
	status: string;
	creditsUsed: number;
	/** PRE-TAX — appointments carry no tax snapshot; taxBasis is ignored. */
	sessionTotalCents: number;
	currency: string;
	type: string;
	branchName: string | null;
	isComplimentary: boolean;
}

/**
 * One appointment per row, newest start_time first. NO status exclusions —
 * this report is about outcomes, so cancelled/no-show rows are shown.
 */
export async function listAppointmentsDetailed(
	tenantDb: TenantDb,
	params: AppointmentsDetailedParams,
): Promise<ReportListResult<AppointmentDetailRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);

	const conditions = [
		gte(appointments.startTime, params.from),
		lte(appointments.startTime, params.to),
	];
	if (branchIds !== null) {
		conditions.push(inArray(appointments.branchId, branchIds));
	}
	const where = and(...conditions);

	const [countResult, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(appointments)
			.where(where),
		tenantDb
			.select({
				id: appointments.id,
				startTime: appointments.startTime,
				endTime: appointments.endTime,
				bookingNumber: appointments.bookingNumber,
				serviceName: services.name,
				branchId: appointments.branchId,
				branchName: hierarchyNodes.name,
				coachName: memberProfiles.displayName,
				customerNameSnapshot: appointments.customerName,
				status: appointments.status,
				creditsUsed: appointments.creditsUsed,
				sessionTotalCents: appointments.sessionTotal,
				type: appointments.type,
				isComplimentary: appointments.isComplimentary,
			})
			.from(appointments)
			.leftJoin(services, eq(appointments.serviceId, services.id))
			.leftJoin(hierarchyNodes, eq(appointments.branchId, hierarchyNodes.id))
			.leftJoin(members, eq(appointments.trainerId, members.id))
			.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
			.where(where)
			.orderBy(desc(appointments.startTime), desc(appointments.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countResult[0]?.total ?? 0;
	if (pageRows.length === 0) {
		return { rows: [], total };
	}

	const appointmentIds = pageRows.map((r) => r.id);

	// Second queries over the page's appointment ids (simpler than grouped
	// subqueries in the page select): staff counts + client rows. Client rows
	// are fetched (not just counted) so the first client can back-fill the
	// customer name for legacy rows with a NULL customer_name snapshot.
	const [staffCountRows, clientRows] = await Promise.all([
		tenantDb
			.select({
				appointmentId: appointmentStaff.appointmentId,
				staffCount: sql<number>`COUNT(*)`.mapWith(Number),
			})
			.from(appointmentStaff)
			.where(inArray(appointmentStaff.appointmentId, appointmentIds))
			.groupBy(appointmentStaff.appointmentId),
		tenantDb
			.select({
				appointmentId: appointmentClients.appointmentId,
				clientId: appointmentClients.clientId,
				walkInCustomerId: appointmentClients.walkInCustomerId,
			})
			.from(appointmentClients)
			.where(inArray(appointmentClients.appointmentId, appointmentIds))
			.orderBy(asc(appointmentClients.createdAt), asc(appointmentClients.id)),
	]);

	const staffCounts = new Map(
		staffCountRows.map((r) => [r.appointmentId, r.staffCount]),
	);
	const clientCounts = new Map<string, number>();
	const firstClient = new Map<
		string,
		{ clientId: string; walkInCustomerId: string | null }
	>();
	for (const row of clientRows) {
		clientCounts.set(
			row.appointmentId,
			(clientCounts.get(row.appointmentId) ?? 0) + 1,
		);
		if (!firstClient.has(row.appointmentId)) {
			firstClient.set(row.appointmentId, {
				clientId: row.clientId,
				walkInCustomerId: row.walkInCustomerId ?? null,
			});
		}
	}

	// Name back-fill for rows without a customer_name snapshot (tenant-local:
	// members/member_profiles for member clients, walk_in_customers otherwise).
	const needsFallback = pageRows.filter((r) => !r.customerNameSnapshot);
	const fallbackWalkInIds = new Set<string>();
	const fallbackClientIds = new Set<string>();
	for (const row of needsFallback) {
		const first = firstClient.get(row.id);
		if (!first) continue;
		if (first.walkInCustomerId) fallbackWalkInIds.add(first.walkInCustomerId);
		else fallbackClientIds.add(first.clientId);
	}

	const [walkInNameRows, memberNameRows] = await Promise.all([
		fallbackWalkInIds.size === 0
			? Promise.resolve([])
			: tenantDb
					.select({ id: walkInCustomers.id, name: walkInCustomers.name })
					.from(walkInCustomers)
					.where(inArray(walkInCustomers.id, [...fallbackWalkInIds])),
		fallbackClientIds.size === 0
			? Promise.resolve([])
			: tenantDb
					.select({
						userId: members.userId,
						displayName: memberProfiles.displayName,
					})
					.from(members)
					.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
					.where(inArray(members.userId, [...fallbackClientIds])),
	]);

	const walkInNames = new Map(walkInNameRows.map((r) => [r.id, r.name]));
	const memberNames = new Map(
		memberNameRows.map((r) => [r.userId, r.displayName]),
	);

	// WS1 rule: currency ALWAYS derived from the row's branch.
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		pageRows.map((r) => r.branchId),
	);

	const rows: AppointmentDetailRow[] = pageRows.map((row) => {
		let customerName: string | null = row.customerNameSnapshot ?? null;
		if (!customerName) {
			const first = firstClient.get(row.id);
			if (first?.walkInCustomerId) {
				customerName = walkInNames.get(first.walkInCustomerId) ?? null;
			} else if (first) {
				customerName = memberNames.get(first.clientId) ?? null;
			}
		}
		return {
			id: row.id,
			startTime: row.startTime,
			endTime: row.endTime,
			bookingNumber: row.bookingNumber,
			serviceName: row.serviceName,
			coachName: row.coachName,
			staffCount: staffCounts.get(row.id) ?? 0,
			customerName,
			clientCount: clientCounts.get(row.id) ?? 0,
			status: row.status,
			creditsUsed: row.creditsUsed ?? 0,
			sessionTotalCents: row.sessionTotalCents,
			currency: currencyForBranch(currencyMap, row.branchId),
			type: row.type,
			branchName: row.branchName,
			isComplimentary: row.isComplimentary,
		};
	});

	return { rows, total };
}

const APPOINTMENTS_CSV_HEADERS = [
	"Start",
	"End",
	"Booking #",
	"Service",
	"Coach",
	"Customer",
	"Clients",
	"Status",
	"Credits",
	"Session Total",
	"Currency",
	"Branch",
	"Type",
	"Complimentary",
] as const;

export async function exportAppointmentsDetailedCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		(page) => listAppointmentsDetailed(tenantDb, { ...params, ...page }),
		APPOINTMENTS_CSV_HEADERS,
		(row) => [
			row.startTime,
			row.endTime,
			row.bookingNumber,
			row.serviceName,
			row.coachName,
			row.customerName,
			row.clientCount,
			row.status,
			row.creditsUsed,
			(row.sessionTotalCents / 100).toFixed(2),
			row.currency,
			row.branchName,
			row.type,
			row.isComplimentary,
		],
	);
}
