/**
 * WS6 — the four v1 import entities. Each is idempotent on a natural key and
 * reuses the normal entity services (no raw side-effect writes beyond the
 * historical-record inserts the migration engine itself uses).
 */

import { user } from "@avantej-core/db/schema/auth";
import { creditPointLedger } from "@avantej-core/db/schema/tenant/credit-point-ledger";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { and, eq } from "drizzle-orm";

import { resolveBranchCurrency } from "../currency.service";
import {
	applyCreditPointDeltaTx,
	upsertCustomerProfile,
} from "../customer-profile.service";
import { createMember } from "../member.service";
import { createPackageInstance } from "../package-instance.service";
import type { ImportContext, ImporterSpec, ParseResult } from "./types";

// ---------------------------------------------------------------------------
// Small coercion helpers (kept local — no locale magic, import is explicit).
// ---------------------------------------------------------------------------

function req(raw: Record<string, string>, key: string): string {
	return (raw[key] ?? "").trim();
}
function opt(raw: Record<string, string>, key: string): string | null {
	const v = (raw[key] ?? "").trim();
	return v.length ? v : null;
}
function toInt(v: string): number | null {
	if (!/^-?\d+$/.test(v.trim())) return null;
	return Number.parseInt(v, 10);
}
function toDate(v: string): Date | null {
	const t = Date.parse(v.trim());
	return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Deterministic string → uuid-format id. credit_point_ledger.source_id is a
 * uuid column, so an arbitrary import ref can't be stored raw; this maps a ref
 * to a stable uuid (FNV-1a over 4 salted passes) so re-runs dedup on the same
 * value. Not cryptographic — collision-safe enough for per-tenant import refs.
 */
export function importRefToUuid(s: string): string {
	const words: number[] = [];
	for (let w = 0; w < 4; w++) {
		let h = 0x811c9dc5 ^ (w * 0x9e3779b1);
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		words.push(h >>> 0);
	}
	const hex = words.map((x) => x.toString(16).padStart(8, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
		16,
		20,
	)}-${hex.slice(20, 32)}`;
}

/** Global (cross-tenant) user id for an email, or null. */
async function findGlobalUserIdByEmail(
	ctx: ImportContext,
	email: string,
): Promise<string | null> {
	const [row] = await ctx.controlPanelDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email.toLowerCase()))
		.limit(1);
	return row?.id ?? null;
}

/**
 * The user id for an email ONLY when that user is a member of THIS tenant org.
 * `user.email` is unique across ALL tenants, so a bare global lookup would
 * mis-attribute one org's records to another org's customer. Packages /
 * Payments / Opening-balances require an EXISTING member here, so they resolve
 * through the tenant `members` table (which is this org's roster).
 */
async function findOrgMemberUserIdByEmail(
	ctx: ImportContext,
	email: string,
): Promise<string | null> {
	const userId = await findGlobalUserIdByEmail(ctx, email);
	if (!userId) return null;
	const [m] = await ctx.tenantDb
		.select({ id: members.id })
		.from(members)
		.where(eq(members.userId, userId))
		.limit(1);
	return m ? userId : null;
}

// ---------------------------------------------------------------------------
// Clients — control-panel user + tenant member(role=client) + customer_profile.
// Cross-DB dual write with manual rollback (no cross-DB tx). Idempotent on
// email (unique) then phone (app-level).
// ---------------------------------------------------------------------------

interface ClientRow {
	firstName: string;
	lastName: string;
	phone: string;
	email: string | null;
	branchNodeId: string;
	dateOfBirth: Date | null;
	gender: string | null;
	address: string | null;
	notes: string | null;
}

const UNCLAIMED_EMAIL_DOMAIN = "avantej.placeholder";

export const clientsImporter: ImporterSpec<ClientRow> = {
	entity: "clients",
	label: "Clients",
	columns: [
		{ name: "firstName", required: true, description: "Given name" },
		{ name: "lastName", required: false, description: "Family name" },
		{ name: "phone", required: true, description: "Phone (any format)" },
		{
			name: "email",
			required: false,
			description: "Email; blank → placeholder login",
		},
		{
			name: "branchNodeId",
			required: true,
			description: "Home branch node UUID",
		},
		{ name: "dateOfBirth", required: false, description: "ISO date" },
		{ name: "gender", required: false, description: "male|female|other" },
		{ name: "address", required: false, description: "Address" },
		{ name: "notes", required: false, description: "Free notes" },
	],
	parse(raw): ParseResult<ClientRow> {
		const errors: string[] = [];
		const firstName = req(raw, "firstName");
		if (!firstName) errors.push("firstName is required");
		const phone = req(raw, "phone");
		if (!phone) errors.push("phone is required");
		const branchNodeId = req(raw, "branchNodeId");
		if (!branchNodeId) errors.push("branchNodeId is required");
		const dobRaw = opt(raw, "dateOfBirth");
		let dateOfBirth: Date | null = null;
		if (dobRaw) {
			dateOfBirth = toDate(dobRaw);
			if (!dateOfBirth)
				errors.push(`dateOfBirth "${dobRaw}" is not a valid date`);
		}
		if (errors.length) return { ok: false, errors };
		return {
			ok: true,
			value: {
				firstName,
				lastName: req(raw, "lastName"),
				phone,
				email: opt(raw, "email"),
				branchNodeId,
				dateOfBirth,
				gender: opt(raw, "gender"),
				address: opt(raw, "address"),
				notes: opt(raw, "notes"),
			},
		};
	},
	async commit(ctx, v) {
		// Resolve any existing GLOBAL user for this email. user.email is unique
		// across ALL tenants, so we must decide org membership separately.
		const globalUserId = v.email
			? await findGlobalUserIdByEmail(ctx, v.email)
			: null;
		if (globalUserId) {
			// Already a member of THIS org → nothing to do (idempotent).
			const [m] = await ctx.tenantDb
				.select({ id: members.id })
				.from(members)
				.where(eq(members.userId, globalUserId))
				.limit(1);
			if (m) return { action: "skipped", ref: v.email ?? v.phone };
			// Else: a platform user (another gym / consumer app) who is NOT yet a
			// member here — add the membership+profile below using their existing
			// userId (do NOT mint a new user, do NOT skip → they'd never appear).
		} else {
			// New person: dedup on an existing (non-deleted) profile by phone.
			const [byPhone] = await ctx.tenantDb
				.select({ userId: customerProfiles.userId })
				.from(customerProfiles)
				.where(
					and(
						eq(customerProfiles.phone, v.phone),
						eq(customerProfiles.isDeleted, false),
					),
				)
				.limit(1);
			if (byPhone) return { action: "skipped", ref: v.phone };
		}

		// Validate the branch node exists (a bad uuid would create an orphan).
		const [branch] = await ctx.tenantDb
			.select({ id: hierarchyNodes.id })
			.from(hierarchyNodes)
			.where(eq(hierarchyNodes.id, v.branchNodeId))
			.limit(1);
		if (!branch) throw new Error(`branchNodeId ${v.branchNodeId} not found`);

		const createdUser = globalUserId === null;
		const userId = globalUserId ?? crypto.randomUUID();
		const name = [v.firstName, v.lastName].filter(Boolean).join(" ").trim();

		if (createdUser) {
			// Step 1 — control-panel user (created_at/updated_at notNull, no default).
			const now = new Date();
			const email =
				v.email?.toLowerCase() ??
				`unclaimed-${userId}@${UNCLAIMED_EMAIL_DOMAIN}`;
			await ctx.controlPanelDb.insert(user).values({
				id: userId,
				name,
				firstName: v.firstName,
				lastName: v.lastName,
				email,
				emailVerified: false,
				phone: v.phone,
				createdAt: now,
				updatedAt: now,
			});
		}
		try {
			// Step 2 — dual membership (control-panel + tenant).
			await createMember(ctx.controlPanelDb, ctx.tenantDb, {
				userId,
				organizationId: ctx.organizationId,
				role: "client",
				hierarchyScopeId: v.branchNodeId,
			});
			// Step 3 — tenant customer profile.
			await upsertCustomerProfile(ctx.tenantDb, {
				userId,
				phone: v.phone,
				dateOfBirth: v.dateOfBirth,
				gender: v.gender,
				address: v.address,
				notes: v.notes,
			});
		} catch (err) {
			// No cross-DB tx: undo BOTH sides so a partial failure leaves no orphan
			// (a tenant members row pointing at a deleted user, or vice versa).
			// The tenant members row that createMember may have committed:
			await ctx.tenantDb
				.delete(members)
				.where(eq(members.userId, userId))
				.catch(() => {});
			// Only delete the control-panel user if WE created it this run
			// (deleting a pre-existing platform user would nuke their other orgs).
			if (createdUser) {
				await ctx.controlPanelDb
					.delete(user)
					.where(eq(user.id, userId))
					.catch(() => {});
			}
			throw err;
		}
		return { action: "created", ref: name || v.phone };
	},
};

// ---------------------------------------------------------------------------
// Packages — package_instances for an existing client. Idempotent on
// purchaseNumber (unique).
// ---------------------------------------------------------------------------

interface PackageRow {
	customerEmail: string;
	serviceId: string;
	creditsTotal: number;
	totalPriceCents: number | null;
	startsAt: Date;
	expiresAt: Date;
	purchaseNumber: string;
	paymentStatus: string;
}

export const packagesImporter: ImporterSpec<PackageRow> = {
	entity: "packages",
	label: "Packages",
	columns: [
		{
			name: "customerEmail",
			required: true,
			description: "Owner's email (must already exist)",
		},
		{
			name: "serviceId",
			required: true,
			description: "Service UUID (a sellable package service)",
		},
		{
			name: "creditsTotal",
			required: true,
			description: "Total credits/sessions",
		},
		{ name: "totalPriceCents", required: false, description: "Price in cents" },
		{ name: "startsAt", required: true, description: "ISO start date" },
		{ name: "expiresAt", required: true, description: "ISO expiry date" },
		{
			name: "purchaseNumber",
			required: true,
			description: "Legacy purchase/invoice no (idempotency key)",
		},
		{
			name: "paymentStatus",
			required: false,
			description: "paid|pending|partially_paid (default paid)",
		},
	],
	parse(raw): ParseResult<PackageRow> {
		const errors: string[] = [];
		const customerEmail = req(raw, "customerEmail");
		if (!customerEmail) errors.push("customerEmail is required");
		const serviceId = req(raw, "serviceId");
		if (!serviceId) errors.push("serviceId is required");
		const creditsTotal = toInt(req(raw, "creditsTotal"));
		if (creditsTotal === null || creditsTotal <= 0)
			errors.push("creditsTotal must be a positive integer");
		const startsAt = toDate(req(raw, "startsAt"));
		if (!startsAt) errors.push("startsAt is not a valid date");
		const expiresAt = toDate(req(raw, "expiresAt"));
		if (!expiresAt) errors.push("expiresAt is not a valid date");
		const purchaseNumber = req(raw, "purchaseNumber");
		if (!purchaseNumber) errors.push("purchaseNumber is required");
		const priceRaw = opt(raw, "totalPriceCents");
		let totalPriceCents: number | null = null;
		if (priceRaw) {
			totalPriceCents = toInt(priceRaw);
			if (totalPriceCents === null)
				errors.push("totalPriceCents must be an integer (cents)");
		}
		if (errors.length) return { ok: false, errors };
		return {
			ok: true,
			value: {
				customerEmail,
				serviceId,
				creditsTotal: creditsTotal!,
				totalPriceCents,
				startsAt: startsAt!,
				expiresAt: expiresAt!,
				purchaseNumber,
				paymentStatus: opt(raw, "paymentStatus") ?? "paid",
			},
		};
	},
	async commit(ctx, v) {
		// Idempotency: existing package by purchaseNumber.
		const [existing] = await ctx.tenantDb
			.select({ id: packageInstances.id })
			.from(packageInstances)
			.where(eq(packageInstances.purchaseNumber, v.purchaseNumber))
			.limit(1);
		if (existing) return { action: "skipped", ref: v.purchaseNumber };

		const clientId = await findOrgMemberUserIdByEmail(ctx, v.customerEmail);
		if (!clientId)
			throw new Error(
				`No client with email ${v.customerEmail} (import Clients first)`,
			);
		const [name] = await ctx.controlPanelDb
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, clientId))
			.limit(1);

		await createPackageInstance(ctx.tenantDb, {
			clientId,
			serviceId: v.serviceId,
			source: "purchased",
			creditsTotal: v.creditsTotal,
			totalPrice: v.totalPriceCents,
			startsAt: v.startsAt,
			expiresAt: v.expiresAt,
			purchaseNumber: v.purchaseNumber,
			paymentStatus: v.paymentStatus,
			installmentsTotal: 1,
			customerName: name?.name ?? null,
		});
		return { action: "created", ref: v.purchaseNumber };
	},
};

// ---------------------------------------------------------------------------
// Payments — historical received-money records (NO commission / sales-order
// side effects — this is migrated history). Idempotent on paymentNumber.
// ---------------------------------------------------------------------------

interface PaymentRow {
	customerEmail: string;
	amountCents: number;
	taxCents: number;
	method: string;
	date: Date;
	paymentNumber: string;
	branchNodeId: string | null;
}

export const paymentsImporter: ImporterSpec<PaymentRow> = {
	entity: "payments",
	label: "Payments",
	columns: [
		{
			name: "customerEmail",
			required: true,
			description: "Payer's email (must already exist)",
		},
		{
			name: "amountCents",
			required: true,
			description: "Pre-tax amount in cents",
		},
		{
			name: "taxCents",
			required: false,
			description: "Tax in cents (default 0)",
		},
		{
			name: "method",
			required: false,
			description: "cash|card|bank_transfer (default cash)",
		},
		{ name: "date", required: true, description: "ISO payment date" },
		{
			name: "paymentNumber",
			required: true,
			description: "Receipt no (idempotency key)",
		},
		{
			name: "branchNodeId",
			required: false,
			description: "Branch node UUID (for currency)",
		},
	],
	parse(raw): ParseResult<PaymentRow> {
		const errors: string[] = [];
		const customerEmail = req(raw, "customerEmail");
		if (!customerEmail) errors.push("customerEmail is required");
		const amountCents = toInt(req(raw, "amountCents"));
		if (amountCents === null || amountCents < 0)
			errors.push("amountCents must be a non-negative integer");
		const date = toDate(req(raw, "date"));
		if (!date) errors.push("date is not a valid date");
		const paymentNumber = req(raw, "paymentNumber");
		if (!paymentNumber) errors.push("paymentNumber is required");
		const taxRaw = opt(raw, "taxCents");
		let taxCents = 0;
		if (taxRaw) {
			const t = toInt(taxRaw);
			if (t === null || t < 0)
				errors.push("taxCents must be a non-negative integer");
			else taxCents = t;
		}
		if (errors.length) return { ok: false, errors };
		return {
			ok: true,
			value: {
				customerEmail,
				amountCents: amountCents!,
				taxCents,
				method: opt(raw, "method") ?? "cash",
				date: date!,
				paymentNumber,
				branchNodeId: opt(raw, "branchNodeId"),
			},
		};
	},
	async commit(ctx, v) {
		// Idempotency: existing payment by paymentNumber.
		const [existing] = await ctx.tenantDb
			.select({ id: payments.id })
			.from(payments)
			.where(eq(payments.paymentNumber, v.paymentNumber))
			.limit(1);
		if (existing) return { action: "skipped", ref: v.paymentNumber };

		const customerId = await findOrgMemberUserIdByEmail(ctx, v.customerEmail);
		if (!customerId)
			throw new Error(
				`No client with email ${v.customerEmail} (import Clients first)`,
			);
		const currency = v.branchNodeId
			? await resolveBranchCurrency(ctx.tenantDb, v.branchNodeId)
			: "MYR";
		const total = v.amountCents + v.taxCents;
		await ctx.tenantDb.insert(payments).values({
			// Synthetic id marks this as an imported (non-Stripe) historical record.
			stripePaymentIntentId: `import_${crypto.randomUUID()}`,
			customerId,
			amount: v.amountCents,
			taxAmount: v.taxCents,
			totalAmount: total,
			franchiserAmount: total,
			currency,
			status: "succeeded",
			paymentMethod: v.method,
			paymentNumber: v.paymentNumber,
			description: "Imported historical payment",
			createdAt: v.date,
		});
		return { action: "created", ref: v.paymentNumber };
	},
};

// ---------------------------------------------------------------------------
// Opening balances — loyalty credit points for an existing client. Idempotent
// on credit_point_ledger (source_type='import', source_id=externalRef).
// ---------------------------------------------------------------------------

interface OpeningBalanceRow {
	customerEmail: string;
	points: number;
	externalRef: string;
	reason: string;
}

export const openingBalancesImporter: ImporterSpec<OpeningBalanceRow> = {
	entity: "opening_balances",
	label: "Opening balances (loyalty credit)",
	columns: [
		{
			name: "customerEmail",
			required: true,
			description: "Customer email (must already exist)",
		},
		{
			name: "points",
			required: true,
			description: "Credit points (1 point = 1 sen); non-zero integer",
		},
		{
			name: "externalRef",
			required: true,
			description: "Unique ref for this balance (idempotency key)",
		},
		{
			name: "reason",
			required: false,
			description: "Note (default: Opening balance import)",
		},
	],
	parse(raw): ParseResult<OpeningBalanceRow> {
		const errors: string[] = [];
		const customerEmail = req(raw, "customerEmail");
		if (!customerEmail) errors.push("customerEmail is required");
		const points = toInt(req(raw, "points"));
		if (points === null || points === 0)
			errors.push("points must be a non-zero integer");
		const externalRef = req(raw, "externalRef");
		if (!externalRef) errors.push("externalRef is required");
		if (errors.length) return { ok: false, errors };
		return {
			ok: true,
			value: {
				customerEmail,
				points: points!,
				externalRef,
				reason: opt(raw, "reason") ?? "Opening balance import",
			},
		};
	},
	async commit(ctx, v) {
		const customerUserId = await findOrgMemberUserIdByEmail(
			ctx,
			v.customerEmail,
		);
		if (!customerUserId)
			throw new Error(
				`No client with email ${v.customerEmail} (import Clients first)`,
			);
		const sourceId = importRefToUuid(v.externalRef);
		return ctx.tenantDb.transaction(async (tx) => {
			// Lock the profile row FIRST so two concurrent same-ref imports
			// serialize here: the second waits, then its dedup SELECT below sees
			// the first's committed ledger row and skips (no double-credit).
			const [profile] = await tx
				.select({ userId: customerProfiles.userId })
				.from(customerProfiles)
				.where(eq(customerProfiles.userId, customerUserId))
				.for("update")
				.limit(1);
			if (!profile)
				throw new Error(
					`Customer profile not found for ${v.customerEmail} (import Clients first)`,
				);
			// Idempotency: this externalRef (→ stable uuid) already applied?
			const [existing] = await tx
				.select({ id: creditPointLedger.id })
				.from(creditPointLedger)
				.where(
					and(
						eq(creditPointLedger.sourceType, "import"),
						eq(creditPointLedger.sourceId, sourceId),
					),
				)
				.limit(1);
			if (existing) return { action: "skipped" as const, ref: v.externalRef };
			// Requires an existing profile (locked FOR UPDATE inside).
			await applyCreditPointDeltaTx(tx, {
				customerUserId,
				signedDelta: v.points,
				reason: v.reason,
				sourceType: "import",
				sourceId,
				actorUserId: ctx.actorUserId,
			});
			return { action: "created" as const, ref: v.externalRef };
		});
	},
};

export const IMPORTERS = {
	clients: clientsImporter,
	packages: packagesImporter,
	payments: paymentsImporter,
	opening_balances: openingBalancesImporter,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as Record<string, ImporterSpec<any>>;
