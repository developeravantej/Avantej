// apps/web/src/__tests__/routes/root-scope-mount.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(here, "../../routes/__root.tsx");
const src = readFileSync(rootPath, "utf8");

describe("__root.tsx — ScopeProvider mount", () => {
	it("imports ScopeProvider from @/components/scope/ScopeProvider", () => {
		expect(src).toMatch(
			/import\s*\{\s*ScopeProvider\s*\}\s*from\s*["']@\/components\/scope\/ScopeProvider["']/,
		);
	});

	it("wraps the router Outlet inside ScopeProvider", () => {
		const open = src.indexOf("<ScopeProvider>");
		const outlet = src.indexOf("<Outlet />");
		const close = src.indexOf("</ScopeProvider>");
		expect(open).toBeGreaterThan(-1);
		expect(outlet).toBeGreaterThan(open);
		expect(close).toBeGreaterThan(outlet);
	});

	it("mounts ScopeProvider inside AuthProvider (so useUserContext is available)", () => {
		const auth = src.indexOf("<AuthProvider>");
		const scope = src.indexOf("<ScopeProvider>");
		expect(auth).toBeGreaterThan(-1);
		expect(scope).toBeGreaterThan(auth);
	});
});
