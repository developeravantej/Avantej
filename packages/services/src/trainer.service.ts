/**
 * Trainer Service
 *
 * Provides per-trainer and batch weekly stats, and next-7-days schedule.
 *
 * staffId convention: members.userId (cross-DB user ID).
 *
 * Utilization formula:
 *   sessionsThisWeek / SUM(class_slots.capacity WHERE instructorId = member.id AND
 *                          date BETWEEN weekStart AND weekStart+6d)
 *   Falls back to 0 when the trainer has no class slots in the week.
 *
 * Commission YTD: SUM of non-void commissionSplits.calculatedAmount where
 *   earnedAt >= start-of-calendar-year and staffId = memberId.
 *
 * revenueGenerated: SUM of appointments.sessionTotal for completed appointments
 *   in the week where the trainer is the primary trainer (appointments.trainerId).
 */

import {
	and,
	count,
	eq,
	gte,
	inArray,
	isNotNull,
	lte,
	ne,
	sql,
} from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { members } from "@avantej-core/db/schema/tenant/members";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainerWeeklyStats {
	memberId: string;
	sessionsThisWeek: number;
	utilizationPct: number;
	commissionYtd: number; // integer cents
	revenueGenerated: number; // integer cents
}

export interface TrainerScheduleEntry {
	type: "appointment" | "class_slot";
	id: string;
	startTime: Date | string;
	endTime: Date | string;
	title: string | null;
}

export interface TrainerWeeklySchedule {
	memberId: string;
	entries: TrainerScheduleEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekBounds(weekStart?: Date): { start: Date; end: Date } {
	const now = new Date();
	const start = weekStart
		? new Date(weekStart)
		: (() => {
				// Default: most recent Monday
				const d = new Date(now);
				const day = d.getUTCDay(); // 0=Sun
				const diff = day === 0 ? 6 : day - 1;
				d.setUTCDate(d.getUTCDate() - diff);
				d.setUTCHours(0, 0, 0, 0);
				return d;
			})();
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 7);
	end.setUTCMilliseconds(-1);
	return { start, end };
}

function getYtdStart(from: Date): Date {
	return new Date(Date.UTC(from.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

// ---------------------------------------------------------------------------
// 1.12 — weeklyStats (single trainer)
// ---------------------------------------------------------------------------

export async function getTrainerWeeklyStats(
	tenantDb: TenantDb,
	memberId: string,
	weekStart?: Date,
): Promise<TrainerWeeklyStats> {
	const { start, end } = getWeekBounds(weekStart);
	const ytdStart = getYtdStart(start);

	// Resolve member.id (uuid PK) from userId for class-slot join (instructorId = members.id)
	const memberRow = await tenantDb.query.members.findFirst({
		where: eq(members.userId, memberId),
		columns: { id: true },
	});

	// Run all 3 aggregates in parallel
	const [sessionsResult, commissionResult, revenueResult, capacityResult] =
		await Promise.all([
			// 1) Sessions count — completed appointments where trainer was primary trainer
			tenantDb
				.select({ cnt: count() })
				.from(appointments)
				.where(
					and(
						eq(appointments.trainerId, (memberRow?.id as string) ?? ""),
						eq(appointments.status, "completed"),
						gte(appointments.startTime, start),
						lte(appointments.startTime, end),
					),
				),

			// 2) Commission YTD — sum non-void splits by staffId (userId)
			tenantDb
				.select({
					total:
						sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
							Number,
						),
				})
				.from(commissionSplits)
				.where(
					and(
						eq(commissionSplits.staffId, memberId),
						sql`${commissionSplits.status} <> 'void'`,
						gte(commissionSplits.earnedAt, ytdStart),
					),
				),

			// 3) Revenue generated — sum sessionTotal for completed appointments in the week
			tenantDb
				.select({
					total:
						sql<number>`COALESCE(SUM(${appointments.sessionTotal}), 0)`.mapWith(
							Number,
						),
				})
				.from(appointments)
				.where(
					and(
						eq(appointments.trainerId, (memberRow?.id as string) ?? ""),
						eq(appointments.status, "completed"),
						gte(appointments.startTime, start),
						lte(appointments.startTime, end),
					),
				),

			// 4) Slot capacity sum for the week — uses instructorId = members.id (uuid PK)
			memberRow?.id
				? tenantDb
						.select({
							totalCapacity:
								sql<number>`COALESCE(SUM(${classSlots.capacity}), 0)`.mapWith(
									Number,
								),
						})
						.from(classSlots)
						.where(
							and(
								eq(classSlots.instructorId, memberRow.id),
								gte(classSlots.date, start),
								lte(classSlots.date, end),
							),
						)
				: Promise.resolve([{ totalCapacity: 0 }]),
		]);

	const sessionsThisWeek = sessionsResult[0]?.cnt ?? 0;
	const commissionYtd = commissionResult[0]?.total ?? 0;
	const revenueGenerated = revenueResult[0]?.total ?? 0;
	const totalCapacity = capacityResult[0]?.totalCapacity ?? 0;
	const utilizationPct =
		totalCapacity > 0
			? Math.min(100, Math.round((sessionsThisWeek / totalCapacity) * 100))
			: 0;

	return {
		memberId,
		sessionsThisWeek,
		utilizationPct,
		commissionYtd,
		revenueGenerated,
	};
}

// ---------------------------------------------------------------------------
// 1.13 — weeklySchedule (next 7 days)
// ---------------------------------------------------------------------------

export async function getTrainerWeeklySchedule(
	tenantDb: TenantDb,
	memberId: string,
	weekStart?: Date,
): Promise<TrainerWeeklySchedule> {
	const now = new Date();
	const start = weekStart ? new Date(weekStart) : now;
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 7);

	// Resolve member.id (uuid PK) for class-slot join
	const memberRow = await tenantDb.query.members.findFirst({
		where: eq(members.userId, memberId),
		columns: { id: true },
	});

	const [apptRows, slotRows] = await Promise.all([
		// Appointments where this trainer is the primary trainer
		tenantDb
			.select({
				id: appointments.id,
				startTime: appointments.startTime,
				endTime: appointments.endTime,
				serviceId: appointments.serviceId,
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.trainerId, (memberRow?.id as string) ?? ""),
					gte(appointments.startTime, start),
					lte(appointments.startTime, end),
					sql`${appointments.status} NOT IN ('cancelled', 'no-show')`,
				),
			)
			.limit(200),

		// Class slots assigned to this trainer
		memberRow?.id
			? tenantDb
					.select({
						id: classSlots.id,
						date: classSlots.date,
						startTime: classSlots.startTime,
						endTime: classSlots.endTime,
						serviceId: classSlots.serviceId,
					})
					.from(classSlots)
					.where(
						and(
							eq(classSlots.instructorId, memberRow.id),
							gte(classSlots.date, start),
							lte(classSlots.date, end),
							eq(classSlots.isCancelled, false),
						),
					)
					.limit(200)
			: Promise.resolve([]),
	]);

	const entries: TrainerScheduleEntry[] = [
		...apptRows.map((a) => ({
			type: "appointment" as const,
			id: a.id,
			startTime: a.startTime,
			endTime: a.endTime,
			title: null,
		})),
		...slotRows.map((s) => ({
			type: "class_slot" as const,
			id: s.id,
			startTime: s.date, // date column holds the slot date/time
			endTime: s.endTime,
			title: null,
		})),
	];

	// Sort combined by startTime ascending
	entries.sort((a, b) => {
		const aTime = new Date(a.startTime).getTime();
		const bTime = new Date(b.startTime).getTime();
		return aTime - bTime;
	});

	// Respect the 200-row LIMIT across both sets
	return { memberId, entries: entries.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// 1.35 — weeklyStatsBatch (up to 100 trainers, no N+1)
// ---------------------------------------------------------------------------

export async function getTrainerWeeklyStatsBatch(
	tenantDb: TenantDb,
	memberIds: string[], // userId values
	weekStart?: Date,
): Promise<Map<string, TrainerWeeklyStats>> {
	if (memberIds.length === 0) return new Map();
	if (memberIds.length > 100) {
		throw new Error("weeklyStatsBatch: max 100 memberIds per call");
	}

	const { start, end } = getWeekBounds(weekStart);
	const ytdStart = getYtdStart(start);

	// Resolve userId → member.id (uuid PK) for class-slot join
	const memberRows = await tenantDb
		.select({ id: members.id, userId: members.userId })
		.from(members)
		.where(inArray(members.userId, memberIds));

	const userIdToMemberId = new Map(memberRows.map((m) => [m.userId, m.id]));
	const memberPkIds = memberRows.map((m) => m.id);

	// Run all 3 GROUP BY aggregates in parallel (no N+1)
	const [sessionsRows, commissionRows, revenueRows, capacityRows] =
		await Promise.all([
			// 1) Sessions per trainer (by member PK uuid, then map back to userId)
			memberPkIds.length > 0
				? tenantDb
						.select({
							trainerId: appointments.trainerId,
							cnt: count(),
						})
						.from(appointments)
						.where(
							and(
								inArray(appointments.trainerId, memberPkIds),
								eq(appointments.status, "completed"),
								gte(appointments.startTime, start),
								lte(appointments.startTime, end),
							),
						)
						.groupBy(appointments.trainerId)
				: Promise.resolve([]),

			// 2) Commission YTD per userId (staffId IS the userId)
			tenantDb
				.select({
					staffId: commissionSplits.staffId,
					total:
						sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
							Number,
						),
				})
				.from(commissionSplits)
				.where(
					and(
						inArray(commissionSplits.staffId, memberIds),
						sql`${commissionSplits.status} <> 'void'`,
						gte(commissionSplits.earnedAt, ytdStart),
					),
				)
				.groupBy(commissionSplits.staffId),

			// 3) Revenue per trainer (by member PK, map back)
			memberPkIds.length > 0
				? tenantDb
						.select({
							trainerId: appointments.trainerId,
							total:
								sql<number>`COALESCE(SUM(${appointments.sessionTotal}), 0)`.mapWith(
									Number,
								),
						})
						.from(appointments)
						.where(
							and(
								inArray(appointments.trainerId, memberPkIds),
								eq(appointments.status, "completed"),
								gte(appointments.startTime, start),
								lte(appointments.startTime, end),
							),
						)
						.groupBy(appointments.trainerId)
				: Promise.resolve([]),

			// 4) Slot capacity per trainer (by member PK, map back)
			memberPkIds.length > 0
				? tenantDb
						.select({
							instructorId: classSlots.instructorId,
							totalCapacity:
								sql<number>`COALESCE(SUM(${classSlots.capacity}), 0)`.mapWith(
									Number,
								),
						})
						.from(classSlots)
						.where(
							and(
								inArray(classSlots.instructorId, memberPkIds),
								gte(classSlots.date, start),
								lte(classSlots.date, end),
							),
						)
						.groupBy(classSlots.instructorId)
				: Promise.resolve([]),
		]);

	// Build lookup maps keyed by member PK uuid
	const sessionsByPk = new Map<string, number>();
	for (const row of sessionsRows as {
		trainerId: string | null;
		cnt: number;
	}[]) {
		if (row.trainerId) sessionsByPk.set(row.trainerId, row.cnt);
	}

	const commissionByUserId = new Map<string, number>();
	for (const row of commissionRows) {
		commissionByUserId.set(row.staffId, row.total);
	}

	const revenueByPk = new Map<string, number>();
	for (const row of revenueRows as {
		trainerId: string | null;
		total: number;
	}[]) {
		if (row.trainerId) revenueByPk.set(row.trainerId, row.total);
	}

	const capacityByPk = new Map<string, number>();
	for (const row of capacityRows as {
		instructorId: string | null;
		totalCapacity: number;
	}[]) {
		if (row.instructorId) capacityByPk.set(row.instructorId, row.totalCapacity);
	}

	// Build result map keyed by userId
	const result = new Map<string, TrainerWeeklyStats>();
	for (const userId of memberIds) {
		const memberPk = userIdToMemberId.get(userId);
		const sessionsThisWeek = memberPk ? (sessionsByPk.get(memberPk) ?? 0) : 0;
		const commissionYtd = commissionByUserId.get(userId) ?? 0;
		const revenueGenerated = memberPk ? (revenueByPk.get(memberPk) ?? 0) : 0;
		const totalCapacity = memberPk ? (capacityByPk.get(memberPk) ?? 0) : 0;
		const utilizationPct =
			totalCapacity > 0
				? Math.min(100, Math.round((sessionsThisWeek / totalCapacity) * 100))
				: 0;

		result.set(userId, {
			memberId: userId,
			sessionsThisWeek,
			utilizationPct,
			commissionYtd,
			revenueGenerated,
		});
	}

	return result;
}

// ---------------------------------------------------------------------------
// 1.40 — getTrainerCustomers (distinct clients for a trainer)
// ---------------------------------------------------------------------------

export interface TrainerCustomer {
	userId: string;
	totalAppointments: number;
	completedCount: number;
	nextAppointmentAt: Date | null;
}

export async function getTrainerCustomers(
	tenantDb: TenantDb,
	memberId: string, // members.userId (cross-DB)
	limit = 20,
): Promise<TrainerCustomer[]> {
	// Resolve trainer's PK (members.id) from userId
	const memberRow = await tenantDb.query.members.findFirst({
		where: eq(members.userId, memberId),
		columns: { id: true },
	});
	if (!memberRow) return [];

	const now = new Date();

	// Aggregate per distinct client userId
	const rows = await tenantDb
		.select({
			userId: appointments.userId,
			total: count(),
			completed: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`,
			nextAt: min_start(appointments.startTime, now),
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.trainerId, memberRow.id),
				isNotNull(appointments.userId),
				ne(appointments.status, "cancelled"),
			),
		)
		.groupBy(appointments.userId)
		.limit(limit);

	return rows.map((r) => ({
		userId: r.userId as string,
		totalAppointments: Number(r.total),
		completedCount: Number(r.completed),
		nextAppointmentAt: r.nextAt ?? null,
	}));
}

function min_start(col: typeof appointments.startTime, after: Date) {
	return sql<Date | null>`MIN(${col}) FILTER (WHERE ${col} >= ${after.toISOString()})`;
}
