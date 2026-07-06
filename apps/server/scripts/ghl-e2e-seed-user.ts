/** Seed a control-panel auth user (for staff-link tests). Prints USER_ID. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { user as authUser } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadDevVars() {
	try {
		for (const l of readFileSync(
			join(__dirname, "../.dev.vars"),
			"utf-8",
		).split("\n")) {
			const t = l.trim();
			if (!t || t.startsWith("#")) continue;
			const e = t.indexOf("=");
			if (e < 0) continue;
			const k = t.slice(0, e).trim();
			const v = t
				.slice(e + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {}
}

async function main() {
	loadDevVars();
	const email = process.argv[2];
	const cp = getControlPanelDb();
	const existing = await cp
		.select({ id: authUser.id })
		.from(authUser)
		.where(eq(authUser.email, email));
	if (existing[0]) {
		console.log(`USER_ID=${existing[0].id}`);
		return;
	}
	const id = crypto.randomUUID();
	const now = new Date();
	await cp
		.insert(authUser)
		.values({
			id,
			email,
			name: "ZZ StaffUpd-GHL",
			firstName: "ZZ",
			lastName: "StaffUpd-GHL",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
	console.log(`USER_ID=${id}`);
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
