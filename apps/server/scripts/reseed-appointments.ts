/**
 * Reseed Appointments
 *
 * 1. Deletes all existing appointments from the tenant DB
 * 2. Inserts realistic appointments spread across the current month
 *    using real trainer / member / service IDs from the DB.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/reseed-appointments.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { appointments } from "@avantej-core/db/schema/tenant/index";
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

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				if (!process.env[match[1]]) process.env[match[1]] = match[2];
			}
		}
	} catch {
		console.warn("Could not load .dev.vars");
	}
}

function addMinutes(date: Date, mins: number): Date {
	return new Date(date.getTime() + mins * 60_000);
}

function dateAt(year: number, month: number, day: number, hour: number, minute = 0): Date {
	return new Date(year, month, day, hour, minute, 0, 0);
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });

	// Resolve tenant connection string
	const org = await controlDb.query.organizations.findFirst({
		where: (o, { eq }) => eq(o.id, TARGET_ORG_ID),
	});
	if (!org) throw new Error(`Org ${TARGET_ORG_ID} not found`);

	const connectionString = decrypt(org.connectionString);
	const tenantPool = new Pool({ connectionString });
	const db = drizzle({ client: tenantPool, schema: tenantSchema });

	try {
		// ── 1. Fetch real IDs ────────────────────────────────────────────────────
		const trainers = await db.query.members.findMany({
			where: (m, { eq }) => eq(m.role, "trainer"),
		});
		const allServices = await db.query.services.findMany({ limit: 10 });
		const branches = await db.query.hierarchyNodes.findMany({
			where: (n, { eq }) => eq(n.depth, 4),
			limit: 1,
		});

		if (trainers.length === 0) throw new Error("No trainers found — run seed-trainers.ts first");
		if (allServices.length === 0) throw new Error("No services found — run seed-business-data.ts first");
		if (branches.length === 0) throw new Error("No branch node found");

		const branchId = branches[0]!.id;
		const serviceIds = allServices.map((s) => s.id);

		console.log(`Found ${trainers.length} trainer(s), ${serviceIds.length} service(s), branch: ${branchId}`);
		console.log("Trainers:", trainers.map((t) => `${t.name} (${t.id})`).join(", "));

		// ── 2. Delete all existing appointments ─────────────────────────────────
		const deleted = await db.delete(appointments);
		console.log(`\nDeleted all existing appointments.`);

		// ── 3. Build seed data ───────────────────────────────────────────────────
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth(); // 0-indexed

		// Helper to pick a value from array by index (cycling)
		const pick = <T>(arr: T[], i: number): T => arr[i % arr.length]!;

		type Status = "pending" | "confirmed" | "cancelled";

		interface ApptSeed {
			day: number;
			hour: number;
			minute?: number;
			duration: number;
			trainerIdx: number;
			serviceIdx: number;
			clientName: string;
			status: Status;
			description?: string;
		}

		const seeds: ApptSeed[] = [
			// Week 1 — mix of past (confirmed/no-show) and future (pending)
			{ day: 1,  hour: 9,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Liam Tan",      status: "confirmed", description: "Strength warm-up session" },
			{ day: 1,  hour: 11, duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Aisyah Malik",  status: "confirmed" },
			{ day: 2,  hour: 8,  duration: 90,  trainerIdx: 0, serviceIdx: 0, clientName: "Wei Jian",      status: "confirmed", description: "Deadlift progression" },
			{ day: 2,  hour: 14, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Priya Nair",    status: "cancelled" },
			{ day: 3,  hour: 10, duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Jason Lim",     status: "confirmed" },
			{ day: 3,  hour: 16, duration: 45,  trainerIdx: 0, serviceIdx: 0, clientName: "Sara Abdullah", status: "cancelled", description: "No-show — client did not arrive" },
			{ day: 4,  hour: 9,  duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Ravi Kumar",    status: "confirmed" },
			{ day: 4,  hour: 11, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Mei Ling",      status: "confirmed", description: "Squat form check" },
			{ day: 5,  hour: 8,  duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Farah Zainudin",status: "confirmed" },
			{ day: 5,  hour: 13, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Chris Ng",      status: "confirmed" },
			{ day: 6,  hour: 10, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Nurul Ain",     status: "confirmed" },
			{ day: 7,  hour: 9,  duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "David Chia",    status: "confirmed" },

			// Week 2
			{ day: 8,  hour: 9,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Liam Tan",      status: "confirmed" },
			{ day: 8,  hour: 14, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Siti Rahimah",  status: "confirmed", description: "Core stability focus" },
			{ day: 9,  hour: 10, duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Aisyah Malik",  status: "confirmed" },
			{ day: 9,  hour: 16, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Ahmad Hafiz",   status: "cancelled" },
			{ day: 10, hour: 8,  duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Priya Nair",    status: "confirmed" },
			{ day: 10, hour: 11, duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Jason Lim",     status: "confirmed" },
			{ day: 11, hour: 9,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Wei Jian",      status: "confirmed", description: "Bench press milestone session" },
			{ day: 12, hour: 10, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Ravi Kumar",    status: "confirmed" },
			{ day: 13, hour: 9,  duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Farah Zainudin",status: "confirmed" },
			{ day: 14, hour: 11, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Mei Ling",      status: "confirmed" },

			// Week 3 — current/upcoming week (pending or confirmed depending on today)
			{ day: 15, hour: 8,  duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Chris Ng",      status: "pending" },
			{ day: 15, hour: 10, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Liam Tan",      status: "pending", description: "Monthly progress check" },
			{ day: 16, hour: 9,  duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Nurul Ain",     status: "pending" },
			{ day: 16, hour: 14, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "David Chia",    status: "pending" },
			{ day: 17, hour: 8,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Sara Abdullah", status: "pending" },
			{ day: 17, hour: 11, duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Aisyah Malik",  status: "pending" },
			{ day: 18, hour: 9,  duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Siti Rahimah",  status: "pending", description: "Flexibility & recovery" },
			{ day: 18, hour: 16, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Ahmad Hafiz",   status: "pending" },
			{ day: 19, hour: 10, duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Jason Lim",     status: "pending" },
			{ day: 20, hour: 9,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Wei Jian",      status: "pending" },
			{ day: 21, hour: 11, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Ravi Kumar",    status: "pending" },

			// Week 4 — future pending
			{ day: 22, hour: 9,  duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Farah Zainudin",status: "pending" },
			{ day: 22, hour: 14, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Mei Ling",      status: "pending", description: "Overhead press focus" },
			{ day: 23, hour: 8,  duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "Chris Ng",      status: "pending" },
			{ day: 23, hour: 10, duration: 90,  trainerIdx: 1, serviceIdx: 1, clientName: "Nurul Ain",     status: "pending" },
			{ day: 24, hour: 9,  duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Liam Tan",      status: "pending" },
			{ day: 24, hour: 16, duration: 60,  trainerIdx: 2, serviceIdx: 2, clientName: "David Chia",    status: "pending" },
			{ day: 25, hour: 9,  duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Aisyah Malik",  status: "pending" },
			{ day: 26, hour: 10, duration: 60,  trainerIdx: 0, serviceIdx: 0, clientName: "Sara Abdullah", status: "pending", description: "End-of-month assessment" },
			{ day: 27, hour: 9,  duration: 90,  trainerIdx: 2, serviceIdx: 2, clientName: "Siti Rahimah",  status: "pending" },
			{ day: 28, hour: 11, duration: 60,  trainerIdx: 1, serviceIdx: 1, clientName: "Ahmad Hafiz",   status: "pending" },
		];

		// Resolve status: if the day has already passed, pending → confirmed (makes realistic past data)
		const today = new Date(y, m, now.getDate());

		const rows = seeds
			.filter((s) => {
				// Skip days that don't exist in this month
				const daysInMonth = new Date(y, m + 1, 0).getDate();
				return s.day <= daysInMonth;
			})
			.map((s) => {
				const apptDate = dateAt(y, m, s.day, s.hour, s.minute ?? 0);
				const isPast = apptDate < today;
				let status: Status = s.status;
				if (isPast && status === "pending") status = "confirmed";

				const trainer = pick(trainers, s.trainerIdx);
				const serviceId = pick(serviceIds, s.serviceIdx);
				const startTime = apptDate;
				const endTime = addMinutes(startTime, s.duration);

				return {
					type: "private" as const,
					startTime,
					endTime,
					duration: s.duration,
					branchId,
					serviceId,
					status,
					sessionTotal: 0,
					pricePerClient: 0,
					trainerId: trainer.id,
					description: s.description ?? null,
					notes: null,
					createdBy: trainer.userId,
					isRecurring: false,
					conflictResolved: false,
					paymentStatus: "pending" as const,
				};
			});

		// ── 4. Insert in batches ─────────────────────────────────────────────────
		const BATCH = 20;
		let inserted = 0;
		for (let i = 0; i < rows.length; i += BATCH) {
			await db.insert(appointments).values(rows.slice(i, i + BATCH));
			inserted += Math.min(BATCH, rows.length - i);
		}

		console.log(`\nInserted ${inserted} appointments for ${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`);
		console.log("Done.");
	} finally {
		await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
