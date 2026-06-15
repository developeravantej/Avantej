/**
 * Tenant Provisioning Service — Unit Tests (Plan E E.7).
 *
 * The full provisioning flow (Neon project create → migrate → seed RBAC →
 * invite → email) hard-imports its IO surface and is covered by integration
 * specs. This file pins the parts a wrong value would silently break:
 *
 *   - slugify / validateSlug: the slug becomes the Neon project name, the org
 *     uniqueness key, and the accept-invitation URL. A bad slug means a
 *     collision or a broken isolation boundary.
 *   - provisionTenant's input guards, which run BEFORE any IO — verified to
 *     reject without ever touching the control-panel DB.
 *
 * No mock.module: the guard tests use a controlPanelDb stub that throws if
 * queried, proving early rejection rather than mocking the IO chain.
 *
 * Run: bun test src/services/tenant-provisioning.service.test.ts
 */

import { describe, expect, it } from "bun:test";
import {
	provisionTenant,
	slugify,
	validateSlug,
} from "./tenant-provisioning.service";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
	it("lowercases and hyphenates spaces", () => {
		expect(slugify("Hello World")).toBe("hello-world");
		expect(slugify("UPPER")).toBe("upper");
	});

	it("trims surrounding whitespace", () => {
		expect(slugify("  Trim Me  ")).toBe("trim-me");
	});

	it("strips punctuation/symbols", () => {
		expect(slugify("Special!@#$%Chars")).toBe("specialchars");
	});

	it("collapses runs of spaces and hyphens into a single hyphen", () => {
		expect(slugify("multiple   spaces")).toBe("multiple-spaces");
		expect(slugify("already-hyphen--collapse")).toBe("already-hyphen-collapse");
	});

	it("strips leading and trailing hyphens", () => {
		expect(slugify("-leading-and-trailing-")).toBe("leading-and-trailing");
	});

	it("preserves digits", () => {
		expect(slugify("Gym 24 Hours")).toBe("gym-24-hours");
	});

	it("drops non-ASCII letters (no unicode \\w) — 'Café X' becomes 'caf-x'", () => {
		// Documents a real limitation: accented characters are stripped, not
		// transliterated. A latin-1 business name loses those letters.
		expect(slugify("Café X")).toBe("caf-x");
	});

	it("keeps underscores (they match \\w) even though validateSlug rejects them", () => {
		// IMPORTANT interaction: slugify lets '_' through, but validateSlug's
		// charset is [a-z0-9-] only — so a slug with underscores survives slugify
		// and is then rejected downstream. Pinned so the mismatch is visible.
		expect(slugify("a_b_c")).toBe("a_b_c");
		expect(validateSlug(slugify("a_b_c"))).toBe(false);
	});

	it("returns empty string for input that is all punctuation", () => {
		expect(slugify("!!!")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// validateSlug
// ---------------------------------------------------------------------------

describe("validateSlug", () => {
	it("accepts lowercase letters, digits, and hyphens within length bounds", () => {
		expect(validateSlug("abc")).toBe(true);
		expect(validateSlug("gym-24-hours")).toBe(true);
		expect(validateSlug("a1b2c3")).toBe(true);
	});

	it("enforces the 3-character minimum", () => {
		expect(validateSlug("ab")).toBe(false);
		expect(validateSlug("a")).toBe(false);
		expect(validateSlug("")).toBe(false);
	});

	it("enforces the 64-character maximum", () => {
		expect(validateSlug("a".repeat(64))).toBe(true);
		expect(validateSlug("a".repeat(65))).toBe(false);
	});

	it("rejects uppercase, spaces, underscores, and other symbols", () => {
		expect(validateSlug("ABC")).toBe(false);
		expect(validateSlug("a b")).toBe(false);
		expect(validateSlug("a_b")).toBe(false);
		expect(validateSlug("a.b")).toBe(false);
		expect(validateSlug("café")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// provisionTenant — input guards (must reject before any IO)
// ---------------------------------------------------------------------------

/** A controlPanelDb that fails the test if any query is attempted. */
const dbThatMustNotBeTouched = {
	query: {
		organizations: {
			findFirst: () => {
				throw new Error("controlPanelDb was queried before input validation");
			},
		},
	},
} as unknown as never;

const baseDeps = {
	controlPanelDb: dbThatMustNotBeTouched,
	adminUserId: "admin-1",
	frontendURL: "https://app.avantej.test",
};

const validInput = {
	name: "Test Gym",
	slug: "test-gym",
	country: "MY" as const,
	ownerEmail: "owner@test.my",
};

describe("provisionTenant — input guards", () => {
	it("rejects a name shorter than 2 characters before any DB access", async () => {
		await expect(
			provisionTenant({ ...validInput, name: "A" }, baseDeps),
		).rejects.toThrow(/at least 2 characters/);
	});

	it("rejects a slug that slugifies below the 3-char minimum", async () => {
		await expect(
			provisionTenant({ ...validInput, slug: "ab" }, baseDeps),
		).rejects.toThrow(/Slug must be/);
	});

	it("rejects a slug whose only characters are stripped to empty", async () => {
		await expect(
			provisionTenant({ ...validInput, slug: "!!!" }, baseDeps),
		).rejects.toThrow(/Slug must be/);
	});

	it("rejects a country outside the MY/SG/TH whitelist", async () => {
		await expect(
			provisionTenant(
				{ ...validInput, country: "US" as unknown as "MY" },
				baseDeps,
			),
		).rejects.toThrow(/Country must be one of/);
	});
});
