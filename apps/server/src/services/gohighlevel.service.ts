import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { user } from "@avantej-core/db/schema/auth";
import { ghlLocationLinks } from "@avantej-core/db/schema/control-panel/ghl-location-links";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { createHash } from "node:crypto";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";

export type GhlEventType = "create" | "update" | "delete" | "custom";

export class GhlWebhookError extends Error {
	status: number;
	code: string;

	constructor(message: string, status = 400, code = "invalid_request") {
		super(message);
		this.status = status;
		this.code = code;
	}
}

type AnyRecord = Record<string, unknown>;

export type ExtractedGhlContactPayload = {
	contactId: string;
	email: string;
	name?: string;
	phone?: string;
	payloadLocationId?: string;
	dynamicFields: Record<string, unknown>;
};

export function detectGhlEventType(payload: AnyRecord): GhlEventType {
	const rawType =
		normalizeString(payload.eventType) ||
		normalizeString(payload.event) ||
		normalizeString(payload.type) ||
		normalizeString(payload.action);

	const deleted = payload.deleted === true || payload.isDeleted === true;
	if (deleted || (rawType && rawType.includes("delete"))) {
		return "delete";
	}
	if (rawType && rawType.includes("create")) {
		return "create";
	}
	if (rawType && rawType.includes("update")) {
		return "update";
	}
	return "update";
}

export function extractGhlContactPayload(
	payload: AnyRecord
): ExtractedGhlContactPayload {
	const contact = asRecord(payload.contact);
	const contactId =
		normalizeString(contact?.id) ||
		normalizeString(payload.contactId) ||
		normalizeString(payload.contact_id) ||
		normalizeString(payload.id);
	const email =
		normalizeString(contact?.email) ||
		normalizeString(payload.email) ||
		normalizeString(payload.contact_email);
	const phone =
		normalizeString(contact?.phone) ||
		normalizeString(payload.phone) ||
		normalizeString(payload.contact_phone);
	const name =
		normalizeString(contact?.name) ||
		normalizeString(payload.name) ||
		buildNameFromParts(contact, payload);
	const payloadLocationId =
		normalizeString(payload.locationId) ||
		normalizeString(payload.location_id) ||
		normalizeString(contact?.locationId);

	if (!contactId) {
		throw new GhlWebhookError("Missing required field: contact.id", 400, "missing_contact_id");
	}
	if (!email) {
		throw new GhlWebhookError("Missing required field: email", 400, "missing_email");
	}

	const dynamicFields = removeCoreKeys(payload, contact);

	return {
		contactId,
		email,
		name: name || undefined,
		phone: phone || undefined,
		payloadLocationId: payloadLocationId || undefined,
		dynamicFields,
	};
}

export async function buildGhlEventKey(args: {
	locationId: string;
	contactId: string;
	eventType: GhlEventType;
	payload: AnyRecord;
}): Promise<string> {
	const canonicalPayload = stableStringify(args.payload);
	const digest = createHash("sha256").update(canonicalPayload).digest("hex");
	return `${args.locationId}:${args.contactId}:${args.eventType}:${digest}`;
}

function normalizeString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): AnyRecord | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as AnyRecord;
}

function buildNameFromParts(contact: AnyRecord | null, payload: AnyRecord): string | null {
	const firstName =
		normalizeString(contact?.firstName) ||
		normalizeString(contact?.first_name) ||
		normalizeString(payload.firstName) ||
		normalizeString(payload.first_name);
	const lastName =
		normalizeString(contact?.lastName) ||
		normalizeString(contact?.last_name) ||
		normalizeString(payload.lastName) ||
		normalizeString(payload.last_name);

	const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
	return fullName.length > 0 ? fullName : null;
}

function removeCoreKeys(payload: AnyRecord, contact: AnyRecord | null): Record<string, unknown> {
	const topLevelIgnored = new Set([
		"id",
		"contact",
		"contactId",
		"contact_id",
		"name",
		"email",
		"phone",
		"locationId",
		"location_id",
		"eventType",
		"event",
		"type",
		"action",
		"deleted",
		"isDeleted",
	]);

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(payload)) {
		if (topLevelIgnored.has(key)) {
			continue;
		}
		result[key] = value;
	}

	if (contact) {
		const nestedIgnored = new Set([
			"id",
			"name",
			"email",
			"phone",
			"firstName",
			"first_name",
			"lastName",
			"last_name",
			"locationId",
			"location_id",
		]);

		for (const [key, value] of Object.entries(contact)) {
			if (nestedIgnored.has(key)) {
				continue;
			}
			result[`contact.${key}`] = value;
		}
	}

	return result;
}

function stableSortValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => stableSortValue(item));
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const sortedKeys = Object.keys(record).sort();
		const out: Record<string, unknown> = {};
		for (const key of sortedKeys) {
			out[key] = stableSortValue(record[key]);
		}
		return out;
	}
	return value;
}

function stableStringify(value: unknown): string {
	return JSON.stringify(stableSortValue(value));
}

async function verifyOptionalSignature(args: {
	rawBody: string;
	signature: string | undefined;
	webhookSecret: string | null;
}): Promise<void> {
	const { rawBody, signature, webhookSecret } = args;
	if (!webhookSecret) {
		return;
	}
	if (!signature) {
		throw new GhlWebhookError(
			"Missing x-wh-signature header for configured location",
			401,
			"missing_signature"
		);
	}

	const normalizedHeader = signature.replace(/^sha256=/i, "");
	const expectedHex = createHash("sha256")
		.update(`${webhookSecret}.${rawBody}`)
		.digest("hex");
	const expectedHexDirect = createHash("sha256")
		.update(rawBody + webhookSecret)
		.digest("hex");
	const expectedBase64 = createHash("sha256")
		.update(rawBody + webhookSecret)
		.digest("base64");

	const matches =
		normalizedHeader === expectedHex ||
		normalizedHeader === expectedHexDirect ||
		normalizedHeader === expectedBase64;

	if (!matches) {
		throw new GhlWebhookError("Invalid webhook signature", 401, "invalid_signature");
	}
}

type ProcessGhlWebhookArgs = {
	c: Context;
	locationId: string;
	rawBody: string;
	signature?: string;
	payload: AnyRecord;
};

export async function processGhlWebhook(args: ProcessGhlWebhookArgs): Promise<{
	status: "processed" | "deduped" | "skipped";
	eventType: GhlEventType;
	contactId: string;
	eventKey: string;
	message: string;
}> {
	const { c, locationId, rawBody, signature, payload } = args;
	const controlPanelDb = getControlPanelDb(c);

	const locationLink = await controlPanelDb.query.ghlLocationLinks.findFirst({
		where: and(
			eq(ghlLocationLinks.locationId, locationId),
			eq(ghlLocationLinks.isActive, true)
		),
	});

	if (!locationLink) {
		throw new GhlWebhookError(
			`Unknown or inactive GHL location: ${locationId}`,
			404,
			"location_not_found"
		);
	}

	await verifyOptionalSignature({
		rawBody,
		signature,
		webhookSecret: locationLink.webhookSecret ?? null,
	});

	const eventType = detectGhlEventType(payload);
	const extracted = extractGhlContactPayload(payload);
	if (extracted.payloadLocationId && extracted.payloadLocationId !== locationId) {
		throw new GhlWebhookError(
			"Payload locationId does not match URL locationId",
			400,
			"location_mismatch"
		);
	}

	const eventKey = await buildGhlEventKey({
		locationId,
		contactId: extracted.contactId,
		eventType,
		payload,
	});

	const tenantDb = await getTenantDb(locationLink.organizationId, c);
	const insertedEvents = await tenantDb
		.insert(ghlSyncEvents)
		.values({
			eventKey,
			eventType,
			ghlContactId: extracted.contactId,
			email: extracted.email,
			status: "received",
			rawPayload: payload,
		})
		.onConflictDoNothing({ target: ghlSyncEvents.eventKey })
		.returning({ id: ghlSyncEvents.id });

	if (insertedEvents.length === 0) {
		return {
			status: "deduped",
			eventType,
			contactId: extracted.contactId,
			eventKey,
			message: "Duplicate event skipped",
		};
	}

	const [existingLink] = await tenantDb
		.select()
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, extracted.contactId))
		.limit(1);

	if (eventType === "delete") {
		if (!existingLink) {
			await updateEventStatus(tenantDb, eventKey, "skipped", "Unmapped delete event");
			return {
				status: "skipped",
				eventType,
				contactId: extracted.contactId,
				eventKey,
				message: "Delete skipped for unmapped contact",
			};
		}

		if (existingLink.customerProfileId) {
			await tenantDb
				.update(customerProfiles)
				.set({
					isDeleted: true,
					deletedAt: new Date(),
					deletedSource: "gohighlevel_webhook",
					updatedAt: new Date(),
				})
				.where(eq(customerProfiles.id, existingLink.customerProfileId));
		}

		await tenantDb
			.update(ghlContactLinks)
			.set({
				syncStatus: "deleted",
				lastSyncedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(ghlContactLinks.id, existingLink.id));

		await updateEventStatus(tenantDb, eventKey, "processed");
		return {
			status: "processed",
			eventType,
			contactId: extracted.contactId,
			eventKey,
			message: "Contact soft-deleted",
		};
	}

	let userRecord =
		existingLink
			? (
					await controlPanelDb
						.select()
						.from(user)
						.where(eq(user.id, existingLink.userId))
						.limit(1)
				)[0]
			: undefined;

	if (!userRecord) {
		userRecord = (
			await controlPanelDb
				.select()
				.from(user)
				.where(eq(user.email, extracted.email))
				.limit(1)
		)[0];
	}

	const now = new Date();
	if (!userRecord) {
		[userRecord] = await controlPanelDb
			.insert(user)
			.values({
				id: crypto.randomUUID(),
				name: extracted.name || extracted.email,
				email: extracted.email,
				emailVerified: true,
				image: null,
				role: null,
				banned: false,
				banReason: null,
				banExpires: null,
				createdAt: now,
				updatedAt: now,
				lastLoginAt: null,
			})
			.returning();
	}

	if (!userRecord) {
		throw new GhlWebhookError("Failed to create or resolve user record", 500, "user_resolution_failed");
	}

	await controlPanelDb
		.update(user)
		.set({
			name: extracted.name || userRecord.name,
			email: extracted.email,
			updatedAt: now,
		})
		.where(eq(user.id, userRecord.id));

	const [existingProfile] = await tenantDb
		.select()
		.from(customerProfiles)
		.where(eq(customerProfiles.userId, userRecord.id))
		.limit(1);

	let customerProfileId = existingProfile?.id;
	if (!existingProfile) {
		const [createdProfile] = await tenantDb
			.insert(customerProfiles)
			.values({
				userId: userRecord.id,
				phone: extracted.phone || null,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: customerProfiles.id });
		customerProfileId = createdProfile?.id;
	} else {
		await tenantDb
			.update(customerProfiles)
			.set({
				phone: extracted.phone || existingProfile.phone,
				isDeleted: false,
				deletedAt: null,
				deletedSource: null,
				updatedAt: now,
			})
			.where(eq(customerProfiles.id, existingProfile.id));
	}

	if (!existingLink) {
		await tenantDb.insert(ghlContactLinks).values({
			ghlContactId: extracted.contactId,
			userId: userRecord.id,
			customerProfileId: customerProfileId || null,
			syncStatus: "active",
			lastSyncedAt: now,
			createdAt: now,
			updatedAt: now,
		});
	} else {
		await tenantDb
			.update(ghlContactLinks)
			.set({
				userId: userRecord.id,
				customerProfileId: customerProfileId || existingLink.customerProfileId,
				syncStatus: "active",
				lastSyncedAt: now,
				updatedAt: now,
			})
			.where(eq(ghlContactLinks.id, existingLink.id));
	}

	await updateEventStatus(tenantDb, eventKey, "processed");

	return {
		status: "processed",
		eventType,
		contactId: extracted.contactId,
		eventKey,
		message: existingLink ? "Contact updated" : "Customer created from webhook",
	};
}

async function updateEventStatus(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	eventKey: string,
	status: string,
	errorMessage?: string
) {
	await tenantDb
		.update(ghlSyncEvents)
		.set({
			status,
			errorMessage: errorMessage ?? null,
		})
		.where(eq(ghlSyncEvents.eventKey, eventKey));
}

export async function markGhlWebhookFailed(args: {
	c: Context;
	locationId: string;
	payload: AnyRecord;
	rawBody: string;
	errorMessage: string;
	eventType?: GhlEventType;
	contactId?: string;
	email?: string;
}) {
	const { c, locationId, payload, rawBody, errorMessage, eventType, contactId, email } = args;
	const controlPanelDb = getControlPanelDb(c);
	const locationLink = await controlPanelDb.query.ghlLocationLinks.findFirst({
		where: and(
			eq(ghlLocationLinks.locationId, locationId),
			eq(ghlLocationLinks.isActive, true)
		),
	});

	if (!locationLink) {
		return;
	}

	const tenantDb = await getTenantDb(locationLink.organizationId, c);
	const fallbackContactId = contactId || normalizeString((payload as AnyRecord).id) || "unknown";
	const key = `${locationId}:${fallbackContactId}:failed:${createHash("sha256")
		.update(rawBody || JSON.stringify(payload))
		.digest("hex")}`;

	await tenantDb
		.insert(ghlSyncEvents)
		.values({
			eventKey: key,
			eventType: eventType || detectGhlEventType(payload),
			ghlContactId: fallbackContactId,
			email: email || normalizeString((payload as AnyRecord).email) || null,
			status: "failed",
			errorMessage,
			rawPayload: payload,
		})
		.onConflictDoNothing({ target: ghlSyncEvents.eventKey });
}
