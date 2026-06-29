/**
 * One-off: decrypt the stored GHL API key for an org and validate it live
 * against GHL (read-only GET /locations/:id). Prints NO secret values —
 * only validity + location name + key length/prefix.
 *
 *   cd apps/server && bun run scripts/ghl-validate-stored.ts [orgId]
 *
 * Reads DATABASE_URL + ENCRYPTION_KEY from .dev.vars.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";
import { ghlFetch } from "../src/services/ghl/http-client";
import { validateGhlApiKey } from "../src/services/ghl/setup";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			const value = trimmed
				.slice(eq + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[key]) process.env[key] = value;
		}
	} catch {
		// optional
	}
}

async function main() {
	loadDevVars();
	const orgId = process.argv[2] || "996febce-aaad-4ded-8f47-02d2b566c8ee";
	const cpDb = getControlPanelDb();

	const org = await cpDb.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
	});
	if (!org) {
		console.error("❌ org not found:", orgId);
		process.exit(1);
	}
	console.log("org:", orgId);
	console.log("ghlLocationId:", org.ghlLocationId);
	console.log("ghlSyncModel:", org.ghlSyncModel);
	if (!org.ghlLocationId || !org.ghlApiKeyEncrypted) {
		console.error("❌ no ghlLocationId / encrypted key on org");
		process.exit(1);
	}

	let apiKey: string;
	try {
		apiKey = decrypt(org.ghlApiKeyEncrypted);
	} catch (e) {
		console.error("❌ decrypt failed (ENCRYPTION_KEY mismatch?):", e);
		process.exit(1);
	}
	console.log(
		`decrypt OK — key len=${apiKey.length} prefix=${apiKey.slice(0, 4)}…`,
	);

	console.log("\n▶ live validate against GHL …");
	const valid = await validateGhlApiKey(apiKey, org.ghlLocationId);
	console.log(valid ? "  ✅ key VALID for location" : "  ❌ key INVALID");

	if (valid) {
		try {
			const raw = await ghlFetch<{ location?: { name?: string } }>({
				method: "GET",
				path: `/locations/${org.ghlLocationId}`,
				apiKey,
			});
			console.log("  location name:", raw?.location?.name ?? "(unknown)");
		} catch {
			// best effort
		}
	}
	process.exit(valid ? 0 : 2);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
