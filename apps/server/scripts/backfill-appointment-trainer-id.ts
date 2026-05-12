/**
 * Backfill appointments.trainerId from appointment_staff (lowest slotIndex).
 *
 * Since the create path is now writing appointment_staff rows correctly but
 * leaving the legacy trainerId column null, run this once to sync historical
 * data so the column matches the join.
 *
 * - staffId in appointment_staff may be either members.id or members.userId
 *   depending on which UI created the row. We try both.
 * - Only updates rows where appointments.trainerId IS NULL.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-appointment-trainer-id.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { members } from "@avantej-core/db/schema/tenant/members";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars() {
	const p = join(__dirname, "../.dev.vars");
	for (const line of readFileSync(p, "utf-8").split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const m = t.match(/^([^=]+)=(.*)$/);
		if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) process.env[m[1]] = m[2];
	}
}

async function main() {
	loadDevVars();
	const cp = drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL! }), schema: controlPanelSchema });
	const org = await cp.query.organizations.findFirst({ where: (o, { eq }) => eq(o.id, TARGET_ORG_ID) });
	if (!org) throw new Error("Org not found");
	const db = drizzle({ client: new Pool({ connectionString: decrypt(org.connectionString) }), schema: tenantSchema });

	// 1. Find appointments with null trainerId that DO have appointment_staff rows.
	const nullTrainerAppts = await db.select({ id: appointments.id }).from(appointments).where(isNull(appointments.trainerId));
	if (nullTrainerAppts.length === 0) {
		console.log("No null-trainerId appointments. Nothing to do.");
		process.exit(0);
	}

	const apptIds = nullTrainerAppts.map((a) => a.id);
	const staffRows = await db
		.select({ appointmentId: appointmentStaff.appointmentId, staffId: appointmentStaff.staffId, slotIndex: appointmentStaff.slotIndex })
		.from(appointmentStaff)
		.where(inArray(appointmentStaff.appointmentId, apptIds))
		.orderBy(asc(appointmentStaff.slotIndex));

	if (staffRows.length === 0) {
		console.log(`${nullTrainerAppts.length} appointments with null trainerId, but no appointment_staff rows match. Nothing to backfill.`);
		process.exit(0);
	}

	// Pick the lowest-slot staffId per appointment.
	const primary = new Map<string, string>();
	for (const r of staffRows) {
		if (!primary.has(r.appointmentId)) primary.set(r.appointmentId, r.staffId);
	}

	// Resolve each staffId to members.id (handle both id-form and userId-form).
	const staffIds = [...new Set(primary.values())];
	const memRows = await db
		.select({ id: members.id, userId: members.userId })
		.from(members)
		.where(or(inArray(members.id, staffIds), inArray(members.userId, staffIds)));
	const staffIdToMemberId = new Map<string, string>();
	for (const m of memRows) {
		staffIdToMemberId.set(m.id, m.id);
		staffIdToMemberId.set(m.userId, m.id);
	}

	let updated = 0;
	let skipped = 0;
	for (const [apptId, staffId] of primary) {
		const memberId = staffIdToMemberId.get(staffId);
		if (!memberId) {
			console.warn(`  skip: staffId ${staffId} (appt ${apptId.slice(0, 8)}) does not match any member`);
			skipped++;
			continue;
		}
		await db
			.update(appointments)
			.set({ trainerId: memberId, updatedAt: new Date() })
			.where(and(eq(appointments.id, apptId), isNull(appointments.trainerId)));
		updated++;
	}

	console.log(`Backfill complete: updated=${updated}, skipped=${skipped}, total null-trainer appointments scanned=${apptIds.length}`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
