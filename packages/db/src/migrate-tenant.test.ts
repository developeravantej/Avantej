import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TENANT_MIGRATIONS } from "./migrate-tenant";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations/tenant");

function loadDiskFiles() {
	return fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

function normalize(sql: string): string {
	return sql.replace(/\r\n/g, "\n").trim();
}

describe("tenant migrations parity (on-disk SQL vs inline TENANT_MIGRATIONS)", () => {
	const files = loadDiskFiles();

	test("same number of entries", () => {
		expect(TENANT_MIGRATIONS.length).toBe(files.length);
	});

	test("every on-disk file has a matching TENANT_MIGRATIONS entry with identical SQL", () => {
		for (const file of files) {
			const hash = file.replace(/\.sql$/, "");
			const onDisk = normalize(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
			const inline = TENANT_MIGRATIONS.find((m) => m.hash === hash);
			expect(inline, `Missing inline entry for ${file}`).toBeDefined();
			expect(normalize(inline!.sql), `Mismatch for ${file}`).toBe(onDisk);
		}
	});

	test("ordering matches lexicographic file order", () => {
		const expected = files.map((f) => f.replace(/\.sql$/, ""));
		const actual = TENANT_MIGRATIONS.map((m) => m.hash);
		expect(actual).toEqual(expected);
	});
});
