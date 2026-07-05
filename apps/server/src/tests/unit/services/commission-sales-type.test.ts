import { describe, test, expect } from "bun:test";
import { selectTracksBySalesType } from "@avantej-core/services/commission-calculator.service";

/**
 * UAT §12 — renewal-vs-new-sale track selection (pure logic).
 *
 * Rule: a track scoped to the matching sale type wins; "any" tracks apply only
 * when no sale-type-specific track is configured. This keeps pre-§12 tenants
 * (all "any") unchanged and prevents an "any" track from double-paying next to
 * a specific one.
 */
type T = { id: string; salesType: "new" | "renewal" | "any" };

const make = (id: string, salesType: T["salesType"]): T => ({ id, salesType });

describe("selectTracksBySalesType", () => {
	test("all 'any' tracks → returned for both new and renewal (backward compatible)", () => {
		const tracks = [make("a", "any"), make("b", "any")];
		expect(selectTracksBySalesType(tracks, false).map((t) => t.id)).toEqual([
			"a",
			"b",
		]);
		expect(selectTracksBySalesType(tracks, true).map((t) => t.id)).toEqual([
			"a",
			"b",
		]);
	});

	test("new sale prefers the 'new' track over 'any'", () => {
		const tracks = [make("anyT", "any"), make("newT", "new")];
		expect(selectTracksBySalesType(tracks, false).map((t) => t.id)).toEqual([
			"newT",
		]);
	});

	test("renewal prefers the 'renewal' track over 'any'", () => {
		const tracks = [make("anyT", "any"), make("renewT", "renewal")];
		expect(selectTracksBySalesType(tracks, true).map((t) => t.id)).toEqual([
			"renewT",
		]);
	});

	test("new sale does NOT pick a renewal-only track — falls back to 'any'", () => {
		const tracks = [make("renewT", "renewal"), make("anyT", "any")];
		expect(selectTracksBySalesType(tracks, false).map((t) => t.id)).toEqual([
			"anyT",
		]);
	});

	test("renewal with only a 'new' track configured → falls back to 'any'", () => {
		const tracks = [make("newT", "new"), make("anyT", "any")];
		expect(selectTracksBySalesType(tracks, true).map((t) => t.id)).toEqual([
			"anyT",
		]);
	});

	test("no matching track and no 'any' → empty (no commission fires)", () => {
		const tracks = [make("newT", "new")];
		expect(selectTracksBySalesType(tracks, true)).toEqual([]);
	});

	test("does not mix 'any' with a specific match (no double-pay)", () => {
		const tracks = [
			make("any1", "any"),
			make("new1", "new"),
			make("new2", "new"),
		];
		const got = selectTracksBySalesType(tracks, false).map((t) => t.id);
		expect(got).toEqual(["new1", "new2"]);
		expect(got).not.toContain("any1");
	});
});
