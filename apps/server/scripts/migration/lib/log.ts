/** Tiny logger with per-entity counters for reconciliation. */
export class MigrationLog {
	private counts: Record<string, { created: number; skipped: number }> = {};
	readonly dropped = new Set<string>();

	private bucket(entity: string) {
		this.counts[entity] ??= { created: 0, skipped: 0 };
		return this.counts[entity];
	}

	created(entity: string, label?: string) {
		this.bucket(entity).created++;
		if (label) console.log(`  + ${entity}: ${label}`);
	}

	skipped(entity: string, label?: string) {
		this.bucket(entity).skipped++;
		if (label) console.log(`  = ${entity} (exists): ${label}`);
	}

	/** Record a source field that has no target home yet (needs a schema migration). */
	dropField(field: string) {
		this.dropped.add(field);
	}

	info(msg: string) {
		console.log(msg);
	}

	summary() {
		console.log("\n── load summary ──");
		for (const [entity, c] of Object.entries(this.counts)) {
			console.log(`  ${entity}: ${c.created} created, ${c.skipped} skipped`);
		}
		if (this.dropped.size > 0) {
			console.log(
				`\n⚠ source fields with no target column (need migration 0095+):\n  ${[...this.dropped].join(", ")}`,
			);
		}
	}
}
