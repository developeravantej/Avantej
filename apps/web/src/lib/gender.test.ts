import { describe, expect, it } from "vitest";
import { normalizeGender, type Gender } from "./gender";

describe("normalizeGender", () => {
	it("lowercases canonical values", () => {
		expect(normalizeGender("Male")).toBe<Gender>("male");
		expect(normalizeGender("FEMALE")).toBe<Gender>("female");
		expect(normalizeGender("Other")).toBe<Gender>("other");
	});
	it("maps prefer-not-to-say variants", () => {
		expect(normalizeGender("Prefer not to say")).toBe<Gender>("prefer_not_to_say");
		expect(normalizeGender("prefer_not_to_say")).toBe<Gender>("prefer_not_to_say");
	});
	it("returns empty string for unknown / nullish", () => {
		expect(normalizeGender(null)).toBe("");
		expect(normalizeGender(undefined)).toBe("");
		expect(normalizeGender("banana")).toBe("");
		expect(normalizeGender("")).toBe("");
	});
});
