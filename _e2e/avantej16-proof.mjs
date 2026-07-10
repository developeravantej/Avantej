import { request } from "@playwright/test";

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
const uc = await rpc("auth/userContext", {});
const organizationId = uc.currentOrganizationId;

const nodes = await rpc("hierarchy/listNodes", { organizationId });
const arr = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
const branch = arr
	.filter((n) => n.type === "branch")
	.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0];
console.log("branch", branch.id, branch.name);

const hours = {
	monday: { open: "09:00", close: "18:00" },
	tuesday: { open: "09:00", close: "18:00" },
	wednesday: { open: "09:00", close: "18:00" },
	thursday: { open: "09:00", close: "18:00" },
	friday: { open: "09:00", close: "21:00" },
	saturday: { open: "10:00", close: "16:00" },
	sunday: null, // closed
};

const updated = await rpc("hierarchy/updateNode", {
	organizationId,
	nodeId: branch.id,
	openingHours: hours,
});
console.log(
	"updateNode returned openingHours:",
	JSON.stringify(updated?.openingHours),
);

const details = await rpc("hierarchy/getBranchDetails", {
	organizationId,
	nodeId: branch.id,
});
const readBack = details?.openingHours;
// jsonb reorders top-level keys, so compare order-independently.
const norm = (o) =>
	JSON.stringify(
		Object.keys(o ?? {})
			.sort()
			.reduce((a, k) => ((a[k] = o[k]), a), {}),
	);
const ok =
	norm(readBack) === norm(hours) &&
	readBack?.sunday === null &&
	readBack?.friday?.close === "21:00";
console.log("getBranchDetails openingHours:", JSON.stringify(readBack));
console.log(
	"ASSERTIONS",
	JSON.stringify(
		{
			update_returned_hours: norm(updated?.openingHours) === norm(hours),
			persisted_and_read_back: norm(readBack) === norm(hours),
			sunday_closed: readBack?.sunday === null,
			friday_late: readBack?.friday?.close === "21:00",
		},
		null,
		2,
	),
);
console.log(ok ? "PASS ✅" : "FAIL ❌");
await api.dispose();
process.exit(ok ? 0 : 1);
