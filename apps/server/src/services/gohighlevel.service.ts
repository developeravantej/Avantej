import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { user } from "@avantej-core/db/schema/auth";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { Context } from "hono";
import { createHash } from "node:crypto";
import { accountGroups } from "@avantej-core/db/schema/tenant/account-groups";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlPendingContacts } from "@avantej-core/db/schema/tenant/ghl-pending-contacts";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { leadSources } from "@avantej-core/db/schema/tenant/lead-sources";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	createMember,
	propagateCustomerNameForward,
} from "@avantej-core/services";
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

/**
 * Resolve an inbound GHL webhook's locationId to the owning tenant + auth
 * secret. Two models (Phase G):
 *   1. Legacy per-branch — active `ghl_branch_links` row (one GHL location per
 *      Avantej branch). Carries its own webhookSecret + tenantBranchId.
 *   2. Org-shared — one GHL location per org; config lives on `organizations`.
 *      Migrating to org-shared deactivates the branch link, so without this
 *      fallback org-shared tenants 404 on every inbound webhook. tenantBranchId
 *      is null here (the branch is resolved per-contact from selected_location,
 *      falling back to the org root).
 *
 * Returns null when the location is unknown/inactive.
 */
export async function resolveWebhookLocation(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	locationId: string,
): Promise<{
	organizationId: string;
	webhookSecret: string | null;
	tenantBranchId: string | null;
} | null> {
	const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.ghlLocationId, locationId),
			eq(ghlBranchLinks.isActive, true),
		),
	});
	if (link) {
		return {
			organizationId: link.organizationId,
			webhookSecret: link.webhookSecret ?? null,
			tenantBranchId: link.tenantBranchId,
		};
	}

	const org = await controlPanelDb.query.organizations.findFirst({
		where: and(
			eq(organizations.ghlLocationId, locationId),
			eq(organizations.ghlSyncModel, "org-shared"),
		),
	});
	if (org) {
		return {
			organizationId: org.id,
			webhookSecret: org.ghlWebhookSecret ?? null,
			tenantBranchId: null,
		};
	}

	return null;
}

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
	// GHL merge-tag artifact: a missing component renders as the literal string
	// "null"/"undefined" glued onto the value (e.g. "KL Branchnull"). Strip it.
	const cleaned = selectedLocation
		.trim()
		.replace(/(null|undefined)$/i, "")
		.trim();
	if (!cleaned) return null;
	const needle = cleaned.toLowerCase();
	const branchRows = branches.filter((b) => b.type === "branch");

	// 1. exact bare branch name (the canonical designated_branch value).
	const exact = branchRows.find((b) => b.name.trim().toLowerCase() === needle);
	if (exact) return exact.id;

	// 2. composite "State - Branch" dropdown label → match the last segment.
	const SEP = " - ";
	if (needle.includes(SEP)) {
		const lastSeg = needle.split(SEP).pop()?.trim();
		if (lastSeg) {
			const seg = branchRows.find(
				(b) => b.name.trim().toLowerCase() === lastSeg,
			);
			if (seg) return seg.id;
		}
	}
	return null;
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
	const {
		existingLink,
		eventType,
		existingUserEmail,
		incomingEmailIsPlaceholder,
	} = args;
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
	payload: AnyRecord,
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
		throw new GhlWebhookError(
			"Missing required field: contact.id",
			400,
			"missing_contact_id",
		);
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

export function buildGhlResponseData(
	payload: AnyRecord,
): GhlContactResponseData {
	const contact = asRecord(payload.contact);
	const firstName =
		pickField(payload, contact, ["first_name", "firstName"]) || null;
	const lastName =
		pickField(payload, contact, ["last_name", "lastName"]) || null;
	const fallbackName =
		[firstName, lastName].filter(Boolean).join(" ").trim() || null;
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
		address_type: pickField(payload, contact, [
			"address_type",
			"homework_address_indicator",
		]),
		address: pickField(payload, contact, ["full_address", "address"]),
		dob: pickField(payload, contact, ["dob", "date_of_birth", "dateOfBirth"]),
		emergency_name: pickField(payload, contact, [
			"emergency_name",
			"emergency_contact_name",
		]),
		emergency_phone: pickField(payload, contact, [
			"emergency_phone",
			"emergency_contact_no",
			"emergency_contact_phone",
		]),
		emergency_relationship: pickField(payload, contact, [
			"emergency_relationship",
			"emergency_contact_relationship",
		]),
		country: pickField(payload, contact, [
			"country_to_determine_branch__new",
			"country",
		]),
		location,
		service: pickField(payload, contact, ["service", "client_purchase"]),
		service_start_date: pickField(payload, contact, [
			"service_start_date",
			"commencement_date",
		]),
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
	if (
		typeof value !== "string" &&
		typeof value !== "number" &&
		typeof value !== "boolean"
	) {
		return null;
	}
	const trimmed = String(value).trim();
	if (trimmed.length === 0) return null;
	// GHL merge tags resolve to literal "null" or "undefined" when the source
	// custom field is unset. Treat as absent.
	const lower = trimmed.toLowerCase();
	if (lower === "null" || lower === "undefined") return null;
	return trimmed;
}

function pickField(
	payload: AnyRecord,
	contact: AnyRecord | null,
	keys: string[],
): string | null {
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

function buildNameFromParts(
	contact: AnyRecord | null,
	payload: AnyRecord,
): string | null {
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

function removeCoreKeys(
	payload: AnyRecord,
	contact: AnyRecord | null,
): Record<string, unknown> {
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

function isSecretMatch(
	expectedSecret: string,
	provided: string | undefined,
): boolean {
	if (!provided) {
		return false;
	}
	return provided.trim() === expectedSecret;
}

function extractAuthorizationToken(
	authorization: string | undefined,
): string | undefined {
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
			throw new GhlWebhookError(
				"Invalid webhook signature",
				401,
				"invalid_signature",
			);
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
			"missing_webhook_auth",
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

/**
 * Inbound approval-gate decision (pure). Hold a contact for staff approval only
 * when the org requires it AND this is a brand-NEW contact (no existing link).
 * Linked-contact updates/backfills are never gated — α-canonical already ran and
 * a placeholder→real backfill must flow straight through.
 */
export function shouldHoldForApproval(args: {
	existingLink: unknown | null | undefined;
	requireApproval: boolean | null | undefined;
}): boolean {
	return !args.existingLink && !!args.requireApproval;
}

/**
 * Denormalized preview fields stored on a held contact for the approvals inbox
 * (pure). Placeholder emails are stored as null so the inbox shows "—" rather
 * than a synthetic ghl-*@ghl.placeholder address.
 */
export function buildPendingContactPreview(
	extracted: ExtractedGhlContactPayload,
): {
	proposedName: string | null;
	proposedEmail: string | null;
	proposedPhone: string | null;
} {
	return {
		proposedName: extracted.name ?? null,
		proposedEmail: extracted.emailIsPlaceholder ? null : extracted.email,
		proposedPhone: extracted.phone ?? null,
	};
}

export async function processGhlWebhook(args: ProcessGhlWebhookArgs): Promise<{
	status: "processed" | "deduped" | "skipped" | "pending_approval";
	eventType: GhlEventType;
	contactId: string;
	eventKey: string;
	message: string;
	responseData: GhlContactResponseData;
}> {
	const {
		c,
		locationId,
		rawBody,
		signature,
		authorization,
		headerSecret,
		querySecret,
		payload,
	} = args;
	const controlPanelDb = getControlPanelDb(c);

	const resolved = await resolveWebhookLocation(controlPanelDb, locationId);

	if (!resolved) {
		throw new GhlWebhookError(
			`Unknown or inactive GHL location: ${locationId}`,
			404,
			"location_not_found",
		);
	}

	await verifyGhlWebhookAuth({
		rawBody,
		signature,
		authorization,
		headerSecret,
		querySecret,
		webhookSecret: resolved.webhookSecret,
	});

	const eventType = detectGhlEventType(payload);
	const extracted = extractGhlContactPayload(payload);
	const responseData = buildGhlResponseData(payload);
	if (
		extracted.payloadLocationId &&
		extracted.payloadLocationId !== locationId
	) {
		throw new GhlWebhookError(
			"Payload locationId does not match URL locationId",
			400,
			"location_mismatch",
		);
	}

	const eventKey = await buildGhlEventKey({
		locationId,
		contactId: extracted.contactId,
		eventType,
		payload,
	});

	const tenantDb = await getTenantDb(resolved.organizationId, c);
	// Org-shared has no per-branch link → fall back to the org root node so an
	// unmatched lead lands org-scoped rather than with a null hierarchyScopeId.
	// Build a locationLink-shaped object so downstream code is unchanged.
	const fallbackBranchId =
		resolved.tenantBranchId ?? (await resolveOrgRootNodeId(tenantDb));
	const locationLink = {
		organizationId: resolved.organizationId,
		tenantBranchId: fallbackBranchId,
		ghlLocationId: locationId,
		webhookSecret: resolved.webhookSecret,
	};
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
			await updateEventStatus(
				tenantDb,
				eventKey,
				"skipped",
				"Unmapped delete event",
			);
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

	// ── Inbound approval gate (Phase G follow-up) ──────────────────────────
	// When the org requires approval, a brand-NEW contact is HELD for staff
	// review instead of being materialized. Linked-contact updates/backfills
	// (existingLink set) are never gated — α-canonical already ran above, and a
	// placeholder→real backfill must flow straight through. Nothing is written
	// to ghl_contact_links while pending, so live-sync dedupe/retry is intact.
	if (!existingLink) {
		const [orgRow] = await controlPanelDb
			.select({ requireApproval: organizations.ghlRequireApproval })
			.from(organizations)
			.where(eq(organizations.id, locationLink.organizationId))
			.limit(1);
		if (
			shouldHoldForApproval({
				existingLink,
				requireApproval: orgRow?.requireApproval,
			})
		) {
			const queuedFields = extractCustomFieldsForProfile(payload);
			const previewBranchNodeId = await resolveBranchNodeId(
				tenantDb,
				queuedFields.selectedLocation,
				locationLink.tenantBranchId,
				queuedFields.selectedCountry,
			);
			const preview = buildPendingContactPreview(extracted);
			await tenantDb
				.insert(ghlPendingContacts)
				.values({
					ghlContactId: extracted.contactId,
					ghlLocationId: locationLink.ghlLocationId,
					rawPayload: payload,
					...preview,
					resolvedBranchNodeId: previewBranchNodeId,
					status: "pending",
				})
				// Re-open (not ignore) on conflict: a contact re-pushed from GHL —
				// whether still pending (data refresh) or previously rejected
				// (re-submission) — re-enters the queue with the latest payload and
				// clears any prior review. Approved contacts normally never reach
				// here (they have a link → α-canonical skips them above); the
				// `where` guards that invariant so a stray event can never resurrect
				// an already-approved contact back to pending.
				.onConflictDoUpdate({
					target: ghlPendingContacts.ghlContactId,
					where: ne(ghlPendingContacts.status, "approved"),
					set: {
						ghlLocationId: locationLink.ghlLocationId,
						rawPayload: payload,
						...preview,
						resolvedBranchNodeId: previewBranchNodeId,
						status: "pending",
						rejectReason: null,
						reviewedByUserId: null,
						reviewedAt: null,
						updatedAt: new Date(),
					},
				});
			await updateEventStatus(tenantDb, eventKey, "pending");
			return {
				status: "pending_approval",
				eventType,
				contactId: extracted.contactId,
				eventKey,
				message: "Contact held for approval",
				responseData,
			};
		}
	}

	return await materializeContactFromWebhook({
		c,
		controlPanelDb,
		tenantDb,
		payload,
		extracted,
		existingLink,
		locationLink,
		eventKey,
		eventType,
		responseData,
	});
}

/**
 * Materializes an inbound GHL contact into Avantej entities (user +
 * customer_profile + member + ghl_contact_link), dispatching a welcome
 * magic-link when appropriate. Extracted from processGhlWebhook so the
 * approval-gate path can replay it verbatim on approve. Handles both the
 * create and placeholder-backfill update branches, plus the shared-email
 * dependent path (delegated to processDependentInGroup).
 */
async function materializeContactFromWebhook(args: {
	c: Context;
	controlPanelDb: ReturnType<typeof getControlPanelDb>;
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>;
	payload: AnyRecord;
	extracted: ExtractedGhlContactPayload;
	existingLink: typeof ghlContactLinks.$inferSelect | undefined;
	locationLink: {
		organizationId: string;
		tenantBranchId: string;
		ghlLocationId: string;
	};
	eventKey: string;
	eventType: GhlEventType;
	responseData: GhlContactResponseData;
}): Promise<{
	status: "processed";
	eventType: GhlEventType;
	contactId: string;
	eventKey: string;
	message: string;
	responseData: GhlContactResponseData;
}> {
	const {
		c,
		controlPanelDb,
		tenantDb,
		payload,
		extracted,
		existingLink,
		locationLink,
		eventKey,
		eventType,
		responseData,
	} = args;

	const customFields = extractCustomFieldsForProfile(payload);

	let userRecord = existingLink
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

	// Phase 4 — shared-email collision detection.
	//
	// If we matched an existing user (by email or phone) AND that user is
	// already linked to a DIFFERENT GHL contact, this is two distinct
	// customers sharing one inbox (family / friend registering on behalf).
	// Route the second registration into an account_group as a dependent
	// (no `user` row, no magic-link dispatch) so the unique constraints on
	// user.email and ghl_contact_links.customer_profile_id don't trip.
	if (userRecord && !existingLink) {
		const [otherLink] = await tenantDb
			.select({
				id: ghlContactLinks.id,
				ghlContactId: ghlContactLinks.ghlContactId,
			})
			.from(ghlContactLinks)
			.where(eq(ghlContactLinks.userId, userRecord.id))
			.limit(1);

		if (otherLink && otherLink.ghlContactId !== extracted.contactId) {
			return await processDependentInGroup({
				tenantDb,
				locationLink,
				extracted,
				customFields,
				payload,
				eventKey,
				eventType,
				responseData,
				primaryUserId: userRecord.id,
				now,
			});
		}
	}

	if (!userRecord) {
		const nameParts = (extracted.name || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
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
		throw new GhlWebhookError(
			"Failed to create or resolve user record",
			500,
			"user_resolution_failed",
		);
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
			// Single write site: the create branch always runs this UPDATE right
			// after the INSERT, so fresh users still get the passport here.
			idPassportNo: customFields.idPassport ?? userRecord.idPassportNo,
			updatedAt: now,
		})
		.where(eq(user.id, userRecord.id));

	// Keep denormalized customer_name snapshots in sync when GHL changes the name.
	// Best-effort: a failure here must not abort the webhook; the daily refresh
	// cron heals any miss.
	await propagateCustomerNameForward(
		tenantDb,
		userRecord.id,
		extracted.name || userRecord.name,
	).catch(() => {});

	const dobFromAge =
		customFields.age != null ? deriveDobFromAge(customFields.age, now) : null;
	// Prefer an explicit DOB from GHL over the age-derived approximation.
	const explicitDob = customFields.dateOfBirth
		? (() => {
				const d = new Date(customFields.dateOfBirth as string);
				return Number.isNaN(d.getTime()) ? null : d;
			})()
		: null;
	const effectiveDob = explicitDob ?? dobFromAge;
	const leadSourceId = await resolveLeadSourceId(
		tenantDb,
		customFields.leadAcquisitionType,
	);
	const referrerMemberId = await resolveReferrerMemberId(
		tenantDb,
		controlPanelDb,
		customFields.referrerPhone,
	);
	const primaryStaffMemberId = await resolvePrimaryStaffMemberId({
		tenantDb,
		controlPanelDb,
		candidateGhlUserIds: [
			customFields.primaryStaffGhlUserId,
			customFields.assignedGhlUserId,
		],
		primaryStaffName: customFields.primaryStaff,
	});
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
				dateOfBirth: effectiveDob,
				gender,
				leadSourceId,
				referrerMemberId,
				primaryStaffMemberId,
				campaignId,
				leadAcquisitionType: customFields.leadAcquisitionType,
				emergencyContactName: customFields.emergencyContactName,
				emergencyContactPhone: customFields.emergencyContactPhone,
				address: customFields.address,
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
				dateOfBirth: effectiveDob ?? existingProfile.dateOfBirth,
				gender: gender ?? existingProfile.gender,
				leadSourceId: leadSourceId ?? existingProfile.leadSourceId,
				referrerMemberId: referrerMemberId ?? existingProfile.referrerMemberId,
				primaryStaffMemberId:
					primaryStaffMemberId ?? existingProfile.primaryStaffMemberId,
				campaignId: campaignId ?? existingProfile.campaignId,
				leadAcquisitionType:
					customFields.leadAcquisitionType ??
					existingProfile.leadAcquisitionType,
				emergencyContactName:
					customFields.emergencyContactName ??
					existingProfile.emergencyContactName,
				emergencyContactPhone:
					customFields.emergencyContactPhone ??
					existingProfile.emergencyContactPhone,
				address: customFields.address ?? existingProfile.address,
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
		customFields.selectedCountry,
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

/**
 * Approve a held GHL contact: replay its stored webhook body through the
 * normal materialize path (creating the user/profile/member/link exactly as an
 * ungated sync would), then mark the pending row approved. The deterministic
 * eventKey matches the original inbound event, so its ghl_sync_events row flips
 * from "pending" to "processed".
 */
export async function approvePendingGhlContact(args: {
	c: Context;
	controlPanelDb: ReturnType<typeof getControlPanelDb>;
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>;
	organizationId: string;
	pending: typeof ghlPendingContacts.$inferSelect;
	reviewedByUserId: string;
}): Promise<
	| { status: "approved"; contactId: string; message: string }
	| { status: "already_reviewed"; contactId: string }
> {
	const {
		c,
		controlPanelDb,
		tenantDb,
		organizationId,
		pending,
		reviewedByUserId,
	} = args;
	const payload = pending.rawPayload as AnyRecord;
	const eventType = detectGhlEventType(payload);
	const extracted = extractGhlContactPayload(payload);
	const responseData = buildGhlResponseData(payload);
	const eventKey = await buildGhlEventKey({
		locationId: pending.ghlLocationId,
		contactId: extracted.contactId,
		eventType,
		payload,
	});

	// Re-resolve the location's true owner and verify it matches the caller's
	// tenant before mutating anything — defense in depth against a mismatched
	// organizationId (the location's org is the authoritative source of truth).
	const resolved = await resolveWebhookLocation(
		controlPanelDb,
		pending.ghlLocationId,
	);
	if (resolved && resolved.organizationId !== organizationId) {
		throw new GhlWebhookError(
			"Pending contact location belongs to a different organization",
			403,
			"org_mismatch",
		);
	}

	// Atomic claim: flip pending→approved only if it is STILL pending. A second
	// concurrent approve (or an approve racing a reject) updates 0 rows and is
	// reported as already-reviewed, so materialize runs at most once.
	const claimed = await tenantDb
		.update(ghlPendingContacts)
		.set({
			status: "approved",
			reviewedByUserId,
			reviewedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(ghlPendingContacts.id, pending.id),
				eq(ghlPendingContacts.status, "pending"),
			),
		)
		.returning({ id: ghlPendingContacts.id });
	if (claimed.length === 0) {
		return { status: "already_reviewed", contactId: pending.ghlContactId };
	}

	const fallbackBranchId =
		resolved?.tenantBranchId ?? (await resolveOrgRootNodeId(tenantDb));
	const locationLink = {
		organizationId,
		tenantBranchId: fallbackBranchId,
		ghlLocationId: pending.ghlLocationId,
	};

	// A contact could have been created by another path since it was queued —
	// re-check the link so materialize takes its update branch instead of
	// double-inserting.
	const [existingLink] = await tenantDb
		.select()
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, extracted.contactId))
		.limit(1);

	try {
		await materializeContactFromWebhook({
			c,
			controlPanelDb,
			tenantDb,
			payload,
			extracted,
			existingLink: existingLink ?? undefined,
			locationLink,
			eventKey,
			eventType,
			responseData,
		});
	} catch (error) {
		// Materialize failed after we claimed the row — revert to pending so the
		// contact stays visible in the queue for a retry rather than vanishing as
		// "approved" with no member behind it.
		await tenantDb
			.update(ghlPendingContacts)
			.set({
				status: "pending",
				reviewedByUserId: null,
				reviewedAt: null,
				updatedAt: new Date(),
			})
			.where(eq(ghlPendingContacts.id, pending.id));
		throw error;
	}

	return {
		status: "approved",
		contactId: extracted.contactId,
		message: "Contact approved and created",
	};
}

/**
 * Reject a held GHL contact: mark the pending row rejected (kept for audit) and
 * flip the original ghl_sync_events row to "rejected" so it no longer looks
 * stuck in "pending". No Avantej entities are created.
 */
export async function rejectPendingGhlContact(args: {
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>;
	pending: typeof ghlPendingContacts.$inferSelect;
	reviewedByUserId: string;
	reason?: string | null;
}): Promise<
	| { status: "rejected"; contactId: string }
	| { status: "already_reviewed"; contactId: string }
> {
	const { tenantDb, pending, reviewedByUserId, reason } = args;
	const payload = pending.rawPayload as AnyRecord;
	const eventType = detectGhlEventType(payload);
	const eventKey = await buildGhlEventKey({
		locationId: pending.ghlLocationId,
		contactId: pending.ghlContactId,
		eventType,
		payload,
	});

	// Atomic: claim the row (pending→rejected only if still pending) and flip the
	// sync event in one transaction, so the pending row and its audit event never
	// diverge. A concurrent approve/reject loses the claim → already-reviewed.
	return await tenantDb.transaction(async (tx) => {
		const claimed = await tx
			.update(ghlPendingContacts)
			.set({
				status: "rejected",
				rejectReason: reason ?? null,
				reviewedByUserId,
				reviewedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(ghlPendingContacts.id, pending.id),
					eq(ghlPendingContacts.status, "pending"),
				),
			)
			.returning({ id: ghlPendingContacts.id });
		if (claimed.length === 0) {
			return {
				status: "already_reviewed" as const,
				contactId: pending.ghlContactId,
			};
		}
		await tx
			.update(ghlSyncEvents)
			.set({ status: "rejected", errorMessage: reason ?? null })
			.where(eq(ghlSyncEvents.eventKey, eventKey));
		return { status: "rejected" as const, contactId: pending.ghlContactId };
	});
}

/**
 * Phase 4 — shared-email dependent path.
 *
 * Invoked when an incoming GHL contact shares an email with an existing
 * Avantej user who already has a different ghl_contact_link. Creates an
 * `account_group` (or reuses one if the primary already has it) and inserts
 * a dependent `customer_profile` with `user_id = NULL` + the group id. The
 * new ghl_contact_link points at the dependent profile, leaving the primary
 * user untouched.
 *
 * Dispatching a magic-link here would be wrong (no user row to sign in),
 * so it's skipped.
 */
async function processDependentInGroup(args: {
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>;
	locationLink: {
		organizationId: string;
		tenantBranchId: string;
		ghlLocationId: string;
	};
	extracted: ExtractedGhlContactPayload;
	customFields: GhlCustomFields;
	payload: AnyRecord;
	eventKey: string;
	eventType: GhlEventType;
	responseData: GhlContactResponseData;
	primaryUserId: string;
	now: Date;
}): Promise<{
	status: "processed";
	eventType: GhlEventType;
	contactId: string;
	eventKey: string;
	message: string;
	responseData: GhlContactResponseData;
}> {
	const {
		tenantDb,
		locationLink,
		extracted,
		customFields,
		eventKey,
		eventType,
		responseData,
		primaryUserId,
		now,
	} = args;

	// Find-or-create account group keyed on the primary's user id.
	let [group] = await tenantDb
		.select({ id: accountGroups.id })
		.from(accountGroups)
		.where(eq(accountGroups.primaryUserId, primaryUserId))
		.limit(1);

	if (!group) {
		[group] = await tenantDb
			.insert(accountGroups)
			.values({
				primaryUserId,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: accountGroups.id });
	}

	if (!group) {
		throw new GhlWebhookError(
			"Failed to create or resolve account group",
			500,
			"account_group_resolution_failed",
		);
	}

	const dobFromAge =
		customFields.age != null ? deriveDobFromAge(customFields.age, now) : null;
	const leadSourceId = await resolveLeadSourceId(
		tenantDb,
		customFields.leadAcquisitionType,
	);
	const campaignId = customFields.leadOriginator || null;
	const gender = customFields.gender || null;

	// Insert dependent customer_profile (user_id = NULL by design).
	// v1: primary_staff is intentionally NOT resolved on the shared-email
	// dependent path (would require threading controlPanelDb here for name
	// matching). Dependents get primary_staff_member_id = null; the raw name
	// remains in the archived ghl_sync_events.rawPayload. Revisit if the
	// business needs coach attribution on family/shared-inbox dependents.
	const [dependentProfile] = await tenantDb
		.insert(customerProfiles)
		.values({
			userId: null,
			accountGroupId: group.id,
			phone: extracted.phone || null,
			dateOfBirth: dobFromAge,
			gender,
			leadSourceId,
			campaignId,
			createdAt: now,
			updatedAt: now,
		})
		.returning({ id: customerProfiles.id });

	if (!dependentProfile) {
		throw new GhlWebhookError(
			"Failed to create dependent customer profile",
			500,
			"dependent_profile_failed",
		);
	}

	const branchNodeId = await resolveBranchNodeId(
		tenantDb,
		customFields.selectedLocation,
		locationLink.tenantBranchId,
		customFields.selectedCountry,
	);

	// Dependent links never carry a user_id (the primary keeps theirs).
	// Better-Auth signInMagicLink dispatch is skipped — there is no user row
	// for the dependent to sign in as.
	await tenantDb.insert(ghlContactLinks).values({
		ghlContactId: extracted.contactId,
		userId: primaryUserId,
		customerProfileId: dependentProfile.id,
		branchNodeId,
		ghlLocationId: locationLink.ghlLocationId,
		syncStatus: "active",
		lastSyncedAt: now,
		createdAt: now,
		updatedAt: now,
	});

	await updateEventStatus(tenantDb, eventKey, "processed");

	return {
		status: "processed",
		eventType,
		contactId: extracted.contactId,
		eventKey,
		message: "Dependent added to existing account group",
		responseData,
	};
}

async function updateEventStatus(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	eventKey: string,
	status: string,
	errorMessage?: string,
) {
	await tenantDb
		.update(ghlSyncEvents)
		.set({
			status,
			errorMessage: errorMessage ?? null,
		})
		.where(eq(ghlSyncEvents.eventKey, eventKey));
}

const GENDER_CANON: Record<string, string> = {
	male: "male",
	m: "male",
	female: "female",
	f: "female",
	other: "other",
	prefer_not_to_say: "prefer_not_to_say",
	"prefer not to say": "prefer_not_to_say",
};

function normalizeGenderValue(value: string | null): string | null {
	if (!value) return null;
	return GENDER_CANON[value.trim().toLowerCase()] ?? null;
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
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	address: string | null;
	dateOfBirth: string | null; // ISO date string as provided by GHL
	idPassport: string | null;
	// Explicit coach GHL user id (recommended deterministic field) — highest priority.
	primaryStaffGhlUserId: string | null;
	// GHL contact owner (a GHL user id) — secondary deterministic fallback.
	assignedGhlUserId: string | null;
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
		gender: normalizeGenderValue(pick(["gender"])),
		age,
		selectedCountry: pick(["selected_country", "designated_country"]),
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
		emergencyContactName: pick(["emergency_name", "emergency_contact_name"]),
		emergencyContactPhone: pick([
			"emergency_phone",
			"emergency_contact_no",
			"emergency_contact_phone",
		]),
		address: pick(["full_address", "address"]),
		dateOfBirth: pick(["dob", "date_of_birth", "dateOfBirth"]),
		idPassport: pick(["id_passport", "nric_no__id_no"]),
		primaryStaffGhlUserId: pick([
			"primary_staff_ghl_user_id",
			"primary_staff_id",
		]),
		assignedGhlUserId: pick(["assigned_to", "assignedTo"]),
	};
}

/**
 * Org-shared fallback: the root hierarchy node (parent_id IS NULL) — used as
 * the member's hierarchyScopeId when an inbound lead has no resolvable branch
 * and there is no per-branch link to fall back to. Org-scoped, not misattributed
 * to an arbitrary branch.
 */
async function resolveOrgRootNodeId(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
): Promise<string> {
	const [root] = await tenantDb
		.select({ id: hierarchyNodes.id })
		.from(hierarchyNodes)
		.where(sql`${hierarchyNodes.parentId} IS NULL`)
		.orderBy(hierarchyNodes.createdAt)
		.limit(1);
	if (!root) {
		throw new GhlWebhookError(
			"Tenant has no root hierarchy node",
			500,
			"no_root_node",
		);
	}
	return root.id;
}

async function resolveBranchNodeId(
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>,
	selectedLocation: string | null,
	fallbackBranchId: string,
	selectedCountry?: string | null,
): Promise<string> {
	if (!selectedLocation) return fallbackBranchId;

	// Country-scope: when a country name is supplied and resolves to a country
	// node, restrict the branch search to that country's subtree first — this
	// disambiguates same-named branches across countries. Any miss falls
	// through to the unscoped lookup, so single-country tenants and payloads
	// without selected_country behave exactly as before (no regression).
	if (selectedCountry?.trim()) {
		const [country] = await tenantDb
			.select({ id: hierarchyNodes.id })
			.from(hierarchyNodes)
			.where(
				and(
					eq(hierarchyNodes.type, "country"),
					sql`lower(trim(${hierarchyNodes.name})) = lower(trim(${selectedCountry}))`,
				),
			)
			.limit(1);
		if (country) {
			const scoped = await tenantDb
				.select({
					id: hierarchyNodes.id,
					name: hierarchyNodes.name,
					type: hierarchyNodes.type,
				})
				.from(hierarchyNodes)
				.where(
					and(
						eq(hierarchyNodes.type, "branch"),
						eq(hierarchyNodes.countryNodeId, country.id),
					),
				);
			const scopedMatch = findHierarchyBranchByName(scoped, selectedLocation);
			if (scopedMatch) return scopedMatch;
		}
	}

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
 * Pure: pick the member whose name uniquely matches the GHL `primary_staff`
 * string (case-insensitive, trimmed). Returns the member id only on an
 * unambiguous single match — ambiguous (≥2) or no match → null, so we never
 * guess which coach a lead belongs to. Exported for unit testing.
 */
export function matchStaffByName(
	staff: Array<{ memberId: string; name: string }>,
	rawName: string | null | undefined,
): string | null {
	if (!rawName) return null;
	const needle = rawName.trim().toLowerCase();
	if (!needle) return null;
	const matches = staff.filter((s) => s.name.trim().toLowerCase() === needle);
	const [only] = matches;
	return matches.length === 1 && only ? only.memberId : null;
}

/**
 * Resolve the GHL lead's `primary_staff` to an Avantej member, in priority order:
 *   1. GHL native assigned-user id (contact owner) → ghl_user_links → member.
 *   2. Unique name match of primary_staff against active synced staff.
 * Returns null (and logs) when unresolved — the raw name stays in the archived
 * rawPayload and primary_staff_member_id is left null rather than guessed.
 */
async function resolvePrimaryStaffMemberId(args: {
	tenantDb: Awaited<ReturnType<typeof getTenantDb>>;
	controlPanelDb: ReturnType<typeof getControlPanelDb>;
	// GHL user-id candidates tried in priority order (e.g. the explicit
	// primary_staff_ghl_user_id field first, then the contact's assigned owner).
	candidateGhlUserIds: Array<string | null>;
	primaryStaffName: string | null;
}): Promise<string | null> {
	const { tenantDb, controlPanelDb, candidateGhlUserIds, primaryStaffName } =
		args;

	// 0. Exact match against an Avantej-owned dropdown label. When Avantej manages
	// the GHL "Primary Staff" dropdown, primary_staff IS the unique label we
	// stored on ghl_user_links — resolve it directly (handles disambiguated
	// labels like "Alex Tan (KL)" that a plain name match would miss).
	const labelNeedle = primaryStaffName?.trim();
	if (labelNeedle) {
		const [byLabel] = await tenantDb
			.select({ memberId: ghlUserLinks.memberId })
			.from(ghlUserLinks)
			.innerJoin(members, eq(members.id, ghlUserLinks.memberId))
			.where(
				and(
					eq(ghlUserLinks.primaryStaffOptionLabel, labelNeedle),
					eq(ghlUserLinks.syncStatus, "active"),
					eq(members.status, "active"),
				),
			)
			.limit(1);
		if (byLabel?.memberId) return byLabel.memberId;
	}

	// 1. Deterministic: a GHL user id → ghl_user_links → member, tried in order.
	// Require BOTH the sync link AND the member to be active — never assign a
	// lead to a deactivated/suspended coach who still has a stale sync row.
	for (const ghlUserId of candidateGhlUserIds) {
		if (!ghlUserId) continue;
		const [link] = await tenantDb
			.select({ memberId: ghlUserLinks.memberId })
			.from(ghlUserLinks)
			.innerJoin(members, eq(members.id, ghlUserLinks.memberId))
			.where(
				and(
					eq(ghlUserLinks.ghlUserId, ghlUserId),
					eq(ghlUserLinks.syncStatus, "active"),
					eq(members.status, "active"),
				),
			)
			.limit(1);
		if (link?.memberId) return link.memberId;
	}

	if (!primaryStaffName || !primaryStaffName.trim()) return null;

	// 2. Name fallback against active synced staff (any role: admin/staff/trainer),
	// excluding deactivated/suspended members.
	const links = await tenantDb
		.select({ memberId: ghlUserLinks.memberId, userId: ghlUserLinks.userId })
		.from(ghlUserLinks)
		.innerJoin(members, eq(members.id, ghlUserLinks.memberId))
		.where(
			and(eq(ghlUserLinks.syncStatus, "active"), eq(members.status, "active")),
		);
	if (links.length === 0) return null;

	const userRows = await controlPanelDb
		.select({
			id: user.id,
			name: user.name,
			firstName: user.firstName,
			lastName: user.lastName,
		})
		.from(user)
		.where(
			inArray(
				user.id,
				links.map((l) => l.userId),
			),
		);
	const nameByUserId = new Map(
		userRows.map((u) => [
			u.id,
			(u.name && u.name.trim()) ||
				`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
		]),
	);
	const staff = links
		.map((l) => ({
			memberId: l.memberId,
			name: nameByUserId.get(l.userId) ?? "",
		}))
		.filter((s) => s.name !== "");

	const matched = matchStaffByName(staff, primaryStaffName);
	if (!matched) {
		console.warn(
			`[ghl-webhook] primary_staff unresolved: "${primaryStaffName}" (no unique synced-staff match)`,
		);
	}
	return matched;
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
	const {
		c,
		locationId,
		payload,
		rawBody,
		errorMessage,
		eventType,
		contactId,
		email,
	} = args;
	const controlPanelDb = getControlPanelDb(c);
	const resolved = await resolveWebhookLocation(controlPanelDb, locationId);

	if (!resolved) {
		return;
	}

	const tenantDb = await getTenantDb(resolved.organizationId, c);
	const fallbackContactId =
		contactId || normalizeString((payload as AnyRecord).id) || "unknown";
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
