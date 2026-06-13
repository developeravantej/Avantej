/**
 * installment-autocharge.integration.test.ts
 *
 * Proves three gaps against real Stripe TEST mode (Connect):
 *
 *   Gap 1 — Refund notification:
 *     processRefund writes a `refund_required` notification row for admins
 *     when a PAID installment is reversed.
 *
 *   Gap 2 — Auto-charge success:
 *     runInstallmentAutoCharge creates an off-session PaymentIntent on the
 *     connected account, persists stripe_payment_intent_id on the installment,
 *     and the PI reaches status=succeeded.
 *
 *   Gap 3 — SCA fallback:
 *     When the saved card requires authentication (off-session), the service
 *     does NOT persist a PI, generates a fallback payment link
 *     (stripe_payment_link_id), and writes an `installment_autocharge_failed`
 *     notification for admins.
 *
 * DB pattern: uses the shared node-postgres integration harness from
 * integration-setup.ts (createTenantDb / createControlPanelDb). The memory note
 * about "neon-serverless WS hanging" referred to the *old* setup before the
 * pg-Pool harness was introduced; the current harness is stable.
 *
 * Skips automatically when:
 *   - TENANT_DATABASE_URL / DATABASE_URL unset (no .dev.vars)
 *   - STRIPE_SECRET_KEY unset
 *   - Connected Stripe account is not charges-enabled
 *
 * Run: cd apps/server && bun test src/tests/integration/installment-autocharge.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";

import { installments } from "@avantej-core/db/schema/tenant/installments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { members } from "@avantej-core/db/schema/tenant/members";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { services } from "@avantej-core/db/schema/tenant/services";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";

import pg from "pg";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";
import { decrypt } from "@avantej-core/db";
import {
	loadDevVars,
	shouldSkipIntegration,
	createControlPanelDb,
	TEST_ORG_ID,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
	TEST_MEMBER_ID,
	TEST_SERVICE_ID,
} from "../helpers/integration-setup";
import { getConnectAccountForOrg } from "@/services/connect-account.service";
import { getStripeClient } from "@/lib/stripe";
import {
	runInstallmentAutoCharge,
	type InstallmentAutoChargeReport,
} from "@/services/installment-autocharge.service";
import { processRefund } from "@avantej-core/services";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Suite-level skip logic
// ---------------------------------------------------------------------------

loadDevVars();

const skipIntegration = shouldSkipIntegration();
const skipStripe = skipIntegration || !process.env.STRIPE_SECRET_KEY;

const d = skipStripe ? describe.skip : describe;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// tenantDb resolved at runtime from the control-panel (fresh connection string).
// Cast to `any` at call sites where the service expects NeonDatabase — the runtime
// API is identical; only the TypeScript nominal types differ.
type TenantDb = ReturnType<typeof pgDrizzle<typeof tenantSchema>>;
let tenantDb: TenantDb;
let tenantPool: InstanceType<typeof Pool>;
let controlPanelDb: ReturnType<typeof createControlPanelDb>;
let stripe: Stripe;
let connectedAcctId: string;
let skipDueToConnect = false; // set true if account not charges-enabled

// Test namespace tag — prevents ID collisions with parallel runs.
const TS = Date.now();

// Track all created rows for teardown. Order matters: children before parents.
const created = {
	notificationIds: [] as string[],
	installmentEventPkgIds: [] as string[],
	installmentIds: [] as string[],
	pkgIds: [] as string[],
	salesOrderIds: [] as string[],
	memberIds: [] as string[],
	hierarchyNodeIds: [] as string[],
	stripeCustomerIds: [] as string[], // on connected account
	stripePriceIds: [] as string[],    // on connected account (payment links)
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the canonical test hierarchy node and service exist (idempotent).
 * Installment FK → salesOrders FK → hierarchyNodes; packageInstances FK → services.
 */
async function ensureBaseline(): Promise<void> {
	await tenantDb
		.insert(hierarchyNodes)
		.values({
			id: TEST_BRANCH_NODE_ID,
			name: "AutoCharge Test Branch",
			slug: "autocharge-test-branch",
			type: "branch",
			depth: 3,
		})
		.onConflictDoNothing();

	await tenantDb
		.insert(services)
		.values({
			id: TEST_SERVICE_ID,
			name: "AutoCharge Test Service",
			duration: 3600,
			maxAttendees: 1,
		})
		.onConflictDoNothing();
}

/**
 * Ensure an admin member row exists that notification fan-out can target.
 * Returns the userId that was upserted.
 */
async function ensureAdminMember(): Promise<string> {
	const adminUserId = `autocharge-admin-${TS}`;

	const [existing] = await tenantDb
		.select({ id: members.id })
		.from(members)
		.where(and(eq(members.userId, adminUserId), eq(members.role, "admin")))
		.limit(1);

	if (existing) return adminUserId;

	const [row] = await tenantDb
		.insert(members)
		.values({
			userId: adminUserId,
			role: "admin",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
		})
		.returning();

	if (!row) throw new Error("Failed to insert admin member");
	created.memberIds.push(row.id);
	return adminUserId;
}

interface SeedPkgResult {
	pkgId: string;
	installmentId: string;
}

/**
 * Insert a minimal package instance + one pending installment due yesterday.
 * The installment is deliberately past-due so the auto-charge candidate query
 * (lte dueDate <= now) picks it up in the same calendar minute the test runs.
 */
async function seedPkgWithDueInstallment(opts?: {
	stripeCustomerId?: string;
	defaultPaymentMethodId?: string;
	autoChargeEnabled?: boolean;
}): Promise<SeedPkgResult> {
	const [so] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: `AC-TEST-${TS}-${crypto.randomUUID().slice(0, 8)}`,
			date: new Date(),
			customerName: "AutoCharge Test Customer",
			createdBy: TEST_USER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: 30000,
		})
		.returning();
	if (!so) throw new Error("Failed to insert sales order");
	created.salesOrderIds.push(so.id);

	const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

	const [pkg] = await tenantDb
		.insert(packageInstances)
		.values({
			serviceId: TEST_SERVICE_ID,
			clientId: `ac-test-client-${TS}`,
			source: "pos",
			paymentStatus: "pending",
			creditsTotal: 3,
			creditsUsed: 0,
			creditsUnlocked: 1,
			paymentPlanType: "quarterly",
			installmentsTotal: 3,
			installmentsPaid: 0,
			isLocked: false,
			allowCreditOverdraft: false,
			status: "active",
			startsAt: new Date(),
			expiresAt: future,
			nextDueDate: yesterday,
			salesOrderId: so.id,
			stripeCustomerId: opts?.stripeCustomerId ?? null,
			defaultPaymentMethodId: opts?.defaultPaymentMethodId ?? null,
			autoChargeEnabled: opts?.autoChargeEnabled ?? false,
		})
		.returning();
	if (!pkg) throw new Error("Failed to insert package instance");
	created.pkgIds.push(pkg.id);

	const [installment] = await tenantDb
		.insert(installments)
		.values({
			packageInstanceId: pkg.id,
			salesOrderId: so.id,
			installmentNumber: 1,
			amount: 10000, // RM 100
			taxAmount: 0,
			status: "pending",
			dueDate: yesterday,
			creditsUnlockedByThis: 1,
		})
		.returning();
	if (!installment) throw new Error("Failed to insert installment");
	created.installmentIds.push(installment.id);

	return { pkgId: pkg.id, installmentId: installment.id };
}

/**
 * Create a Stripe Customer + attach a PaymentMethod on the connected account.
 *
 * `tokToken` is a Stripe test TOKEN (tok_visa, tok_visa_authenticationRequired,
 * etc.). We create the PM via `paymentMethods.create` with `card.token` —
 * tok_ tokens are cross-account and can be used to create PMs on a connected
 * account without raw card data. The PM is then explicitly attached.
 *
 * Returns { customerId, paymentMethodId }.
 */
async function createStripeCustomerWithPM(
	tokToken: string,
): Promise<{ customerId: string; paymentMethodId: string }> {
	const customer = await stripe.customers.create(
		{ description: `AutoCharge Integration Test ${TS}` },
		{ stripeAccount: connectedAcctId },
	);
	created.stripeCustomerIds.push(customer.id);

	// Create a PaymentMethod from the tok_ token on the connected account.
	// tok_ tokens (unlike pm_ tokens) are cross-account and can be used here.
	const pm = await stripe.paymentMethods.create(
		{
			type: "card",
			card: { token: tokToken } as any,
		} as any,
		{ stripeAccount: connectedAcctId },
	);

	// Attach the PM to the customer on the connected account.
	await stripe.paymentMethods.attach(
		pm.id,
		{ customer: customer.id },
		{ stripeAccount: connectedAcctId },
	);

	await stripe.customers.update(
		customer.id,
		{ invoice_settings: { default_payment_method: pm.id } },
		{ stripeAccount: connectedAcctId },
	);

	return { customerId: customer.id, paymentMethodId: pm.id };
}

// ---------------------------------------------------------------------------
// beforeAll / afterAll
// ---------------------------------------------------------------------------

beforeAll(async () => {
	if (skipStripe) return;

	controlPanelDb = createControlPanelDb();
	stripe = getStripeClient();

	// Resolve the fresh tenant connection string from the control-panel DB.
	// TENANT_DATABASE_URL in .dev.vars can be stale; the authoritative source
	// is organizations.connection_string (encrypted) in the control-panel DB.
	try {
		const [org] = await controlPanelDb
			.select({ connectionString: organizations.connectionString })
			.from(organizations)
			.where(eq(organizations.id, TEST_ORG_ID))
			.limit(1);

		if (!org?.connectionString) {
			console.warn(
				`[autocharge.integration] Org ${TEST_ORG_ID} has no connectionString — falling back to TENANT_DATABASE_URL`,
			);
			const fallback = process.env.TENANT_DATABASE_URL;
			if (!fallback) throw new Error("No tenant DB URL available");
			tenantPool = new Pool({ connectionString: fallback, ssl: { rejectUnauthorized: false } });
		} else {
			const connStr = decrypt(org.connectionString);
			tenantPool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
		}

		tenantDb = pgDrizzle({ client: tenantPool, schema: tenantSchema });
		console.log("[autocharge.integration] Tenant DB connected via control-panel lookup");
	} catch (err) {
		console.warn("[autocharge.integration] Failed to connect tenant DB:", err instanceof Error ? err.message : String(err));
		return;
	}

	await ensureBaseline();
	await ensureAdminMember();

	// Resolve the test org's Connect account.
	try {
		const acct = await getConnectAccountForOrg(TEST_ORG_ID, controlPanelDb);
		if (!acct.chargesEnabled) {
			console.warn(
				`[autocharge.integration] Stripe Connect account ${acct.acctId} is not charges-enabled — skipping Stripe tests`,
			);
			skipDueToConnect = true;
			return;
		}
		connectedAcctId = acct.acctId;
		console.log(
			`[autocharge.integration] Using connected account: ${connectedAcctId}`,
		);
	} catch (err) {
		console.warn(
			`[autocharge.integration] getConnectAccountForOrg failed — skipping Stripe tests:`,
			err instanceof Error ? err.message : String(err),
		);
		skipDueToConnect = true;
	}
});

afterAll(async () => {
	if (skipStripe || !tenantDb) {
		await tenantPool?.end().catch(() => {});
		return;
	}

	// Notifications (no FK children).
	if (created.notificationIds.length > 0) {
		await tenantDb
			.delete(notifications)
			.where(inArray(notifications.id, created.notificationIds))
			.catch((e) => console.warn("[cleanup] notifications:", e));
	}

	// InstallmentEvents by pkgId.
	if (created.installmentEventPkgIds.length > 0) {
		await tenantDb
			.delete(installmentEvents)
			.where(
				inArray(installmentEvents.packageInstanceId, created.installmentEventPkgIds),
			)
			.catch((e) => console.warn("[cleanup] installmentEvents:", e));
	}

	// AuditLogs by pkgId.
	if (created.pkgIds.length > 0) {
		await tenantDb
			.delete(auditLogs)
			.where(
				and(
					eq(auditLogs.entityType, "package_instance"),
					inArray(auditLogs.entityId, created.pkgIds),
				),
			)
			.catch((e) => console.warn("[cleanup] auditLogs:", e));
	}

	// Installments cascade from packageInstances, but delete explicitly.
	if (created.installmentIds.length > 0) {
		await tenantDb
			.delete(installments)
			.where(inArray(installments.id, created.installmentIds))
			.catch((e) => console.warn("[cleanup] installments:", e));
	}

	// PackageInstances (cascade deletes installments FK).
	if (created.pkgIds.length > 0) {
		await tenantDb
			.delete(packageInstances)
			.where(inArray(packageInstances.id, created.pkgIds))
			.catch((e) => console.warn("[cleanup] packageInstances:", e));
	}

	// SalesOrders.
	if (created.salesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, created.salesOrderIds))
			.catch((e) => console.warn("[cleanup] salesOrders:", e));
	}

	// Members.
	if (created.memberIds.length > 0) {
		await tenantDb
			.delete(members)
			.where(inArray(members.id, created.memberIds))
			.catch((e) => console.warn("[cleanup] members:", e));
	}

	// Stripe objects on the connected account (test-mode, best-effort).
	if (!skipDueToConnect && connectedAcctId) {
		for (const cid of created.stripeCustomerIds) {
			await stripe.customers
				.del(cid, undefined, { stripeAccount: connectedAcctId })
				.catch((e) =>
					console.warn(`[cleanup] Stripe customer ${cid}:`, e.message),
				);
		}
	}

	await tenantPool?.end().catch(() => {});
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

d("installment auto-charge integration", () => {
	// -------------------------------------------------------------------------
	// Gap 1 — Refund notification
	// -------------------------------------------------------------------------
	test(
		"Gap 1: processRefund writes a refund_required notification for admins",
		async () => {
			if (skipDueToConnect) {
				console.log(
					"[Gap 1] Skipped — Connect account not charges-enabled (notification path still exercised)",
				);
				// NOTE: The refund notification path does NOT require a Connect account;
				// we only skip when the whole suite is skipped due to missing STRIPE_SECRET_KEY.
				// If skipDueToConnect is true but skipStripe is false, we can still run this test.
				// For simplicity we let it run regardless — notification fan-out is pure DB.
			}

			// Seed: package with one PAID installment.
			const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
			const now = new Date();

			const [so] = await tenantDb
				.insert(salesOrders)
				.values({
					salesOrderNumber: `AC-REFUND-${TS}`,
					date: now,
					customerName: "Refund Test Customer",
					createdBy: TEST_USER_ID,
					branchId: TEST_BRANCH_NODE_ID,
					status: "confirmed",
					totalAmount: 10000,
				})
				.returning();
			if (!so) throw new Error("Failed to insert sales order for refund test");
			created.salesOrderIds.push(so.id);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: TEST_SERVICE_ID,
					clientId: `refund-test-client-${TS}`,
					source: "pos",
					paymentStatus: "pending",
					creditsTotal: 2,
					creditsUsed: 0,
					creditsUnlocked: 2,
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 1,
					isLocked: false,
					allowCreditOverdraft: false,
					status: "active",
					startsAt: now,
					expiresAt: future,
					salesOrderId: so.id,
				})
				.returning();
			if (!pkg) throw new Error("Failed to insert package instance for refund test");
			created.pkgIds.push(pkg.id);
			created.installmentEventPkgIds.push(pkg.id);

			// Insert 1 PAID installment + 1 pending.
			const [paidInst] = await tenantDb
				.insert(installments)
				.values({
					packageInstanceId: pkg.id,
					salesOrderId: so.id,
					installmentNumber: 1,
					amount: 5000,
					taxAmount: 0,
					status: "paid",
					dueDate: now,
					amountPaid: 5000,
					creditsUnlockedByThis: 1,
				})
				.returning();
			if (!paidInst) throw new Error("Failed to insert paid installment");
			created.installmentIds.push(paidInst.id);

			const [pendingInst] = await tenantDb
				.insert(installments)
				.values({
					packageInstanceId: pkg.id,
					salesOrderId: so.id,
					installmentNumber: 2,
					amount: 5000,
					taxAmount: 0,
					status: "pending",
					dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
					creditsUnlockedByThis: 1,
				})
				.returning();
			if (!pendingInst) throw new Error("Failed to insert pending installment");
			created.installmentIds.push(pendingInst.id);

			// Note notifications before refund.
			const adminUserId = `autocharge-admin-${TS}`;
			const notifsBefore = await tenantDb
				.select({ id: notifications.id })
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, adminUserId),
						eq(notifications.type, "refund_required"),
					),
				);

			// Call processRefund.
			const actor = {
				userId: TEST_USER_ID,
				memberId: TEST_MEMBER_ID,
				role: "admin",
			};
			const result = await processRefund(
				tenantDb as any,
				pkg.id,
				5000,
				TEST_USER_ID,
				"Integration test refund",
				actor,
			);

			// Assertions on DB state.
			const [updatedPkg] = await tenantDb
				.select({
					status: packageInstances.status,
					paymentStatus: packageInstances.paymentStatus,
				})
				.from(packageInstances)
				.where(eq(packageInstances.id, pkg.id));

			expect(updatedPkg?.status).toBe("cancelled");
			expect(updatedPkg?.paymentStatus).toBe("refunded");

			const instRows = await tenantDb
				.select({
					number: installments.installmentNumber,
					status: installments.status,
				})
				.from(installments)
				.where(eq(installments.packageInstanceId, pkg.id));

			const byNum = Object.fromEntries(
				instRows.map((r) => [r.number, r.status]),
			);
			// The paid installment (#1) is reversed to "refunded".
			expect(byNum[1]).toBe("refunded");
			// The pending installment (#2) is cancelled.
			expect(byNum[2]).toBe("cancelled");

			// paidAmountToRefund should equal what was on #1.
			expect(result.refundedInstallmentIds).toHaveLength(1);
			expect(result.refundedInstallmentIds[0]).toBe(paidInst.id);
			expect(result.paidAmountToRefund).toBe(5000);

			// Gap 1 core assertion: a refund_required notification was written for the admin.
			const notifRows = await tenantDb
				.select({
					id: notifications.id,
					type: notifications.type,
					relatedId: notifications.relatedId,
					relatedType: notifications.relatedType,
					userId: notifications.userId,
				})
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, adminUserId),
						eq(notifications.type, "refund_required"),
					),
				);

			// Track for cleanup.
			for (const n of notifRows) {
				if (!created.notificationIds.includes(n.id)) {
					created.notificationIds.push(n.id);
				}
			}

			const newNotifs = notifRows.filter(
				(n) => !notifsBefore.some((b) => b.id === n.id),
			);

			console.log(
				`[Gap 1] refund_required notifications written: ${newNotifs.length}`,
				newNotifs.map((n) => ({
					type: n.type,
					relatedId: n.relatedId,
					relatedType: n.relatedType,
				})),
			);

			expect(newNotifs.length).toBeGreaterThanOrEqual(1);
			const refundNotif = newNotifs.find((n) => n.type === "refund_required");
			expect(refundNotif).toBeTruthy();
			expect(refundNotif?.relatedId).toBe(pkg.id);
			expect(refundNotif?.relatedType).toBe("package_instance");
		},
		60_000,
	);

	// -------------------------------------------------------------------------
	// Gap 2 — Auto-charge success
	// -------------------------------------------------------------------------
	test(
		"Gap 2: runInstallmentAutoCharge creates a succeeded PI and persists stripe_payment_intent_id",
		async () => {
			if (skipDueToConnect) {
				console.log("[Gap 2] Skipped — Connect account not charges-enabled");
				return;
			}

			// Create Stripe Customer + attach pm_card_visa (no 3DS, always succeeds).
			const { customerId, paymentMethodId } =
				// tok_visa = Visa card, no 3DS, always succeeds off-session.
			await createStripeCustomerWithPM("tok_visa");

			console.log(
				`[Gap 2] Stripe customer=${customerId} pm=${paymentMethodId}`,
			);

			// Seed package with due installment + auto-charge fields.
			const { pkgId, installmentId } = await seedPkgWithDueInstallment({
				stripeCustomerId: customerId,
				defaultPaymentMethodId: paymentMethodId,
				autoChargeEnabled: true,
			});
			created.installmentEventPkgIds.push(pkgId);

			// Use a synthetic `now` 1 day in the future to ensure dueDate <= now.
			const syntheticNow = new Date(Date.now() + 2 * 60 * 1000);

			const report: InstallmentAutoChargeReport = await runInstallmentAutoCharge({
				controlPanelDb,
				getTenantDb: async (_orgId: string) => tenantDb as any,
				stripe,
				now: syntheticNow,
			});

			console.log("[Gap 2] runInstallmentAutoCharge report:", report);

			// Core assertion: at least one installment was charged.
			// NOTE: report.errors may be > 0 if other active orgs in the control-panel
			// DB have no Connect account; that is normal multi-org cron behaviour and
			// is NOT a bug in the service. We only assert the charged count here.
			expect(report.charged).toBeGreaterThanOrEqual(1);
			console.log(
				`[Gap 2] errors=${report.errors} — expected if other orgs lack Connect account`,
			);

			// The installment row must now carry a PI id.
			const [updatedInst] = await tenantDb
				.select({
					stripePaymentIntentId: installments.stripePaymentIntentId,
					stripePaymentLinkId: installments.stripePaymentLinkId,
				})
				.from(installments)
				.where(eq(installments.id, installmentId));

			expect(updatedInst?.stripePaymentIntentId).toBeTruthy();
			expect(updatedInst?.stripePaymentLinkId).toBeNull();

			const piId = updatedInst!.stripePaymentIntentId!;
			console.log(`[Gap 2] Persisted PI id: ${piId}`);

			// Fetch the PI from Stripe and assert metadata + status.
			const pi = await stripe.paymentIntents.retrieve(piId, undefined, {
				stripeAccount: connectedAcctId,
			});

			console.log(
				`[Gap 2] Stripe PI status=${pi.status} metadata=${JSON.stringify(pi.metadata)}`,
			);

			// Off-session confirm: PI should be succeeded (visa test card auto-confirms).
			expect(pi.status).toBe("succeeded");
			expect(pi.metadata.type).toBe("installment");
			expect(pi.metadata.installmentId).toBe(installmentId);
			expect(pi.metadata.organizationId).toBe(TEST_ORG_ID);
		},
		120_000,
	);

	// -------------------------------------------------------------------------
	// Gap 3 — SCA fallback
	// -------------------------------------------------------------------------
	test(
		"Gap 3: SCA card triggers fallback — no PI persisted, payment link created, admin notified",
		async () => {
			if (skipDueToConnect) {
				console.log("[Gap 3] Skipped — Connect account not charges-enabled");
				return;
			}

			// tok_visa_authenticationRequired → authentication_required off-session.
			const { customerId: scaCustomerId, paymentMethodId: scaPmId } =
				await createStripeCustomerWithPM("tok_visa_authenticationRequired");

			console.log(
				`[Gap 3] SCA Stripe customer=${scaCustomerId} pm=${scaPmId}`,
			);

			const adminUserId = `autocharge-admin-${TS}`;

			// Capture notifications count for this admin before the run.
			const notifsBefore = await tenantDb
				.select({ id: notifications.id })
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, adminUserId),
						eq(notifications.type, "installment_autocharge_failed"),
					),
				);

			// Seed package with the SCA card.
			const { pkgId: scaPkgId, installmentId: scaInstId } =
				await seedPkgWithDueInstallment({
					stripeCustomerId: scaCustomerId,
					defaultPaymentMethodId: scaPmId,
					autoChargeEnabled: true,
				});
			created.installmentEventPkgIds.push(scaPkgId);

			const syntheticNow = new Date(Date.now() + 2 * 60 * 1000);

			const report: InstallmentAutoChargeReport = await runInstallmentAutoCharge({
				controlPanelDb,
				getTenantDb: async (_orgId: string) => tenantDb as any,
				stripe,
				now: syntheticNow,
			});

			console.log("[Gap 3] runInstallmentAutoCharge report:", report);

			// Core assertions on the report.
			expect(report.fellBackToLink).toBeGreaterThanOrEqual(1);

			// The installment row must NOT have a PI id (the charge was not persisted
			// before the error — only the fallback link should be set).
			const [updatedInst] = await tenantDb
				.select({
					stripePaymentIntentId: installments.stripePaymentIntentId,
					stripePaymentLinkId: installments.stripePaymentLinkId,
				})
				.from(installments)
				.where(eq(installments.id, scaInstId));

			console.log(
				`[Gap 3] Installment after SCA run: piId=${updatedInst?.stripePaymentIntentId} linkId=${updatedInst?.stripePaymentLinkId}`,
			);

			expect(updatedInst?.stripePaymentIntentId).toBeNull();
			expect(updatedInst?.stripePaymentLinkId).toBeTruthy();

			// Track the price object embedded in the link for cleanup reporting (the
			// link itself is in Stripe test mode and harmless, but we note the link id).
			const linkId = updatedInst!.stripePaymentLinkId!;
			console.log(`[Gap 3] Fallback payment link id: ${linkId}`);

			// An `installment_autocharge_failed` notification must exist for the admin.
			const notifRows = await tenantDb
				.select({
					id: notifications.id,
					type: notifications.type,
					relatedId: notifications.relatedId,
					relatedType: notifications.relatedType,
				})
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, adminUserId),
						eq(notifications.type, "installment_autocharge_failed"),
					),
				);

			for (const n of notifRows) {
				if (!created.notificationIds.includes(n.id)) {
					created.notificationIds.push(n.id);
				}
			}

			const newNotifs = notifRows.filter(
				(n) => !notifsBefore.some((b) => b.id === n.id),
			);

			console.log(
				`[Gap 3] installment_autocharge_failed notifications: ${newNotifs.length}`,
				newNotifs.map((n) => ({
					type: n.type,
					relatedId: n.relatedId,
					relatedType: n.relatedType,
				})),
			);

			expect(newNotifs.length).toBeGreaterThanOrEqual(1);
			const failedNotif = newNotifs.find(
				(n) => n.type === "installment_autocharge_failed",
			);
			expect(failedNotif).toBeTruthy();
			expect(failedNotif?.relatedId).toBe(scaInstId);
			expect(failedNotif?.relatedType).toBe("installment");
		},
		120_000,
	);
});
