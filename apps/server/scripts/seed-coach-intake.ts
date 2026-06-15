/**
 * Seed Script: Coach Intake Availability
 *
 * Populates coach_intake_availability rows for existing trainers:
 *   - coach.alex@example.com — random/varied schedule
 *   - maya.trainer@example.com — deterministic weekday 09:00–13:00 & 15:00–17:00
 *   - daniel.fit@example.com — deterministic weekday 09:00–13:00 & 15:00–17:00
 *
 * Idempotent — skips trainers who already have intake rows.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-coach-intake.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { coachIntakeAvailability } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

// ─── intake definitions ──────────────────────────────────────────────────────

type SlotDef = { dayOfWeek: string; startTime: string; endTime: string };

const DETERMINISTIC_SLOTS: SlotDef[] = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
].flatMap((day) => [
	{ dayOfWeek: day, startTime: "09:00", endTime: "13:00" },
	{ dayOfWeek: day, startTime: "15:00", endTime: "17:00" },
]);

const ALEX_RANDOM_SLOTS: SlotDef[] = [
	{ dayOfWeek: "monday", startTime: "06:00", endTime: "09:00" },
	{ dayOfWeek: "monday", startTime: "17:00", endTime: "20:00" },
	{ dayOfWeek: "tuesday", startTime: "10:00", endTime: "14:00" },
	{ dayOfWeek: "wednesday", startTime: "07:00", endTime: "11:00" },
	{ dayOfWeek: "wednesday", startTime: "14:00", endTime: "16:00" },
	{ dayOfWeek: "thursday", startTime: "12:00", endTime: "18:00" },
	{ dayOfWeek: "friday", startTime: "08:00", endTime: "10:00" },
	{ dayOfWeek: "friday", startTime: "15:00", endTime: "19:00" },
	{ dayOfWeek: "saturday", startTime: "09:00", endTime: "12:00" },
	{ dayOfWeek: "sunday", startTime: "10:00", endTime: "13:00" },
];

const TRAINER_INTAKE: Array<{ email: string; slots: SlotDef[] }> = [
	{ email: "coach.alex@example.com", slots: ALEX_RANDOM_SLOTS },
	{ email: "maya.trainer@example.com", slots: DETERMINISTIC_SLOTS },
	{ email: "daniel.fit@example.com", slots: DETERMINISTIC_SLOTS },
];

// ─── env loader ──────────────────────────────────────────────────────────────

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				const key = match[1];
				const value = match[2];
				if (!process.env[key]) process.env[key] = value;
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars:", error);
	}
}

// ─── db helpers ──────────────────────────────────────────────────────────────

function createControlPanelDb(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle({ client: pool, schema: controlPanelSchema }), pool };
}

function createTenantDb(connectionString: string) {
	const pool = new Pool({ connectionString });
	return { db: drizzle({ client: pool, schema: tenantSchema }), pool };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function seedCoachIntake() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log("Starting coach intake availability seed...\n");

	const { db: controlDb, pool: controlPool } =
		createControlPanelDb(databaseUrl);
	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error(`Organization not found: ${TARGET_ORG_ID}`);
		console.log(`Found org: ${org.name}\n`);

		const tenantConnStr = decrypt(org.connectionString);
		const { db: tenantDb, pool } = createTenantDb(tenantConnStr);
		tenantPool = pool;

		for (const { email, slots } of TRAINER_INTAKE) {
			console.log(`Processing ${email}...`);

			const user = await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, email.toLowerCase()),
			});
			if (!user) {
				console.log(`  SKIP — user not found. Run seed-trainers.ts first.`);
				continue;
			}

			const member = await tenantDb.query.members.findFirst({
				where: (m, { eq }) => eq(m.userId, user.id),
			});
			if (!member) {
				console.log(
					`  SKIP — tenant member not found. Run seed-trainers.ts first.`,
				);
				continue;
			}

			const existing = await tenantDb.query.coachIntakeAvailability.findMany({
				where: (cia, { eq }) => eq(cia.trainerId, member.id),
			});
			if (existing.length > 0) {
				console.log(
					`  Already has ${existing.length} intake slots — skipping.`,
				);
				continue;
			}

			const rows = slots.map((s) => ({
				trainerId: member.id,
				dayOfWeek: s.dayOfWeek,
				startTime: s.startTime,
				endTime: s.endTime,
				isActive: true,
			}));

			await tenantDb.insert(coachIntakeAvailability).values(rows);
			console.log(`  Inserted ${rows.length} intake slots.`);
		}

		console.log("\n" + "=".repeat(60));
		console.log("COACH INTAKE SEED SUMMARY");
		console.log("=".repeat(60));
		for (const { email, slots } of TRAINER_INTAKE) {
			const days = [...new Set(slots.map((s) => s.dayOfWeek))];
			console.log(`  ${email}`);
			console.log(
				`    ${slots.length} slots across ${days.length} days: ${days.join(", ")}`,
			);
		}
		console.log("=".repeat(60));
	} catch (error) {
		console.error("\nSeed failed:", error);
		throw error;
	} finally {
		await controlPool.end();
		if (tenantPool) await tenantPool.end();
	}
}

if (import.meta.main) {
	seedCoachIntake()
		.then(() => {
			console.log("\nSeed script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Seed script failed:", error);
			process.exit(1);
		});
}

export { seedCoachIntake };
