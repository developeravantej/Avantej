#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (content.includes("requirePermission(")) continue;
	const next = content.replace(
		/\nimport \{ requirePermission \} from "@avantej-core\/services";\n/g,
		"\n",
	);
	if (next !== content) {
		writeFileSync(path, next, "utf-8");
		console.log(`cleaned ${file}`);
	}
}
