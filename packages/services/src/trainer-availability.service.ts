import { eq } from "drizzle-orm";
import { trainerAvailability } from "@avantej-core/db/schema/tenant/trainer-availability";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilitySlot = {
	dayOfWeek: string;
	startTime: string;
	endTime: string;
};

// ─── Constants ─────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
	monday: 0,
	tuesday: 1,
	wednesday: 2,
	thursday: 3,
	friday: 4,
	saturday: 5,
	sunday: 6,
};

// ─── List ───────────────────────────────────────────────────────────

export async function listTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
	const rows = await tenantDb.query.trainerAvailability.findMany({
		where: eq(trainerAvailability.trainerId, trainerId),
	});
	return rows.sort((a, b) => {
		const dayDiff =
			(DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
		if (dayDiff !== 0) return dayDiff;
		return a.startTime.localeCompare(b.startTime);
	});
}

// ─── Upsert (replace-all) ──────────────────────────────────────────

export async function upsertTrainerAvailability(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	trainerId: string,
	slots: AvailabilitySlot[],
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
	// Validate: endTime > startTime for each slot
	for (const slot of slots) {
		if (slot.endTime <= slot.startTime) {
			throw new Error(
				`Invalid time range: ${slot.startTime} – ${slot.endTime} on ${slot.dayOfWeek}`,
			);
		}
	}

	// Validate: no overlapping shifts on same day
	const byDay = new Map<string, AvailabilitySlot[]>();
	for (const slot of slots) {
		const daySlots = byDay.get(slot.dayOfWeek) ?? [];
		daySlots.push(slot);
		byDay.set(slot.dayOfWeek, daySlots);
	}
	for (const [day, daySlots] of byDay) {
		const sorted = daySlots.sort((a, b) =>
			a.startTime.localeCompare(b.startTime),
		);
		for (let i = 1; i < sorted.length; i++) {
			const current = sorted[i]!;
			const previous = sorted[i - 1]!;
			if (current.startTime < previous.endTime) {
				throw new Error(
					`Overlapping shifts on ${day}: ${previous.startTime}–${previous.endTime} and ${current.startTime}–${current.endTime}`,
				);
			}
		}
	}

	// Transaction: delete all existing → insert new
	return tenantDb.transaction(async (tx) => {
		await tx
			.delete(trainerAvailability)
			.where(eq(trainerAvailability.trainerId, trainerId));

		if (slots.length === 0) return [];

		const rows = await tx
			.insert(trainerAvailability)
			.values(
				slots.map((s) => ({
					trainerId,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
				})),
			)
			.returning();

		return rows;
	});
}

// ─── Delete single slot ────────────────────────────────────────────

export async function deleteTrainerAvailabilitySlot(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<void> {
	await tenantDb
		.delete(trainerAvailability)
		.where(eq(trainerAvailability.id, id));
}
