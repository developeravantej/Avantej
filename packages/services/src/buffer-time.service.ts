/**
 * Buffer Time Service
 *
 * Resolves the effective buffer time for a service/staff combination
 * and checks for appointment conflicts respecting buffer windows.
 *
 * Resolution cascade:
 *   1. Staff override (member_service_buffer_overrides.bufferTimeMinutes) — per service, most specific
 *   2. Category default (service_category_config.bufferTimeMinutes)
 *   3. 0 (no buffer)
 */

import { eq, and, ne, lt, gt } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberServiceBufferOverrides } from "@avantej-core/db/schema/tenant/member-service-buffer-overrides";
import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

function addMinutes(date: Date, minutes: number): Date {
	const result = new Date(date);
	result.setMinutes(result.getMinutes() + minutes);
	return result;
}

/**
 * Resolve the effective buffer time (in minutes) for a service + optional staff member.
 *
 * Returns the staff's category-level override if set, otherwise the category default, otherwise 0.
 */
export async function resolveBufferTime(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	serviceId: string,
	staffMemberId?: string,
): Promise<number> {
	// 1. Check staff service-level override — no service fetch needed for this step
	if (staffMemberId) {
		const override =
			await tenantDb.query.memberServiceBufferOverrides.findFirst({
				where: and(
					eq(memberServiceBufferOverrides.memberId, staffMemberId),
					eq(memberServiceBufferOverrides.serviceId, serviceId),
				),
				columns: { bufferTimeMinutes: true },
			});
		if (override != null) {
			return override.bufferTimeMinutes;
		}
	}

	// 2. Fallback to category config
	const service = await tenantDb.query.services.findFirst({
		where: eq(services.id, serviceId),
		columns: { categoryId: true },
	});
	if (service?.categoryId) {
		const config = await tenantDb.query.serviceCategoryConfig.findFirst({
			where: eq(serviceCategoryConfig.categoryId, service.categoryId),
			columns: { bufferTimeMinutes: true },
		});
		if (config) {
			return config.bufferTimeMinutes;
		}
	}

	// 3. No buffer
	return 0;
}

export type CheckBufferConflictParams = {
	trainerId: string;
	startTime: Date;
	endTime: Date;
	bufferTimeMinutes: number;
	excludeAppointmentId?: string;
};

/**
 * Check whether a proposed appointment window (with buffer) conflicts with
 * any existing non-cancelled appointments for the same trainer.
 */
export async function checkAppointmentBufferConflict(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CheckBufferConflictParams,
): Promise<{ hasConflict: boolean; conflictingAppointmentId?: string }> {
	const bufferedStart = addMinutes(params.startTime, -params.bufferTimeMinutes);
	const bufferedEnd = addMinutes(params.endTime, params.bufferTimeMinutes);

	const conditions = [
		eq(appointments.trainerId, params.trainerId),
		ne(appointments.status, "cancelled"),
		lt(appointments.startTime, bufferedEnd),
		gt(appointments.endTime, bufferedStart),
	];

	if (params.excludeAppointmentId) {
		conditions.push(ne(appointments.id, params.excludeAppointmentId));
	}

	const conflicts = await tenantDb
		.select({ id: appointments.id })
		.from(appointments)
		.where(and(...conditions))
		.limit(1);

	return {
		hasConflict: conflicts.length > 0,
		conflictingAppointmentId: conflicts[0]?.id,
	};
}
