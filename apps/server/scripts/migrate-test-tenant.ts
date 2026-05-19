import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";
import "dotenv/config";

const url = process.env.TENANT_DATABASE_URL;
if (!url) {
	console.error("TENANT_DATABASE_URL not set");
	process.exit(1);
}

console.log("Applying migrations to test tenant DB...");
await runTenantMigrations(url);
console.log("Done.");
