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

const si = await api.post("/api/auth/sign-in/email", {
	headers: H,
	data: { email: "franchisee@gmail.com", password: "password123" },
});
if (!si.ok()) throw new Error(`sign-in ${si.status()}`);
const uc = await rpc("auth/userContext", {});
const organizationId = uc.currentOrganizationId;

// Resolve branch (deepest node), a service, a trainer, a customer.
const nodes = await rpc("hierarchy/listNodes", { organizationId });
const arr = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
const branch = arr
	.filter((n) => n.type === "branch")
	.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0];
const branchId = branch.id;

const services = await rpc("services/list", { organizationId });
const svcArr = Array.isArray(services) ? services : (services?.items ?? []);
const service = svcArr[0];

const trainers = await rpc("members/list", { organizationId, role: "trainer" });
const tArr = Array.isArray(trainers)
	? trainers
	: (trainers?.items ?? trainers?.members ?? []);
const trainer = tArr[0];

const customers = await rpc("members/list", { organizationId, role: "client" });
const cArr = Array.isArray(customers)
	? customers
	: (customers?.items ?? customers?.members ?? []);
const customer = cArr[0];

console.log(
	JSON.stringify(
		{
			branchId,
			serviceId: service?.id,
			serviceName: service?.name,
			trainerMemberId: trainer?.id,
			trainerUserId: trainer?.userId,
			customerUserId: customer?.userId,
		},
		null,
		2,
	),
);

// Create an appointment WITHOUT trainerId, only staffAssignments (the exact bug shape).
const start = new Date();
start.setDate(start.getDate() + 5);
start.setHours(16, 15, 0, 0);
const created = await rpc("appointments/create", {
	organizationId,
	type: "private",
	startTime: start.toISOString(),
	duration: 60,
	branchId,
	sessionTotal: 1,
	pricePerClient: 0,
	serviceId: service.id,
	userId: customer.userId,
	staffAssignments: [{ staffId: trainer.userId, slotIndex: 0 }],
});
const apptId = created?.id ?? created?.appointment?.id;
console.log(
	"created appointment",
	apptId,
	"row.trainerId=",
	created?.trainerId,
	"row.serviceId=",
	created?.serviceId,
);

// Assert: appears when filtering by that trainer's members.id (backfill worked).
const startFrom = new Date(start);
startFrom.setDate(startFrom.getDate() - 1);
const startTo = new Date(start);
startTo.setDate(startTo.getDate() + 2);
const byTrainer = await rpc("appointments/list", {
	organizationId,
	trainerId: trainer.id,
	startFrom: startFrom.toISOString(),
	startTo: startTo.toISOString(),
	limit: 200,
});
const rows = Array.isArray(byTrainer) ? byTrainer : (byTrainer?.items ?? []);
const found = rows.find((r) => r.id === apptId);

const results = {
	// Read the PERSISTED row (post-backfill), not createAppointment's pre-backfill return.
	trainerId_backfilled_in_db: found?.trainerId === trainer.id,
	serviceId_persisted: (found?.serviceId ?? created?.serviceId) === service.id,
	visible_under_trainer_filter: !!found,
	found_serviceName: found?.serviceName ?? found?.service ?? null,
	found_trainerId: found?.trainerId ?? null,
	expected_trainerMemberId: trainer.id,
};
console.log("ASSERTIONS", JSON.stringify(results, null, 2));

const ok =
	results.trainerId_backfilled_in_db &&
	results.serviceId_persisted &&
	results.visible_under_trainer_filter;
console.log(ok ? "PASS ✅" : "FAIL ❌");
await api.dispose();
process.exit(ok ? 0 : 1);
