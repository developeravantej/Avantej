/**
 * Reconciliation — the sign-off gate. Compares expected (from source) vs actual
 * (queried in-DB, inside the load tx). Phase 1 does counts; financial tie-outs
 * (sum of payments, outstanding AR, credits remaining) plug in as later loaders
 * land. A failing check should block --commit.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "../lib/db";

export interface Check {
	label: string;
	expected: number;
	actual: number;
	ok: boolean;
}

export async function countCheck(
	tx: Tx,
	label: string,
	expected: number,
	countSql: ReturnType<typeof sql>,
): Promise<Check> {
	const r = await tx.execute(countSql);
	const raw = r.rows[0]?.count;
	const actual = typeof raw === "number" ? raw : Number(raw ?? 0);
	return { label, expected, actual, ok: actual === expected };
}

export function reportChecks(checks: Check[]): boolean {
	console.log("\n── reconciliation ──");
	let allOk = true;
	for (const c of checks) {
		const mark = c.ok ? "✓" : "✗";
		if (!c.ok) allOk = false;
		console.log(
			`  ${mark} ${c.label}: expected ${c.expected}, got ${c.actual}`,
		);
	}
	console.log(
		allOk ? "  → all checks passed" : "  → CHECKS FAILED — do not commit",
	);
	return allOk;
}
