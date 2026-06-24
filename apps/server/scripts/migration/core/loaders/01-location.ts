/**
 * CanonicalBranch[] → hierarchy_nodes tree (+ branch_details).
 *
 * Flat country/state on each branch → synthesized org → country → state → branch
 * tree (dedup countries/states; denormalize country_node_id). Branch identity is
 * crosswalked on (legacyId, sourceSystem) for idempotency. branch_details
 * (address) is written via the Writer; extended attributes are deferred until
 * migration 0095, manager link deferred to the post-staff 2nd pass.
 */
import { sql } from "drizzle-orm";
import type { CanonicalBranch } from "../canonical";
import { lookup, record } from "../crosswalk";
import type { Tx } from "../../lib/db";
import type { MigrationLog } from "../../lib/log";
import { slugify } from "../../lib/slug";
import type { Writer } from "../writer";

interface Ctx {
	tx: Tx;
	rootId: string;
	writer: Writer;
	log: MigrationLog;
}

async function insertNode(
	tx: Tx,
	node: {
		type: "country" | "state" | "branch";
		name: string;
		parentId: string;
		depth: number;
		countryNodeId: string | null;
	},
): Promise<string> {
	const r = await tx.execute(sql`
		INSERT INTO hierarchy_nodes (name, slug, type, parent_id, depth, country_node_id)
		VALUES (${node.name}, ${slugify(node.name)}, ${node.type}, ${node.parentId}, ${node.depth}, ${node.countryNodeId})
		RETURNING id
	`);
	const id = r.rows[0]?.id;
	if (typeof id !== "string") throw new Error(`insert failed: ${node.name}`);
	return id;
}

async function getOrCreateNode(
	tx: Tx,
	node: {
		type: "country" | "state";
		name: string;
		parentId: string;
		depth: number;
		countryNodeId: string | null;
	},
	log: MigrationLog,
): Promise<string> {
	const found = await tx.execute(sql`
		SELECT id FROM hierarchy_nodes
		WHERE type = ${node.type} AND name = ${node.name} AND parent_id = ${node.parentId}
		LIMIT 1
	`);
	const existing = found.rows[0]?.id;
	if (typeof existing === "string") {
		log.skipped(node.type, node.name);
		return existing;
	}
	const id = await insertNode(tx, node);
	log.created(node.type, node.name);
	return id;
}

export async function loadLocations(
	branches: CanonicalBranch[],
	ctx: Ctx,
): Promise<void> {
	const { tx, rootId, writer, log } = ctx;
	const countryCache = new Map<string, string>();
	const stateCache = new Map<string, string>();
	const branchDetailRows: unknown[][] = [];

	for (const b of branches) {
		const country = (b.country || "Unknown").trim();
		const state = (b.state || country).trim();

		let countryId = countryCache.get(country);
		if (!countryId) {
			countryId = await getOrCreateNode(
				tx,
				{
					type: "country",
					name: country,
					parentId: rootId,
					depth: 1,
					countryNodeId: null,
				},
				log,
			);
			countryCache.set(country, countryId);
		}

		const stateKey = `${country}::${state}`;
		let stateId = stateCache.get(stateKey);
		if (!stateId) {
			stateId = await getOrCreateNode(
				tx,
				{
					type: "state",
					name: state,
					parentId: countryId,
					depth: 2,
					countryNodeId: countryId,
				},
				log,
			);
			stateCache.set(stateKey, stateId);
		}

		const already = await lookup(tx, "location", b.legacyId, b.sourceSystem);
		if (already) {
			log.skipped("branch", b.name);
			continue;
		}

		const branchNodeId = await insertNode(tx, {
			type: "branch",
			name: b.name,
			parentId: stateId,
			depth: 3,
			countryNodeId: countryId,
		});
		await record(
			tx,
			"location",
			b.legacyId,
			b.sourceSystem,
			"hierarchy_nodes",
			branchNodeId,
		);

		if (b.address) branchDetailRows.push([branchNodeId, b.address]);
		log.created("branch", b.name);

		// Carried-but-unhoused (need migration 0095) + deferred manager link.
		for (const [k, v] of Object.entries({
			branch_code: b.branchCode,
			display_name: b.displayName,
			branch_tier: b.branchTier,
			pricing_tier: b.pricingTier,
			status: b.status,
			country_code: b.countryCode,
			collective: b.collective,
			region: b.region,
		})) {
			if (v) log.dropField(k);
		}
		if (b.managerLegacyStaffId)
			log.dropField("branch_manager_staff_id (2nd pass)");
	}

	await writer.insertMany(
		"branch_details",
		["node_id", "address"],
		branchDetailRows,
		"ON CONFLICT (node_id) DO UPDATE SET address = EXCLUDED.address",
	);
}

/**
 * Second pass: link branch managers now that the staff crosswalk exists.
 * Resolves location.branch_manager_staff_id → user.id and stamps it onto
 * branch_details.pic_user_id. Run AFTER loadStaff.
 */
export async function linkBranchManagers(
	branches: CanonicalBranch[],
	ctx: { tx: Tx; log: MigrationLog },
): Promise<void> {
	const { tx, log } = ctx;
	for (const b of branches) {
		if (!b.managerLegacyStaffId) continue;
		const branchNodeId = await lookup(
			tx,
			"location",
			b.legacyId,
			b.sourceSystem,
		);
		const managerUserId = await lookup(
			tx,
			"staff",
			b.managerLegacyStaffId,
			b.sourceSystem,
		);
		if (!branchNodeId || !managerUserId) {
			log.dropField(`pic_user_id unresolved for ${b.name}`);
			continue;
		}
		await tx.execute(sql`
			INSERT INTO branch_details (node_id, pic_user_id)
			VALUES (${branchNodeId}, ${managerUserId})
			ON CONFLICT (node_id) DO UPDATE SET pic_user_id = EXCLUDED.pic_user_id
		`);
		log.created("pic link", b.name);
	}
}
