/**
 * Pluggable write strategy — the scale seam.
 *
 * BatchInsertWriter (here) handles Small/Medium via chunked multi-row INSERTs.
 * For Large (>500k) add a CopyStagingWriter implementing the same interface
 * (COPY into mig_src_* → set-based SQL). Loaders depend on the interface, so the
 * strategy swaps without touching them.
 *
 * Table/column identifiers are passed by the loaders (never user input), so
 * sql.raw for them is safe; all VALUES are parameterized.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "../lib/db";

export interface Writer {
	/** Bulk insert rows (each a column-ordered tuple) into a table. */
	insertMany(
		table: string,
		columns: string[],
		rows: unknown[][],
		onConflict?: string,
	): Promise<void>;
}

export class BatchInsertWriter implements Writer {
	constructor(
		private readonly tx: Tx,
		private readonly batchSize = 1000,
	) {}

	async insertMany(
		table: string,
		columns: string[],
		rows: unknown[][],
		onConflict?: string,
	): Promise<void> {
		if (rows.length === 0) return;
		const colSql = sql.raw(columns.join(", "));
		const conflictSql = onConflict ? sql.raw(` ${onConflict}`) : sql``;

		for (let i = 0; i < rows.length; i += this.batchSize) {
			const batch = rows.slice(i, i + this.batchSize);
			const valuesSql = sql.join(
				batch.map(
					(r) =>
						sql`(${sql.join(
							r.map((v) => sql`${v}`),
							sql`, `,
						)})`,
				),
				sql`, `,
			);
			await this.tx.execute(
				sql`INSERT INTO ${sql.raw(table)} (${colSql}) VALUES ${valuesSql}${conflictSql}`,
			);
		}
	}
}
