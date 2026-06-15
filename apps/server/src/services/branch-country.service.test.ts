/**
 * Branch Country Service — Unit Tests
 *
 * Pure-function tests for nameToCountryCode. resolveBranchCountryCode needs
 * a real tenant DB and lives as an integration test.
 *
 * Run: bun test src/services/branch-country.service.test.ts
 */

import { describe, expect, test } from "bun:test";
import { nameToCountryCode } from "./branch-country.service";

describe("nameToCountryCode", () => {
	test("maps full country names to ISO codes (case insensitive)", () => {
		expect(nameToCountryCode("Malaysia")).toBe("MY");
		expect(nameToCountryCode("malaysia")).toBe("MY");
		expect(nameToCountryCode("MALAYSIA")).toBe("MY");
		expect(nameToCountryCode("Singapore")).toBe("SG");
		expect(nameToCountryCode("Thailand")).toBe("TH");
		expect(nameToCountryCode("Indonesia")).toBe("ID");
		expect(nameToCountryCode("Philippines")).toBe("PH");
		expect(nameToCountryCode("Hong Kong")).toBe("HK");
		expect(nameToCountryCode("Australia")).toBe("AU");
	});

	test("accepts already-ISO 2-letter codes case-insensitively", () => {
		expect(nameToCountryCode("MY")).toBe("MY");
		expect(nameToCountryCode("my")).toBe("MY");
		expect(nameToCountryCode("sg")).toBe("SG");
		expect(nameToCountryCode("TH")).toBe("TH");
	});

	test("returns null for unknown names", () => {
		expect(nameToCountryCode("MYS")).toBe(null); // 3-letter ISO not supported
		expect(nameToCountryCode("M'sia")).toBe(null);
		expect(nameToCountryCode("FooBar")).toBe(null);
		expect(nameToCountryCode("")).toBe(null);
	});

	test("returns null for null/undefined input", () => {
		expect(nameToCountryCode(null)).toBe(null);
		expect(nameToCountryCode(undefined)).toBe(null);
	});

	test("trims whitespace", () => {
		expect(nameToCountryCode("  Malaysia  ")).toBe("MY");
		expect(nameToCountryCode("\tSingapore\n")).toBe("SG");
	});
});
