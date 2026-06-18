/**
 * TEST-ONLY helper: backdate a package's earliest pending installment (and the
 * package's nextDueDate) into the past, so the overdue→lock journey can be
 * recorded. There is no API path to do this — `installments.reschedule` rejects
 * past dates by design — so this writes directly to the tenant DB.
 *
 * Usage (from repo root):
 *   bun run apps/server/scripts/e2e-backdate-installment.ts <packageInstanceId> [daysAgo]
 *
 * Targets the e2e test tenant (TEST_ORG_ID). Exits non-zero on any failure so
 * the calling Playwright spec fails loudly rather than silently skipping the lock.
 */

import { decrypt } from "@avantej-core/db";
import { evaluateAndLockIfOverdue } from "@avantej-core/services";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { and, asc, eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const TEST_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const [key, ...rest] = t.split("=");
			if (key && rest.length > 0) {
				process.env[key.trim()] = rest
					.join("=")
					.trim()
					.replace(/^["']|["']$/g, "");
			}
		}
	} catch (e) {
		console.warn("Could not load .dev.vars:", e);
	}
}

async function main() {
	const packageInstanceId = process.argv[2];
	const daysAgo = Number.parseInt(process.argv[3] ?? "30", 10);
	if (!packageInstanceId) {
		console.error(
			"Usage: e2e-backdate-installment.ts <packageInstanceId> [daysAgo]",
		);
		process.exit(1);
	}

	loadDevVars();
	const cpDb = getControlPanelDb();
	const [org] = await cpDb
		.select({ connectionString: organizations.connectionString })
		.from(organizations)
		.where(eq(organizations.id, TEST_ORG_ID));
	if (!org?.connectionString) {
		console.error("Test org has no connectionString");
		process.exit(1);
	}

	const pool = new Pool({ connectionString: decrypt(org.connectionString) });
	const tenantDb = drizzle({ client: pool, schema: tenantSchema });

	const pastDue = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

	const [nextPending] = await tenantDb
		.select({ id: installments.id, n: installments.installmentNumber })
		.from(installments)
		.where(
			and(
				eq(installments.packageInstanceId, packageInstanceId),
				eq(installments.status, "pending"),
			),
		)
		.orderBy(asc(installments.installmentNumber))
		.limit(1);
	if (!nextPending) {
		console.error(
			"No pending installment found for package",
			packageInstanceId,
		);
		process.exit(1);
	}

	// Backdate the installment due date AND pre-set an already-expired grace
	// period, so the first evaluateAndLockIfOverdue (triggered by getPackageState)
	// takes the LOCK branch immediately. Also force paymentPlanType non-null —
	// evaluateAndLockIfOverdue early-returns when it's null.
	await tenantDb
		.update(installments)
		.set({ dueDate: pastDue })
		.where(eq(installments.id, nextPending.id));
	await tenantDb
		.update(packageInstances)
		.set({
			nextDueDate: pastDue,
			gracePeriodEndsAt: pastDue,
			paymentPlanType: "quarterly",
		})
		.where(eq(packageInstances.id, packageInstanceId));

	// Run the REAL lock evaluator (the same function the nightly sweep calls).
	// getPackageState only evaluates when context.installmentLockOnOpen is set, so
	// we invoke it directly here — this is the genuine lock logic, not a faked flag.
	// biome-ignore lint/suspicious/noExplicitAny: cross-package drizzle client typing
	await evaluateAndLockIfOverdue(tenantDb as any, packageInstanceId);

	const [check] = await tenantDb
		.select({
			isLocked: packageInstances.isLocked,
			lockedReason: packageInstances.lockedReason,
		})
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId));

	await pool.end();
	console.log(
		`backdated installment #${nextPending.n} (${daysAgo}d ago) + ran lock evaluator; pkg now:`,
		JSON.stringify(check),
	);
	if (!check?.isLocked) {
		console.error("Lock evaluator did NOT lock the package");
		process.exit(1);
	}
}

main().catch((e) => {
	console.error("backdate failed:", e);
	process.exit(1);
});
