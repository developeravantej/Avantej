/**
 * CanonicalService[] → services (Avantej's services table absorbed packages, so
 * a legacy PT program maps cleanly here: sessionCount/expiryDays/price live on
 * services). categoryId/branchId left null (org-wide); the country/pricing-tier
 * baked into product_code and the currency belong in service_prices per branch —
 * deferred to the multi-currency workstream and flagged.
 */
import { sql } from "drizzle-orm";
import type { CanonicalService } from "../canonical";
import { lookup, record } from "../crosswalk";
import type { Tx } from "../../lib/db";
import type { MigrationLog } from "../../lib/log";

interface Ctx {
	tx: Tx;
	log: MigrationLog;
}

export async function loadServices(
	services: CanonicalService[],
	ctx: Ctx,
): Promise<void> {
	const { tx, log } = ctx;

	for (const s of services) {
		if (await lookup(tx, "product", s.legacyId, s.sourceSystem)) {
			log.skipped("service", s.name);
			continue;
		}

		const r = await tx.execute(sql`
			INSERT INTO services
				(name, duration, duration_unit_type, max_attendees, type, is_active,
				 price, session_count, expirable, expiry_days)
			VALUES
				(${s.name}, ${s.durationSeconds}, 'minutes', ${s.maxAttendees}, ${s.type}, ${s.isActive},
				 ${s.priceCents}, ${s.sessionCount}, ${s.expiryDays != null}, ${s.expiryDays})
			RETURNING id
		`);
		const id = r.rows[0]?.id;
		if (typeof id !== "string")
			throw new Error(`service insert failed: ${s.name}`);
		await record(tx, "product", s.legacyId, s.sourceSystem, "services", id);
		log.created("service", s.name);
	}

	if (services.length > 0) {
		log.dropField(
			"service.duration (defaulted — no source per-session length)",
		);
		log.dropField(
			"product currency / pricing_tier / effective dates → service_prices (multi-currency)",
		);
	}
}
