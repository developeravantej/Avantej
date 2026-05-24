#!/usr/bin/env node
/**
 * Split a monolithic router file into procedure modules (Plan D-S7).
 *
 * Supports:
 * - Inline object style:  export const fooRouter = { list: tenantProcedure... }
 * - Const alias style:    const list = tenantProcedure...; export = { list, x: y }
 *
 * Usage: node scripts/split-router-by-marker.mjs <routerName> <module1:proc1,proc2> ...
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

function toCamelRouterName(name) {
	const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	return `${camel}Router`;
}

function moduleExportName(modName) {
	const camel = modName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	return `${routerName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}${camel.charAt(0).toUpperCase()}${camel.slice(1)}Procedures`;
}

function extractBlocks(source, procStarts, { constPrefix = false } = {}) {
	const procedures = new Map();
	for (let i = 0; i < procStarts.length; i++) {
		const name = procStarts[i][1];
		let start = procStarts[i].index ?? 0;
		let end =
			i + 1 < procStarts.length
				? (procStarts[i + 1].index ?? source.length)
				: source.length;

		const beforeNext = source.slice(Math.max(start, end - 1200), end);
		const nextComment = beforeNext.match(/\n(?:\/\/[^\n]*\n|\s+\/\*\*[\s\S]*)*$/);
		if (nextComment && !nextComment[0].includes("tenantProcedure")) {
			end -= nextComment[0].length;
		}

		const before = source.slice(Math.max(0, start - 1200), start);
		const ownComment = before.match(
			/(\n(?:\/\/[^\n]*\n|\s+\/\*\*[\s\S]*?\*\/\s*)*)$/,
		);
		if (ownComment && !ownComment[1].includes("tenantProcedure")) {
			start -= ownComment[1].length;
		}

		let block = source.slice(start, end).trim();
		if (!constPrefix && block.endsWith(",")) block = block.slice(0, -1);
		if (!block.includes(".handler(")) {
			console.error(`Procedure ${name} block looks incomplete (${block.length} chars)`);
			process.exit(1);
		}
		procedures.set(name, block);
	}
	return procedures;
}

function parseExportAliases(exportInner) {
	const map = new Map();
	for (const part of exportInner.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const aliasMatch = trimmed.match(/^(\w+)\s*:\s*(\w+)$/);
		if (aliasMatch) {
			map.set(aliasMatch[1], aliasMatch[2]);
		} else {
			map.set(trimmed, trimmed);
		}
	}
	return map;
}

const src = readFileSync(srcPath, "utf-8");
const exportNameMatch = src.match(/export const (\w+) = \{/);
if (!exportNameMatch) {
	console.error("Could not find export const …Router = {");
	process.exit(1);
}
const exportConst = exportNameMatch[1];
const exportMarker = `export const ${exportConst} = {`;
const exportIdx = src.indexOf(exportMarker);
if (exportIdx === -1) {
	console.error(`Could not find ${exportMarker}`);
	process.exit(1);
}

const exportBlock = src.slice(exportIdx);
const exportInner = exportBlock.slice(
	exportBlock.indexOf("{") + 1,
	exportBlock.lastIndexOf("};"),
);

const inlineProcStarts = [...exportInner.matchAll(/^\s+(\w+):\s*tenantProcedure/gm)];

/** @type {Map<string, string>} exportKey -> procedure block or const block */
let procedures = new Map();
/** @type {"inline" | "const"} */
let moduleFormat = "inline";
/** @type {Map<string, string>} exportKey -> const identifier */
let exportToConst = new Map();

if (inlineProcStarts.length > 0) {
	const bodyInner = exportInner;
	const procStarts = [...bodyInner.matchAll(/^\s+(\w+):\s*tenantProcedure/gm)];
	procedures = extractBlocks(bodyInner, procStarts);
	for (const [key] of procedures) exportToConst.set(key, key);
} else {
	moduleFormat = "const";
	exportToConst = parseExportAliases(exportInner);
	const preamble = src.slice(0, exportIdx).trimEnd();
	const firstConst = preamble.search(/^const \w+ = tenantProcedure/m);
	if (firstConst === -1) {
		console.error("No const tenantProcedure definitions found");
		process.exit(1);
	}
	const header = preamble.slice(0, firstConst).trimEnd();
	const constBody = preamble.slice(firstConst);
	const constStarts = [...constBody.matchAll(/^const (\w+) = tenantProcedure/gm)];
	const constBlocks = extractBlocks(constBody, constStarts, { constPrefix: true });

	for (const [exportKey, constName] of exportToConst) {
		const block = constBlocks.get(constName);
		if (!block) {
			console.error(`Const not found for export key ${exportKey} -> ${constName}`);
			process.exit(1);
		}
		procedures.set(exportKey, block);
	}
}

const headerEnd =
	moduleFormat === "inline"
		? src.indexOf(exportMarker)
		: src.slice(0, exportIdx).search(/^const \w+ = tenantProcedure/m);
const header = src.slice(0, headerEnd).trimEnd();

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

const outDir = join(routersDir, routerName);
mkdirSync(outDir, { recursive: true });

const adjustedHeader = header.replace(/from "\.\.\//g, 'from "../../');

const used = new Set();
for (const { modName, procs } of modules) {
	const exportName = moduleExportName(modName);
	let content;

	if (moduleFormat === "inline") {
		const blocks = procs.map((p) => {
			used.add(p);
			return `\t${procedures.get(p)}`;
		});
		content = `${adjustedHeader}

export const ${exportName} = {
${blocks.join(",\n\n")}
};
`;
	} else {
		for (const p of procs) used.add(p);
		const constBlocks = procs.map((p) => procedures.get(p));
		const exportLines = procs.map((p) => {
			const constName = exportToConst.get(p) ?? p;
			return constName === p ? `\t${p},` : `\t${p}: ${constName},`;
		});
		content = `${adjustedHeader}

${constBlocks.join("\n\n")}

export const ${exportName} = {
${exportLines.join("\n")}
};
`;
	}

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

export const ${exportConst} = {
${indexSpreads}
};
`,
	"utf-8",
);

unlinkSync(srcPath);
console.log(`Deleted ${srcPath}`);
console.log(`Created ${outDir}/index.ts`);
