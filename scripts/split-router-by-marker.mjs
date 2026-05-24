#!/usr/bin/env node
/**
 * Split a monolithic router file into procedure modules (Plan D-S7).
 *
 * Usage: node scripts/split-router-by-marker.mjs <routerName> <module1:proc1,proc2> ...
 * Example:
 *   node scripts/split-router-by-marker.mjs appointments \
 *     list:list,listForUser,getById,statusHistory \
 *     crud:create,update \
 *     recurrence:materializeOccurrence,splitSeries,cancelSeries,cancelFuture
 */
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const [, , routerName, ...moduleSpecs] = process.argv;
if (!routerName || moduleSpecs.length === 0) {
	console.error("Usage: split-router-by-marker.mjs <router> <module:proc,...> ...");
	process.exit(1);
}

const routersDir = join(process.cwd(), "packages/api/src/routers");
const srcPath = join(routersDir, `${routerName}.ts`);
if (!existsSync(srcPath)) {
	console.error(`Missing ${srcPath}`);
	process.exit(1);
}

const src = readFileSync(srcPath, "utf-8");
const headerEnd = src.indexOf(`export const ${routerName}Router = {`);
if (headerEnd === -1) {
	console.error(`Could not find export const ${routerName}Router`);
	process.exit(1);
}

const header = src.slice(0, headerEnd).trimEnd();
const body = src.slice(headerEnd);

const bodyStart = body.indexOf("{") + 1;
const bodyInner = body.slice(bodyStart, body.lastIndexOf("};"));

const procStarts = [...bodyInner.matchAll(/^\s{2}(\w+):\s*tenantProcedure/gm)];
const procedures = new Map();

for (let i = 0; i < procStarts.length; i++) {
	const name = procStarts[i][1];
	let start = procStarts[i].index ?? 0;
	const end =
		i + 1 < procStarts.length
			? (procStarts[i + 1].index ?? bodyInner.length)
			: bodyInner.length;

	// Include JSDoc immediately preceding this procedure.
	const before = bodyInner.slice(Math.max(0, start - 800), start);
	const commentMatch = before.match(/(\n\s+\/\*\*[\s\S]*?\*\/\s*)$/);
	if (commentMatch) {
		start -= commentMatch[1].length;
	}

	let block = bodyInner.slice(start, end).trim();
	// Trailing JSDoc before the next procedure (not part of this block).
	const trailingComment = block.match(/\n\s+\/\*\*[\s\S]*$/);
	if (trailingComment) {
		block = block.slice(0, -trailingComment[0].length).trimEnd();
	}
	if (block.endsWith(",")) block = block.slice(0, -1);
	procedures.set(name, block);
}

const outDir = join(routersDir, routerName);
mkdirSync(outDir, { recursive: true });

const modules = moduleSpecs.map((spec) => {
	const [modName, procList] = spec.split(":");
	const procs = procList.split(",").map((p) => p.trim());
	for (const p of procs) {
		if (!procedures.has(p)) {
			console.error(`Procedure not found: ${p}`);
			process.exit(1);
		}
	}
	return { modName, procs };
});

function moduleExportName(modName) {
	const camel = modName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	return `${routerName}${camel.charAt(0).toUpperCase()}${camel.slice(1)}Procedures`;
}

const used = new Set();
for (const { modName, procs } of modules) {
	const blocks = procs.map((p) => {
		used.add(p);
		return `\t${procedures.get(p)}`;
	});
	const exportName = moduleExportName(modName);
	const content = `${header.replace(/from "\.\.\//g, 'from "../../')}

export const ${exportName} = {
${blocks.join(",\n\n")}
};
`;
	writeFileSync(join(outDir, `${modName}.procedures.ts`), content, "utf-8");
	console.log(`Wrote ${modName}.procedures.ts (${procs.join(", ")})`);
}

const unused = [...procedures.keys()].filter((p) => !used.has(p));
if (unused.length) {
	console.error(`Unassigned procedures: ${unused.join(", ")}`);
	process.exit(1);
}

const indexImports = modules
	.map(({ modName }) => {
		const exportName = moduleExportName(modName);
		return `import { ${exportName} } from "./${modName}.procedures";`;
	})
	.join("\n");

const indexSpreads = modules
	.map(({ modName }) => {
		const exportName = moduleExportName(modName);
		return `\t...${exportName},`;
	})
	.join("\n");

writeFileSync(
	join(outDir, "index.ts"),
	`/** ${routerName} router — split by domain (Plan D-S7). */
${indexImports}

export const ${routerName}Router = {
${indexSpreads}
};
`,
	"utf-8",
);

unlinkSync(srcPath);
console.log(`Deleted ${srcPath}`);
console.log(`Created ${outDir}/index.ts`);
