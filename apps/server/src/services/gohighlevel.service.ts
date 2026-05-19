import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { user } from "@avantej-core/db/schema/auth";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { and, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { createHash } from "node:crypto";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { leadSources } from "@avantej-core/db/schema/tenant/lead-sources";
import { members } from "@avantej-core/db/schema/tenant/members";
import { createMember } from "@avantej-core/services";
import { getBetterAuth } from "@/lib/better-auth";

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
	emailIsPlaceholder: boolean;
	name?: string;
	phone?: string;
	payloadLocationId?: string;
	dynamicFields: Record<string, unknown>;
};

export const GHL_PLACEHOLDER_EMAIL_DOMAIN = "ghl.placeholder";

export function buildPlaceholderEmail(contactId: string): string {
	return `ghl-${contactId}@${GHL_PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email.endsWith(`@${GHL_PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function deriveDobFromAge(
	age: number,
	now: Date = new Date(),
): Date | null {
	if (!Number.isFinite(age) || age <= 0 || age > 150) return null;
	const year = now.getUTCFullYear() - Math.floor(age);
	return new Date(Date.UTC(year, 0, 1));
}

export function findHierarchyBranchByName(
	branches: Array<{ id: string; name: string; type: string }>,
	selectedLocation: string | null | undefined,
): string | null {
	if (!selectedLocation) return null;
	const needle = selectedLocation.trim().toLowerCase();
	if (!needle) return null;
	const match = branches.find(
		(b) => b.type === "branch" && b.name.trim().toLowerCase() === needle,
	);
	return match?.id ?? null;
}

export type GhlContactResponseData = {
	id: string | null;
	name: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone: string | null;
	id_passport: string | null;
	address_type: string | null;
	address: string | null;
	dob: string | null;
	emergency_name: string | null;
	emergency_phone: string | null;
	emergency_relationship: string | null;
	country: string | null;
	location: string | null;
	service: string | null;
	service_start_date: string | null;
	currency: string | null;
	payment_method: string | null;
	remark: string | null;
	primary_coach: string | null;
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

/**
 * α strict canonical: Avantej is source of truth for any contact that's
 * been linked once. Returns null if the webhook should proceed normally,
 * or a skip reason if it must be ignored.
 *
 * Carve-out (Phase 2): if the linked user still carries a placeholder email
 * AND the incoming payload has a real email, allow the update through so the
 * placeholder gets backfilled. Other update/delete cases on linked contacts
 * stay canonical-skipped.
 *
 * Pure function — easy to unit-test without DB.
 */
export type AlphaCanonicalSkip =
	| { skip: true; reason: "avantej-canonical" | "already-linked" }
	| { skip: false };

export function applyAlphaCanonical(args: {
	existingLink: { id: string } | null | undefined;
	eventType: GhlEventType;
	existingUserEmail?: string | null;
	incomingEmailIsPlaceholder?: boolean;
}): AlphaCanonicalSkip {
	const { existingLink, eventType, existingUserEmail, incomingEmailIsPlaceholder } = args;
	if (!existingLink) return { skip: false };
	if (eventType === "update") {
		// Carve-out: placeholder backfill — let the update through.
		if (
			isPlaceholderEmail(existingUserEmail) &&
			incomingEmailIsPlaceholder === false
		) {
			return { skip: false };
		}
		return { skip: true, reason: "avantej-canonical" };
	}
	if (eventType === "delete") {
		return { skip: true, reason: "avantej-canonical" };
	}
	if (eventType === "create") {
		// Carve-out: GHL only emits `create` events on form re-submit. Allow
		// a re-submit through when it backfills a placeholder email with a
		// real one — otherwise phone-only leads stay locked out forever.
		if (
			isPlaceholderEmail(existingUserEmail) &&
			incomingEmailIsPlaceholder === false
		) {
			return { skip: false };
		}
		return { skip: true, reason: "already-linked" };
	}
	return { skip: false }; // "custom" event type — let existing logic run
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
		normalizeString(contact?.email_update_override) ||
		normalizeString(payload.email_update_override) ||
		normalizeString(contact?.email) ||
		normalizeString(payload.email) ||
		normalizeString(payload.contact_email);
	const phone =
		normalizeString(contact?.phone_update_override) ||
		normalizeString(payload.phone_update_override) ||
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
	if (!email && !phone) {
		throw new GhlWebhookError(
			"Missing required field: email or phone",
			400,
			"missing_contact_identifier",
		);
	}

	const resolvedEmail = email || buildPlaceholderEmail(contactId);
	const emailIsPlaceholder = !email;

	const dynamicFields = removeCoreKeys(payload, contact);

	return {
		contactId,
		email: resolvedEmail,
		emailIsPlaceholder,
		name: name || undefined,
		phone: phone || undefined,
		payloadLocationId: payloadLocationId || undefined,
		dynamicFields,
	};
}

export function buildGhlResponseData(payload: AnyRecord): GhlContactResponseData {
	const contact = asRecord(payload.contact);
	const firstName =
		pickField(payload, contact, ["first_name", "firstName"]) || null;
	const lastName =
		pickField(payload, contact, ["last_name", "lastName"]) || null;
	const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
	const explicitLocation = pickField(payload, contact, ["location"]);
	const preferredBranch =
		pickField(payload, contact, ["select_preferred_branch_1"]) || "";
	const mainBranch =
		pickField(payload, contact, [
			"select_main_branch_assigned_in_contract_for_service_thailand",
		]) || "";
	const computedLocation = `${preferredBranch}${mainBranch}`.trim();
	const location = explicitLocation || computedLocation || null;

	return {
		id: pickField(payload, contact, ["id", "contactId", "contact_id"]),
		name: pickField(payload, contact, ["name"]) || fallbackName,
		first_name: firstName,
		last_name: lastName,
		email: pickField(payload, contact, [
			"email_update_override",
			"email",
			"contact_email",
		]),
		phone: pickField(payload, contact, [
			"phone_update_override",
			"phone",
			"contact_phone",
		]),
		id_passport: pickField(payload, contact, ["id_passport", "nric_no__id_no"]),
		address_type: pickField(payload, contact, ["address_type", "homework_address_indicator"]),
		address: pickField(payload, contact, ["full_address", "address"]),
		dob: pickField(payload, contact, ["dob", "date_of_birth", "dateOfBirth"]),
		emergency_name: pickField(payload, contact, ["emergency_name", "emergency_contact_name"]),
		emergency_phone: pickField(payload, contact, [
			"emergency_phone",
			"emergency_contact_no",
			"emergency_contact_phone",
		]),
		emergency_relationship: pickField(payload, contact, [
			"emergency_relationship",
			"emergency_contact_relationship",
		]),
		country: pickField(payload, contact, ["country_to_determine_branch__new", "country"]),
		location,
		service: pickField(payload, contact, ["service", "client_purchase"]),
		service_start_date: pickField(payload, contact, ["service_start_date", "commencement_date"]),
		currency: pickField(payload, contact, ["currency_picker", "currency"]),
		payment_method: pickField(payload, contact, ["payment_method"]),
		remark: pickField(payload, contact, ["remark_on_paymentpackage", "remark"]),
		primary_coach: pickField(payload, contact, ["primary_coach"]),
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
	if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
		return null;
	}
	const trimmed = String(value).trim();
	return trimmed.length > 0 ? trimmed : null;
}

function pickField(payload: AnyRecord, contact: AnyRecord | null, keys: string[]): string | null {
	for (const key of keys) {
		const contactValue = normalizeString(contact?.[key]);
		if (contactValue) {
			return contactValue;
		}
		const payloadValue = normalizeString(payload[key]);
		if (payloadValue) {
			return payloadValue;
		}
	}
	return null;
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

function isSecretMatch(expectedSecret: string, provided: string | undefined): boolean {
	if (!provided) {
		return false;
	}
	return provided.trim() === expectedSecret;
}

function extractAuthorizationToken(authorization: string | undefined): string | undefined {
	if (!authorization) {
		return undefined;
	}
	const normalized = authorization.trim();
	if (normalized.length === 0) {
		return undefined;
	}

	// Accept both "Bearer <token>" (case-insensitive) and raw token values.
	const bearerMatch = /^Bearer\s+(.+)$/i.exec(normalized);
	if (bearerMatch?.[1]) {
		const token = bearerMatch[1].trim();
		return token.length > 0 ? token : undefined;
	}

	return normalized;
}

export async function verifyGhlWebhookAuth(args: {
	rawBody: string;
	signature: string | undefined;
	authorization: string | undefined;
	headerSecret: string | undefined;
	querySecret: string | undefined;
	webhookSecret: string | null;
}): Promise<void> {
	const {
		rawBody,
		signature,
		authorization,
		headerSecret,
		querySecret,
		webhookSecret,
	} = args;
	if (!webhookSecret) {
		return;
	}

	if (signature) {
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

		const signatureMatches =
			normalizedHeader === expectedHex ||
			normalizedHeader === expectedHexDirect ||
			normalizedHeader === expectedBase64;
		if (!signatureMatches) {
			throw new GhlWebhookError("Invalid webhook signature", 401, "invalid_signature");
		}
		return;
	}

	const bearerToken = extractAuthorizationToken(authorization);
	const hasValidSharedSecret =
		isSecretMatch(webhookSecret, bearerToken) ||
		isSecretMatch(webhookSecret, headerSecret) ||
		isSecretMatch(webhookSecret, querySecret);

	if (!hasValidSharedSecret) {
		throw new GhlWebhookError(
			"Missing or invalid webhook authorization",
			401,
			"missing_webhook_auth"
		);
	}
}

type ProcessGhlWebhookArgs = {
	c: Context;
	locationId: string;
	rawBody: string;
	signature?: string;
	authorization?: string;
	headerSecret?: string;
	querySecret?: string;
	payload: AnyRecord;
};

export async function processGhlWebhook(args: ProcessGhlWebhookArgs): Promise<{
	status: "processed" | "deduped" | "skipped";
	eventType: GhlEventType;
	contactId: string;
	eventKey: string;
	message: string;
	responseData: GhlContactResponseData;
}> {
	const { c, locationId, rawBody, signature, authorization, headerSecret, querySecret, payload } =
		args;
	const controlPanelDb = getControlPanelDb(c);

	const locationLink = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.ghlLocationId, locationId),
			eq(ghlBranchLinks.isActive, true)
		),
	});

	if (!locationLink) {
		throw new GhlWebhookError(
			`Unknown or inactive GHL location: ${locationId}`,
			404,
			"location_not_found"
		);
	}

	await verifyGhlWebhookAuth({
		rawBody,
		signature,
		authorization,
		headerSecret,
		querySecret,
		webhookSecret: locationLink.webhookSecret ?? null,
	});

	const eventType = detectGhlEventType(payload);
	const extracted = extractGhlContactPayload(payload);
	const responseData = buildGhlResponseData(payload);
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
			responseData,
		};
	}

	const [existingLink] = await tenantDb
		.select()
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, extracted.contactId))
		.limit(1);

	// Pre-canonical user lookup — needed so applyAlphaCanonical can detect
	// placeholder backfill (existing user has placeholder email + real email
	// incoming → allow update through to backfill the placeholder).
	const linkedUser = existingLink
		? (
				await controlPanelDb
					.select({ email: user.email })
					.from(user)
					.where(eq(user.id, existingLink.userId))
					.limit(1)
			)[0]
		: undefined;

	// α strict canonical: ignore GHL-initiated mutations on linked contacts.
	const canonical = applyAlphaCanonical({
		existingLink,
		eventType,
		existingUserEmail: linkedUser?.email ?? null,
		incomingEmailIsPlaceholder: extracted.emailIsPlaceholder,
	});
	if (canonical.skip) {
		await updateEventStatus(tenantDb, eventKey, "skipped", canonical.reason);
		return {
			status: "skipped",
			eventType,
			contactId: extracted.contactId,
			eventKey,
			message: `Skipped (${canonical.reason})`,
			responseData,
		};
	}

	if (eventType === "delete") {
		if (!existingLink) {
			await updateEventStatus(tenantDb, eventKey, "skipped", "Unmapped delete event");
				return {
					status: "skipped",
					eventType,
					contactId: extracted.contactId,
					eventKey,
					message: "Delete skipped for unmapped contact",
					responseData,
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
			responseData,
		};
	}

	const customFields = extractCustomFieldsForProfile(payload);

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

	if (!userRecord && !extracted.emailIsPlaceholder) {
		userRecord = (
			await controlPanelDb
				.select()
				.from(user)
				.where(eq(user.email, extracted.email))
				.limit(1)
		)[0];
	}

	if (!userRecord && extracted.phone) {
		userRecord = (
			await controlPanelDb
				.select()
				.from(user)
				.where(eq(user.phone, extracted.phone))
				.limit(1)
		)[0];
	}

	const now = new Date();
	if (!userRecord) {
		const nameParts = (extracted.name || "").trim().split(/\s+/).filter(Boolean);
		[userRecord] = await controlPanelDb
			.insert(user)
			.values({
				id: crypto.randomUUID(),
				name: extracted.name || extracted.email,
				firstName: nameParts[0] || extracted.email,
				lastName: nameParts.slice(1).join(" ") || "",
				email: extracted.email,
				emailVerified: !extracted.emailIsPlaceholder,
				image: null,
				phone: extracted.phone || null,
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

	// Phase 3: detect placeholder → real email transition for backfill dispatch.
	const emailJustBackfilled =
		isPlaceholderEmail(userRecord.email) && !extracted.emailIsPlaceholder;

	// Preserve existing real email if incoming is placeholder; same for phone fallback.
	const keepExistingEmail =
		extracted.emailIsPlaceholder && !isPlaceholderEmail(userRecord.email);
	await controlPanelDb
		.update(user)
		.set({
			name: extracted.name || userRecord.name,
			email: keepExistingEmail ? userRecord.email : extracted.email,
			emailVerified: keepExistingEmail
				? userRecord.emailVerified
				: !extracted.emailIsPlaceholder
					? true
					: userRecord.emailVerified,
			phone: extracted.phone || userRecord.phone,
			updatedAt: now,
		})
		.where(eq(user.id, userRecord.id));

	const dobFromAge = customFields.age != null ? deriveDobFromAge(customFields.age, now) : null;
	const leadSourceId = await resolveLeadSourceId(tenantDb, customFields.leadAcquisitionType);
	const referrerMemberId = await resolveReferrerMemberId(
		tenantDb,
		controlPanelDb,
		customFields.referrerPhone,
	);
	const campaignId = customFields.leadOriginator || null;
	const gender = customFields.gender || null;

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
				dateOfBirth: dobFromAge,
				gender,
				leadSourceId,
				referrerMemberId,
				campaignId,
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
				dateOfBirth: dobFromAge ?? existingProfile.dateOfBirth,
				gender: gender ?? existingProfile.gender,
				leadSourceId: leadSourceId ?? existingProfile.leadSourceId,
				referrerMemberId: referrerMemberId ?? existingProfile.referrerMemberId,
				campaignId: campaignId ?? existingProfile.campaignId,
				isDeleted: false,
				deletedAt: null,
				deletedSource: null,
				updatedAt: now,
			})
			.where(eq(customerProfiles.id, existingProfile.id));
	}

	// Resolve branch node from selected_location (if provided), else fallback to link's branch.
	const branchNodeId = await resolveBranchNodeId(
		tenantDb,
		customFields.selectedLocation,
		locationLink.tenantBranchId,
	);

	// Auto-create member row (role='client') so lead becomes a usable customer immediately.
	const [existingMember] = await tenantDb
		.select({ id: members.id })
		.from(members)
		.where(eq(members.userId, userRecord.id))
		.limit(1);

	let memberJustCreated = false;
	if (!existingMember) {
		try {
			await createMember(controlPanelDb, tenantDb, {
				userId: userRecord.id,
				organizationId: locationLink.organizationId,
				role: "client",
				hierarchyScopeId: branchNodeId,
			});
			memberJustCreated = true;
		} catch (error) {
			// Best-effort: don't fail the whole webhook if member creation has a
			// transient conflict (e.g. concurrent submit). Log via event status.
			console.error("[ghl-webhook] createMember failed", error);
		}
	}

	// Phase 2 + 3: dispatch magic-link welcome email when email is real and
	// either (a) member was just created, or (b) email just transitioned from
	// placeholder to real (re-submit backfill). Stable email = no dispatch.
	if (
		(memberJustCreated || emailJustBackfilled) &&
		!extracted.emailIsPlaceholder
	) {
		await dispatchWelcomeMagicLink({
			c,
			email: extracted.email,
		});
	}

	if (!existingLink) {
		await tenantDb.insert(ghlContactLinks).values({
			ghlContactId: extracted.contactId,
			userId: userRecord.id,
			customerProfileId: customerProfileId || null,
			branchNodeId,
			ghlLocationId: locationLink.ghlLocationId,
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
				branchNodeId,
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
		responseData,
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

export type GhlCustomFields = {
	gender: string | null;
	age: number | null;
	selectedCountry: string | null;
	selectedLocation: string | null;
	primaryStaff: string | null;
	referrerPhone: string | null;
	leadAcquisitionType: string | null;
	leadOriginator: string | null;
};

export function extractCustomFieldsForProfile(
	payload: AnyRecord,
): GhlCustomFields {
	const contact = asRecord(payload.contact);
	const pick = (keys: string[]): string | null =>
		pickField(payload, contact, keys);

	const ageRaw = pick(["age"]);
	const ageNum = ageRaw ? Number.parseInt(ageRaw, 10) : Number.NaN;
	const age =
		Number.isFinite(ageNum) && ageNum > 0 && ageNum < 150 ? ageNum : null;

	return {
		gender: pick(["gender"]),
		age,
		selectedCountry: pick(["selected_country", "sys_selected_country"]),
		selectedLocation: pick(["selected_location", "sys_selected_location"]),
		primaryStaff: pick(["primary_staff", "ops_primary_staff"]),
		referrerPhone: pick(["referrer_phone"]),
		leadAcquisitionType: pick([
			"lead_acquisition_type",
			"sys_lead_acquisition_type",
		]),
		leadOriginator: pick([
			"lead_originator",
			"lead_originatator",
			"sys_lead_originator",
		]),
	};
}

async function resolveBranchNodeId(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	selectedLocation: string | null,
	fallbackBranchId: string,
): Promise<string> {
	if (!selectedLocation) return fallbackBranchId;
	const rows = await tenantDb
		.select({
			id: hierarchyNodes.id,
			name: hierarchyNodes.name,
			type: hierarchyNodes.type,
		})
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.type, "branch"));
	const matchId = findHierarchyBranchByName(rows, selectedLocation);
	return matchId ?? fallbackBranchId;
}

async function resolveLeadSourceId(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	name: string | null,
): Promise<string | null> {
	if (!name) return null;
	const trimmed = name.trim();
	if (!trimmed) return null;
	const [row] = await tenantDb
		.select({ id: leadSources.id })
		.from(leadSources)
		.where(
			and(
				sql`lower(${leadSources.name}) = lower(${trimmed})`,
				eq(leadSources.isActive, true),
			),
		)
		.limit(1);
	return row?.id ?? null;
}

async function resolveReferrerMemberId(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	controlPanelDb: ReturnType<typeof getControlPanelDb>,
	phone: string | null,
): Promise<string | null> {
	if (!phone) return null;
	const trimmed = phone.trim();
	if (!trimmed) return null;
	const [userRow] = await controlPanelDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.phone, trimmed))
		.limit(1);
	if (!userRow) return null;
	const [memberRow] = await tenantDb
		.select({ id: members.id })
		.from(members)
		.where(eq(members.userId, userRow.id))
		.limit(1);
	return memberRow?.id ?? null;
}

/**
 * Best-effort welcome magic-link dispatch. Failure here must never fail
 * the webhook — login can be re-issued by staff via the standard flow.
 */
async function dispatchWelcomeMagicLink(args: {
	c: Context;
	email: string;
}): Promise<void> {
	try {
		const auth = getBetterAuth(args.c);
		// Better-Auth signInMagicLink: generates single-use token, persists in
		// verification table, invokes the `sendMagicLink` plugin callback which
		// in turn calls sendMagicLinkEmail on our side.
		// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
		const api = (auth as any).api;
		if (typeof api?.signInMagicLink !== "function") {
			console.warn(
				"[ghl-webhook] auth.api.signInMagicLink unavailable — magic-link plugin not loaded",
			);
			return;
		}
		await api.signInMagicLink({
			body: { email: args.email },
			headers: args.c.req.raw.headers,
		});
	} catch (error) {
		console.error("[ghl-webhook] dispatchWelcomeMagicLink failed", error);
	}
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
	const locationLink = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.ghlLocationId, locationId),
			eq(ghlBranchLinks.isActive, true)
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
