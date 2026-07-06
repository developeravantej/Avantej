/**
 * Unit tests for WS6 CSV import — pure parse + validation (no DB).
 */
import { describe, expect, it } from "bun:test";

import { parseCsv, parseCsvTable } from "../csv-codec";
import { previewImport } from "./engine";
import { importRefToUuid } from "./importers";

describe("parseCsv — RFC-4180", () => {
	it("parses a simple table", () => {
		expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
			["a", "b"],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("handles quoted fields with commas, quotes, and newlines", () => {
		const csv = 'name,note\n"Doe, John","says ""hi""\nline2"';
		expect(parseCsv(csv)).toEqual([
			["name", "note"],
			["Doe, John", 'says "hi"\nline2'],
		]);
	});

	it("drops fully-empty rows and handles CRLF", () => {
		expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("maps to header-keyed objects", () => {
		const { header, rows } = parseCsvTable("firstName,phone\nAhmad,+60123");
		expect(header).toEqual(["firstName", "phone"]);
		expect(rows).toEqual([{ firstName: "Ahmad", phone: "+60123" }]);
	});
});

describe("importRefToUuid — deterministic", () => {
	it("is stable for the same input", () => {
		expect(importRefToUuid("REF-001")).toBe(importRefToUuid("REF-001"));
	});
	it("differs for different inputs and is uuid-shaped", () => {
		const a = importRefToUuid("REF-001");
		const b = importRefToUuid("REF-002");
		expect(a).not.toBe(b);
		expect(a).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});
});

describe("previewImport — validation (no DB)", () => {
	it("flags missing required client fields", () => {
		// Row 1: has a name but no phone/branch (invalid). Row 2: complete.
		// (A fully-empty row would be dropped by the parser, so give row 1 content.)
		const res = previewImport(
			"clients",
			"firstName,phone,branchNodeId\nAhmad,,\nSiti,+60123,11111111-1111-1111-1111-111111111111",
		);
		expect(res.rowCount).toBe(2);
		expect(res.errorCount).toBe(1);
		expect(res.okCount).toBe(1);
		expect(res.results[0]!.errors.length).toBeGreaterThan(0);
	});

	it("validates package numeric + date fields", () => {
		const res = previewImport(
			"packages",
			"customerEmail,serviceId,creditsTotal,startsAt,expiresAt,purchaseNumber\n" +
				"a@b.my,svc,notanumber,2026-01-01,2026-12-31,P1",
		);
		expect(res.errorCount).toBe(1);
		expect(res.results[0]!.errors.join(" ")).toContain("creditsTotal");
	});

	it("accepts a valid opening-balance row", () => {
		const res = previewImport(
			"opening_balances",
			"customerEmail,points,externalRef\na@b.my,500,OB-1",
		);
		expect(res.okCount).toBe(1);
		expect(res.errorCount).toBe(0);
	});

	it("rejects a zero-point opening balance", () => {
		const res = previewImport(
			"opening_balances",
			"customerEmail,points,externalRef\na@b.my,0,OB-1",
		);
		expect(res.errorCount).toBe(1);
	});
});
