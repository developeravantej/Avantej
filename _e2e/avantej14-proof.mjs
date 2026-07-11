import { request } from "@playwright/test";

// AVANTEJ-14 regression (read-only, no mutation): branch counters must roll up
// the descendant subtree. The rollup makes node.count = local(node) + Σ children,
// so EVERY parent's count must be >= the sum of its direct children's counts.
// On the old node-local code the org root showed 1/1 while its branches summed to
// 100+, so `parent >= Σ children` FAILS on old and PASSES on the fix.
const BASE = process.env.BASE ?? "http://localhost:3022";
const api = await request.newContext({ baseURL: BASE });
const H = { origin: BASE, "content-type": "application/json" };
async function rpc(path, input) {
	const r = await api.post(`/rpc/${path}`, {
		headers: H,
		data: { json: input },
	});
	const b = await r.json().catch(() => null);
	if (!r.ok())
		throw new Error(
			`${path} -> ${r.status()} ${JSON.stringify(b)?.slice(0, 300)}`,
		);
	return b && typeof b === "object" && "json" in b ? b.json : b;
}
await api.post("/api/auth/sign-in/email", {
	headers: H,
	data: { email: "franchisee@gmail.com", password: "password123" },
});
const organizationId = (await rpc("auth/userContext", {}))
	.currentOrganizationId;

const res = await rpc("hierarchy/listNodesWithStats", { organizationId });
const nodes = Array.isArray(res) ? res : (res?.nodes ?? []);
const byParent = new Map();
for (const n of nodes) {
	if (!n.parentId) continue;
	(
		byParent.get(n.parentId) ?? byParent.set(n.parentId, []).get(n.parentId)
	).push(n);
}
const num = (v) => Number(v ?? 0);

let violations = 0;
for (const n of nodes) {
	const kids = byParent.get(n.id) ?? [];
	if (kids.length === 0) continue;
	const staffSum = kids.reduce((s, k) => s + num(k.staffCount), 0);
	const memberSum = kids.reduce((s, k) => s + num(k.membersCount), 0);
	if (num(n.staffCount) < staffSum || num(n.membersCount) < memberSum) {
		violations++;
		console.log(
			`VIOLATION ${n.name} (${n.type}): staff ${num(n.staffCount)} < Σkids ${staffSum} ` +
				`OR members ${num(n.membersCount)} < Σkids ${memberSum}`,
		);
	}
}

const root =
	nodes.find((n) => !n.parentId) ??
	nodes.slice().sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))[0];
const maxLeafStaff = Math.max(
	0,
	...nodes
		.filter((n) => !byParent.get(n.id)?.length)
		.map((n) => num(n.staffCount)),
);

const results = {
	parents_checked: nodes.filter((n) => (byParent.get(n.id)?.length ?? 0) > 0)
		.length,
	rollup_violations: violations, // must be 0
	root_staff: num(root?.staffCount),
	root_aggregated:
		num(root?.staffCount) >= maxLeafStaff && num(root?.staffCount) > 1,
};
console.log("ASSERTIONS", JSON.stringify(results, null, 2));
const ok = violations === 0 && results.root_aggregated;
console.log(ok ? "PASS ✅" : "FAIL ❌");
await api.dispose();
process.exit(ok ? 0 : 1);
