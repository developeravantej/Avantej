/**
 * Resend webhook integration test.
 *
 * Signs payloads with svix using a test secret, posts to the /webhooks/resend
 * handler, and asserts the email_logs / email_domains / processed_webhook_events
 * tables update correctly. Requires migrations 0033 (email_domains/email_logs)
 * and 0034 (default_local_part) to be applied; will skip when
 * SKIP_INTEGRATION_TESTS=true or DATABASE_URL is missing.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { Webhook as SvixWebhook } from "svix";
import { Hono } from "hono";
import { loadDevVars, shouldSkipIntegration, createControlPanelDb, TEST_ORG_ID } from "@/tests/helpers/integration-setup";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { emailDomains } from "@avantej-core/db/schema/control-panel/email-domains";
import { emailLogs } from "@avantej-core/db/schema/control-panel/email-logs";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";

const RESEND_WEBHOOK_SECRET = "whsec_dGVzdF9zZWNyZXRfdGVzdF9zZWNyZXQ=";

let app: Hono;
let cpDb: ReturnType<typeof createControlPanelDb> | null = null;
let seededDomainId: string | null = null;
let seededLogId: string | null = null;

const TEST_RESEND_DOMAIN_ID = `dom_test_${crypto.randomUUID()}`;
const TEST_RESEND_MESSAGE_ID = `re_test_${crypto.randomUUID()}`;

function svixHeaders(body: string, secret: string): {
	"svix-id": string;
	"svix-timestamp": string;
	"svix-signature": string;
} {
	const id = `msg_test_${crypto.randomUUID()}`;
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const wh = new SvixWebhook(secret);
	const signature = wh.sign(id, new Date(Number(timestamp) * 1000), body);
	return {
		"svix-id": id,
		"svix-timestamp": timestamp,
		"svix-signature": signature,
	};
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	process.env.RESEND_WEBHOOK_SECRET = RESEND_WEBHOOK_SECRET;

	cpDb = createControlPanelDb();

	// Seed organization (if missing) — TEST_ORG_ID may already exist.
	await cpDb
		.insert(organizations)
		.values({
			id: TEST_ORG_ID,
			name: "Resend webhook test org",
			slug: `resend-webhook-test-${Date.now()}`,
			neonProjectId: `resend-webhook-test-${Date.now()}`,
			connectionString: "postgres://noop",
			paymentStatus: "active",
		})
		.onConflictDoNothing();

	// Seed a verified email_domains row + a queued email_logs row to update.
	const [dom] = await cpDb
		.insert(emailDomains)
		.values({
			organizationId: TEST_ORG_ID,
			resendDomainId: TEST_RESEND_DOMAIN_ID,
			domain: `mail-test-${Date.now()}.example.com`,
			fromName: "Webhook Test",
			status: "pending",
		})
		.returning({ id: emailDomains.id });
	seededDomainId = dom!.id;

	const [log] = await cpDb
		.insert(emailLogs)
		.values({
			organizationId: TEST_ORG_ID,
			emailDomainId: seededDomainId,
			resendMessageId: TEST_RESEND_MESSAGE_ID,
			fromAddress: "test@mail.example.com",
			toAddress: "recipient@example.com",
			subject: "Test",
			status: "sent",
		})
		.returning({ id: emailLogs.id });
	seededLogId = log!.id;

	// Build a tiny Hono app that re-mounts the webhook handler with cpDb
	// injected via Hono context. We avoid importing the full app/index.ts
	// to keep the test process light.
	const { webhookRoutes } = await import("./webhooks.routes");
	app = new Hono();
	app.use("*", async (c, next) => {
		c.set("controlPanelDb" as never, cpDb as never);
		await next();
	});
	app.route("/webhooks", webhookRoutes);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (!cpDb) return;
	if (seededLogId) {
		await cpDb.delete(emailLogs).where(eq(emailLogs.id, seededLogId));
	}
	if (seededDomainId) {
		await cpDb
			.delete(emailDomains)
			.where(eq(emailDomains.id, seededDomainId));
	}
	// Clean up any svix dedup rows we wrote.
	await cpDb
		.delete(processedWebhookEvents)
		.where(eq(processedWebhookEvents.source, "resend"));
});

beforeEach(() => {
	if (shouldSkipIntegration()) return;
});

describe("POST /webhooks/resend", () => {
	test("updates email_logs status on email.delivered", async () => {
		if (shouldSkipIntegration()) return;

		const body = JSON.stringify({
			type: "email.delivered",
			created_at: new Date().toISOString(),
			data: { email_id: TEST_RESEND_MESSAGE_ID },
		});
		const headers = svixHeaders(body, RESEND_WEBHOOK_SECRET);

		const res = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.received).toBe(true);

		const row = await cpDb!
			.select()
			.from(emailLogs)
			.where(eq(emailLogs.id, seededLogId!))
			.limit(1);
		expect(row[0]!.status).toBe("delivered");
		expect(row[0]!.lastEventType).toBe("email.delivered");
	});

	test("rejects an oversized body with 413 before svix verify", async () => {
		if (shouldSkipIntegration()) return;

		// > 64 KB cap. No valid svix signature needed — the size guard runs first.
		const body = JSON.stringify({
			type: "email.delivered",
			data: { email_id: TEST_RESEND_MESSAGE_ID, pad: "x".repeat(70 * 1024) },
		});
		const res = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});
		expect(res.status).toBe(413);
	});

	test("dedupes the same svix-id on replay", async () => {
		if (shouldSkipIntegration()) return;

		const body = JSON.stringify({
			type: "email.opened",
			created_at: new Date().toISOString(),
			data: { email_id: TEST_RESEND_MESSAGE_ID },
		});
		const headers = svixHeaders(body, RESEND_WEBHOOK_SECRET);

		const first = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body,
		});
		expect(first.status).toBe(200);
		expect(((await first.json()) as Record<string, unknown>).deduped).toBeUndefined();

		const second = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body,
		});
		expect(second.status).toBe(200);
		expect(((await second.json()) as Record<string, unknown>).deduped).toBe(true);
	});

	test("updates email_domains.status on domain.verified", async () => {
		if (shouldSkipIntegration()) return;

		const body = JSON.stringify({
			type: "domain.verified",
			created_at: new Date().toISOString(),
			data: { id: TEST_RESEND_DOMAIN_ID, status: "verified" },
		});
		const headers = svixHeaders(body, RESEND_WEBHOOK_SECRET);

		const res = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body,
		});
		expect(res.status).toBe(200);

		const row = await cpDb!
			.select()
			.from(emailDomains)
			.where(eq(emailDomains.id, seededDomainId!))
			.limit(1);
		expect(row[0]!.status).toBe("verified");
	});

	test("rejects invalid signature", async () => {
		if (shouldSkipIntegration()) return;
		const body = JSON.stringify({ type: "email.opened", data: {} });
		const res = await app.request("/webhooks/resend", {
			method: "POST",
			headers: {
				"svix-id": "x",
				"svix-timestamp": Math.floor(Date.now() / 1000).toString(),
				"svix-signature": "v1,not-a-real-sig",
				"content-type": "application/json",
			},
			body,
		});
		expect(res.status).toBe(400);
	});

	test("rejects missing svix headers", async () => {
		if (shouldSkipIntegration()) return;
		const body = JSON.stringify({ type: "email.opened", data: {} });
		const res = await app.request("/webhooks/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});
		expect(res.status).toBe(400);
	});
});
