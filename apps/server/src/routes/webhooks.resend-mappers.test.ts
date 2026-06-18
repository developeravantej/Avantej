import { describe, test, expect } from "bun:test";
import {
	mapResendEventToLogStatus,
	mapResendDomainStatus,
} from "./webhooks.routes";

describe("mapResendEventToLogStatus", () => {
	const cases: Array<[string, string | null]> = [
		["email.sent", "sent"],
		["email.delivered", "delivered"],
		["email.delivery_delayed", "queued"],
		["email.bounced", "bounced"],
		["email.complained", "complained"],
		["email.opened", "opened"],
		["email.clicked", "clicked"],
		["email.failed", "failed"],
		["email.other", null],
		["domain.created", null],
		["", null],
	];

	for (const [eventType, expected] of cases) {
		test(`${eventType || "<empty>"} → ${expected}`, () => {
			expect(mapResendEventToLogStatus(eventType)).toEqual(expected as never);
		});
	}
});

describe("mapResendDomainStatus", () => {
	const cases: Array<[string | undefined, string | null]> = [
		["verified", "verified"],
		["failed", "failed"],
		["temporary_failure", "failed"],
		["pending", "pending"],
		["not_started", "pending"],
		["something_unknown", "verifying"],
		["", null],
		[undefined, null],
	];

	for (const [status, expected] of cases) {
		test(`${status === undefined ? "<undefined>" : status || "<empty>"} → ${expected}`, () => {
			expect(mapResendDomainStatus(status)).toEqual(expected as never);
		});
	}
});
