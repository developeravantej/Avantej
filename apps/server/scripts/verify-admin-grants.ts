import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = "996febce-aaad-4ded-8f47-02d2b566c8ee";

try {
	const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
	for (const line of content.split("\n")) {
		const m = line.trim().match(/^([^=]+)=(.*)$/);
		if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
			process.env[m[1]] = m[2];
	}
} catch {}

const cp = new Pool({ connectionString: process.env.DATABASE_URL! });
const cdb = drizzle({ client: cp, schema: controlPanelSchema });
const org = await cdb.query.organizations.findFirst({
	where: (o, { eq: e }) => e(o.id, TARGET),
});
const tp = new Pool({ connectionString: decrypt(org!.connectionString) });
const tdb = drizzle({ client: tp, schema: tenantSchema });
const admin = await tdb.query.roles.findFirst({
	where: (r, { eq: e }) => e(r.name, "admin"),
});
const perms = await tdb.query.permissions.findMany({
	where: (p, { inArray: ia }) =>
		ia(p.resource, [
			"customer_management",
			"walk_in_customer_management",
			"audit_log",
			"attendance_management",
			"pos",
			"sales",
			"payments",
			"refund_management",
			"commission_management",
		]),
});
const rp = await tdb.query.rolePermissions.findMany({
	where: (rp, { eq: e, inArray: ia, and: a }) =>
		a(
			e(rp.roleId, admin!.id),
			ia(
				rp.permissionId,
				perms.map((p) => p.id),
			),
		),
});
console.log(`Admin role: ${admin!.id}`);
console.log(
	`Expected grants: ${perms.length}, actual grants on admin: ${rp.length}`,
);
for (const p of perms) {
	const has = rp.some((r) => r.permissionId === p.id);
	console.log(`  ${has ? "OK" : "MISSING"}  ${p.resource}:${p.action}`);
}
await cp.end();
await tp.end();
