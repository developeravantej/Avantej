/**
 * Verify the union read for trainer availability:
 *   trainer_availability ∪ coach_intake_availability  (deduped)
 *
 * For every trainer in the tenant, prints:
 *   (trainer_availability_count, coach_intake_count, merged_window_count by day)
 *
 * Also smoke-tests the timezone helpers on a known appointment by printing
 * the appointment's UTC startTime alongside its HH:MM in the org's timezone.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/check-trainer-availability-union.ts [orgSlug]
 *   # default orgSlug = "test-fitness-franchise"
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined) {
				if (!process.env[m[1]]) process.env[m[1]] = m[2];
			}
		}
	} catch (err) {
		console.warn("Could not load .dev.vars:", err);
	}
}

function toHHMMInTz(date: Date, tz: string): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const h = parts.find((p) => p.type === "hour")?.value ?? "00";
	const m = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${h === "24" ? "00" : h}:${m}`;
}

async function main() {
	loadDevVars();
	const orgSlug = process.argv[2] ?? "test-fitness-franchise";

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({
		client: controlPool,
		schema: controlPanelSchema,
	});
	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.slug, orgSlug),
		});
		if (!org) throw new Error(`Org not found: ${orgSlug}`);
		const orgTimezone =
			(org as { timezone?: string }).timezone ?? "Asia/Kuala_Lumpur";
		console.log(`Org:      ${org.name} (${org.id})`);
		console.log(`Slug:     ${org.slug}`);
		console.log(`Timezone: ${orgTimezone}`);

		const tenantConn = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConn });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// 1. List trainers (members.role = 'trainer', not soft-deleted)
		const trainers = await tenantDb
			.select({
				id: tenantSchema.members.id,
				userId: tenantSchema.members.userId,
				status: tenantSchema.members.status,
			})
			.from(tenantSchema.members)
			.where(eq(tenantSchema.members.role, "trainer"));

		console.log(`\nTrainers found: ${trainers.length}`);

		// Resolve user names in one batch
		const userIds = [...new Set(trainers.map((t) => t.userId))];
		const userRows = userIds.length
			? await controlDb
					.select({
						id: controlPanelSchema.user.id,
						name: controlPanelSchema.user.name,
						email: controlPanelSchema.user.email,
					})
					.from(controlPanelSchema.user)
					.where(inArray(controlPanelSchema.user.id, userIds))
			: [];
		const userMap = new Map(userRows.map((u) => [u.id, u]));

		for (const trainer of trainers) {
			const u = userMap.get(trainer.userId);
			const label = u?.name ?? u?.email ?? `(user ${trainer.userId})`;

			const taRows = await tenantDb
				.select()
				.from(tenantSchema.trainerAvailability)
				.where(
					eq(tenantSchema.trainerAvailability.trainerId, trainer.id),
				);
			const ciRows = await tenantDb
				.select()
				.from(tenantSchema.coachIntakeAvailability)
				.where(
					and(
						eq(
							tenantSchema.coachIntakeAvailability.trainerId,
							trainer.id,
						),
						eq(tenantSchema.coachIntakeAvailability.isActive, true),
					),
				);

			const seen = new Set<string>();
			const mergedByDay = new Map<string, number>();
			for (const row of [...taRows, ...ciRows]) {
				const key = `${row.dayOfWeek}|${row.startTime}|${row.endTime}`;
				if (seen.has(key)) continue;
				seen.add(key);
				mergedByDay.set(
					row.dayOfWeek,
					(mergedByDay.get(row.dayOfWeek) ?? 0) + 1,
				);
			}

			console.log(
				`\n- ${label} [${trainer.id}] status=${trainer.status}`,
			);
			console.log(
				`    trainer_availability rows: ${taRows.length}, coach_intake rows: ${ciRows.length}, merged windows: ${seen.size}`,
			);
			if (mergedByDay.size > 0) {
				const days = [...mergedByDay.entries()]
					.map(([d, n]) => `${d}=${n}`)
					.join(", ");
				console.log(`    by day: ${days}`);
			}
		}

		// 2. Smoke-test tz helpers on the most recent non-cancelled appointment
		const recent = await tenantDb
			.select({
				id: tenantSchema.appointments.id,
				trainerId: tenantSchema.appointments.trainerId,
				startTime: tenantSchema.appointments.startTime,
				endTime: tenantSchema.appointments.endTime,
				status: tenantSchema.appointments.status,
			})
			.from(tenantSchema.appointments)
			.limit(3);

		console.log(`\nTimezone helper smoke test (org tz = ${orgTimezone}):`);
		if (recent.length === 0) {
			console.log("  (no appointments to test)");
		} else {
			for (const appt of recent) {
				console.log(
					`  appt ${appt.id} status=${appt.status}`,
				);
				console.log(
					`    UTC startTime: ${appt.startTime.toISOString()}  →  HH:MM in ${orgTimezone}: ${toHHMMInTz(appt.startTime, orgTimezone)}`,
				);
				console.log(
					`    UTC endTime:   ${appt.endTime.toISOString()}  →  HH:MM in ${orgTimezone}: ${toHHMMInTz(appt.endTime, orgTimezone)}`,
				);
			}
		}
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
