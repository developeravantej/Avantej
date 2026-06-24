import { describe, expect, it } from "vitest";
import { parseDmarcPolicy, DMARC_STEPS } from "@/lib/email-dmarc";

describe("parseDmarcPolicy", () => {
	it("returns null when no _dmarc record present", () => {
		expect(
			parseDmarcPolicy([
				{ type: "TXT", name: "_resend.mail.example.com", value: "resend-verification=x" },
				{ type: "MX", name: "send.mail.example.com", value: "feedback-smtp..." },
			]),
		).toBeNull();
	});

	it("parses p=none / quarantine / reject (case-insensitive, spaced)", () => {
		expect(
			parseDmarcPolicy([{ type: "TXT", name: "_dmarc.mail.example.com", value: "v=DMARC1; p=none;" }]),
		).toBe("none");
		expect(
			parseDmarcPolicy([{ type: "txt", name: "_DMARC.mail.example.com", value: "v=DMARC1; p = quarantine; rua=mailto:x" }]),
		).toBe("quarantine");
		expect(
			parseDmarcPolicy([{ type: "TXT", name: "_dmarc.mail.example.com", value: "v=DMARC1;P=REJECT" }]),
		).toBe("reject");
	});

	it("returns null when _dmarc record has no parseable policy", () => {
		expect(
			parseDmarcPolicy([{ type: "TXT", name: "_dmarc.mail.example.com", value: "v=DMARC1;" }]),
		).toBeNull();
	});

	it("ignores non-TXT records that happen to mention _dmarc", () => {
		expect(
			parseDmarcPolicy([{ type: "CNAME", name: "_dmarc.mail.example.com", value: "p=reject" }]),
		).toBeNull();
	});

	it("DMARC_STEPS is ordered none → quarantine → reject", () => {
		expect(DMARC_STEPS.map((s) => s.policy)).toEqual(["none", "quarantine", "reject"]);
	});
});
