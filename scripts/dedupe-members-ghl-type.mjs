#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/members");
const block =
	/\/\/ Shared GHL staff sync[\s]*?::\[\s\S]*?error\?: string;\n};\n\n/;

for (const file of readdirSync(dir).filter((f) =>
	f.endsWith(".procedures.ts"),
)) {
	const path = join(dir, file);
	let src = readFileSync(path, "utf-8");
	if (!src.includes("type GhlSyncResult")) continue;
	src = src.replace(
		/\/\/ Shared GHL staff sync[\s\S]*?error\?: string;\n};\n\n/,
		'import type { GhlSyncResult } from "./shared";\n\n',
	);
	writeFileSync(path, src);
	console.log(`Updated ${file}`);
}
