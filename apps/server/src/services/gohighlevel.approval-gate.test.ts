import { describe, expect, test } from "bun:test";
import {
	buildPendingContactPreview,
	extractGhlContactPayload,
	shouldHoldForApproval,
} from "./gohighlevel.service";

describe("shouldHoldForApproval (inbound approval gate)", () => {
	test("holds a brand-new contact when the org requires approval", () => {
		expect(
			shouldHoldForApproval({ existingLink: undefined, requireApproval: true }),
		).toBe(true);
	});

	test("does NOT hold a linked contact even when approval is required", () => {
		// Linked-contact updates/backfills must flow straight through — gating
		// them would break α-canonical and placeholder→real email backfill.
		expect(
			shouldHoldForApproval({
				existingLink: { id: "link_1" },
				requireApproval: true,
			}),
		).toBe(false);
	});

	test("does NOT hold when the gate is off (instant-sync regression)", () => {
		expect(
			shouldHoldForApproval({
				existingLink: undefined,
				requireApproval: false,
			}),
		).toBe(false);
	});

	test("treats null/undefined requireApproval as off", () => {
		expect(
			shouldHoldForApproval({ existingLink: undefined, requireApproval: null }),
		).toBe(false);
		expect(
			shouldHoldForApproval({
				existingLink: undefined,
				requireApproval: undefined,
			}),
		).toBe(false);
	});
});

describe("buildPendingContactPreview", () => {
	test("keeps a real email and passes name/phone through", () => {
		const extracted = extractGhlContactPayload({
			contact: {
				id: "ghl_1",
				name: "Ahmad Firdaus",
				email: "member@test.my",
				phone: "+60123456789",
			},
		});
		expect(buildPendingContactPreview(extracted)).toEqual({
			proposedName: "Ahmad Firdaus",
			proposedEmail: "member@test.my",
			proposedPhone: "+60123456789",
		});
	});

	test("stores a synthesized placeholder email as null", () => {
		const extracted = extractGhlContactPayload({
			contact: { id: "ghl_2", name: "Phone Only", phone: "+60169000001" },
		});
		// phone-only contact → placeholder email synthesized → preview email null.
		expect(extracted.emailIsPlaceholder).toBe(true);
		const preview = buildPendingContactPreview(extracted);
		expect(preview.proposedEmail).toBeNull();
		expect(preview.proposedPhone).toBe("+60169000001");
	});
});
