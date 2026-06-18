import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Self-cleaning mutation helpers for /e2e-deep against Avantej (oRPC + Better-Auth).
 *
 * Safety rules (see references/deep-testing.md):
 *   1. Every created row carries a unique, test-prefixed identifier (testId()).
 *   2. Every created row is torn down in finally/afterEach via the Cleanup stack.
 *   3. Singletons (org settings, default tax rate) use withRestored — never
 *      select-and-delete a pre-existing real row.
 *
 * oRPC transport: POST /rpc/<router>/<proc> with body { "json": <input> }.
 * The tenant middleware reads organizationId from the input, so every tenant
 * mutation must include organizationId (use getOrgId()).
 */

const PREFIX = process.env.E2E_WRITE_PREFIX ?? "E2E-DEEP-";

// Unique per RUN, not just per spec. Soft-delete entities (tax-rates, products,
// promotions, suppliers, installment-plans…) keep their unique code/sku after
// "delete", so a constant stamp made the next run's identical id collide with the
// leftover row -> masked 500 (duplicate key). A per-run stamp makes every id
// globally unique. (Date.now() is fine here — this is a Node/Playwright helper.)
const RUN_STAMP = process.env.E2E_RUN_STAMP ?? Date.now().toString(36);
let _seq = 0;
export function testId(label = "item"): string {
	_seq += 1;
	return `${PREFIX}${label}-${RUN_STAMP}-${_seq}`;
}

export function isTestOwned(name: unknown): boolean {
	return typeof name === "string" && name.startsWith(PREFIX);
}

export class Cleanup {
	private stack: Array<{ what: string; fn: () => Promise<void> }> = [];
	add(what: string, fn: () => Promise<void>) {
		this.stack.push({ what, fn });
	}
	async runAll() {
		for (const { what, fn } of this.stack.reverse()) {
			try {
				await fn();
			} catch (e) {
				console.warn(`[cleanup] failed to tear down ${what}:`, e);
			}
		}
		this.stack = [];
	}
}

export async function withRestored<T>(
	read: () => Promise<T>,
	write: (v: T) => Promise<void>,
	body: () => Promise<void>,
): Promise<void> {
	const original = await read();
	try {
		await body();
	} finally {
		await write(original).catch((e) => console.warn("[restore] failed:", e));
	}
}

// ── oRPC over HTTP ──────────────────────────────────────────────────────────

/** The tenant org id, captured by global-setup into _e2e/.auth/org.json. */
export function getOrgId(): string {
	try {
		const { orgId } = JSON.parse(readFileSync("_e2e/.auth/org.json", "utf8"));
		if (orgId) return orgId;
	} catch {}
	// Fallback: pull current_organization_id out of the admin storageState.
	try {
		const state = JSON.parse(readFileSync("_e2e/.auth/admin.json", "utf8"));
		for (const o of state.origins ?? []) {
			for (const kv of o.localStorage ?? []) {
				if (kv.name === "current_organization_id" && kv.value) return kv.value;
			}
		}
	} catch {}
	throw new Error(
		"orgId not found — run global-setup first (_e2e/.auth/org.json)",
	);
}

/**
 * Resolve a usable branch (hierarchy node) id for the tenant, cached per run.
 * Picks the deepest node (most specific branch) so branch-scoped writes land on
 * a leaf the admin can access. Many create procedures require a branchId.
 */
let _branchId: string | null = null;
export async function getBranchId(request: APIRequestContext): Promise<string> {
	if (_branchId) return _branchId;
	const organizationId = getOrgId();
	const nodes = await rpc(request, "hierarchy/listNodes", { organizationId });
	const arr = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
	if (!arr.length) throw new Error("no hierarchy nodes returned");
	const deepest = arr.reduce((a, b) =>
		(b?.depth ?? 0) >= (a?.depth ?? 0) ? b : a,
	);
	_branchId = deepest.id ?? deepest.nodeId;
	if (!_branchId)
		throw new Error("could not resolve a branch id from hierarchy nodes");
	return _branchId;
}

/**
 * Resolve an existing UOM id (reuse — read-only), cached per run. Products need a
 * uomId; reusing an existing UOM avoids the `unitsOfMeasure/create` API-path bug
 * (it 500s though the underlying insert works — see _e2e/findings.md). Falls back
 * to create only if the tenant has no UOMs.
 */
let _uomId: string | null = null;
export async function getUomId(request: APIRequestContext): Promise<string> {
	if (_uomId) return _uomId;
	const organizationId = getOrgId();
	const list = await rpc(request, "unitsOfMeasure/list", { organizationId });
	const arr = Array.isArray(list)
		? list
		: (list?.items ?? list?.unitsOfMeasure ?? []);
	if (arr.length && arr[0]?.id) {
		_uomId = arr[0].id;
		return _uomId;
	}
	const created = await rpc(request, "unitsOfMeasure/create", {
		organizationId,
		name: testId("uom"),
	});
	_uomId = created?.id;
	if (!_uomId) throw new Error("could not resolve a UOM id");
	return _uomId;
}

/** Call an oRPC procedure. Returns the unwrapped result payload. */
export async function rpc(
	request: APIRequestContext,
	procPath: string,
	input: unknown,
): Promise<any> {
	const res = await request.post(`/rpc/${procPath}`, { data: { json: input } });
	const body = await res.json().catch(() => null);
	expect(
		res.ok(),
		`/rpc/${procPath} -> ${res.status()} ${JSON.stringify(body)}`,
	).toBeTruthy();
	// oRPC wraps the result as { json: <result> } (with a meta envelope).
	return body && typeof body === "object" && "json" in body ? body.json : body;
}

/** Raw call — for asserting status codes (RBAC / isolation). */
export async function rpcRaw(
	request: APIRequestContext,
	procPath: string,
	input: unknown,
) {
	return request.post(`/rpc/${procPath}`, { data: { json: input } });
}

/** Assert an RPC call is rejected by the server's auth/permission layer. */
export async function expectForbidden(
	request: APIRequestContext,
	procPath: string,
	input: unknown,
): Promise<void> {
	const res = await rpcRaw(request, procPath, input);
	expect(
		[401, 403].includes(res.status()),
		`expected 401/403 from /rpc/${procPath}, got ${res.status()}`,
	).toBeTruthy();
}

/** Assert tenant B cannot reach tenant A's row (403 forbid or 404 not-found). */
export async function expectIsolated(
	request: APIRequestContext,
	procPath: string,
	input: unknown,
): Promise<void> {
	const res = await rpcRaw(request, procPath, input);
	expect(
		[401, 403, 404].includes(res.status()),
		`expected 401/403/404 (isolation) from /rpc/${procPath}, got ${res.status()}`,
	).toBeTruthy();
}

/** Assert an RPC call is rejected with one of the given HTTP statuses (default 400/403/409). */
export async function expectRejected(
	request: APIRequestContext,
	procPath: string,
	input: unknown,
	codes: number[] = [400, 403, 409],
): Promise<void> {
	const res = await rpcRaw(request, procPath, input);
	const body = await res.text().catch(() => "");
	expect(
		codes.includes(res.status()),
		`expected ${codes.join("/")} from /rpc/${procPath}, got ${res.status()} ${body.slice(0, 200)}`,
	).toBeTruthy();
}

export async function expectControlHidden(page: Page, name: RegExp | string) {
	await expect(page.getByRole("button", { name })).toHaveCount(0);
}
