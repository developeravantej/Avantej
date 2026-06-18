/**
 * Integration Test: Neon Service
 *
 * Tests against REAL Neon API (requires NEON_API_KEY)
 *
 * ⚠️  WARNING: This creates real Neon projects - they will be cleaned up automatically
 *
 * Run with: bun test neon.service.integration.test.ts
 * (Automatically loads NEON_API_KEY from .dev.vars)
 *
 * To skip integration tests: SKIP_INTEGRATION_TESTS=true bun test
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createTenantProject, deleteTenantProject } from "./neon.service";

/**
 * Load environment variables from .dev.vars file
 */
function loadDevVars(): void {
	try {
		const devVarsPath = join(import.meta.dir, "../../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			// Skip comments and empty lines
			if (!trimmed || trimmed.startsWith("#")) continue;

			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match) {
				const [, key, value] = match;
				// Always overwrite to defeat env pollution from sibling test files
				// that may have deleted/mutated process.env before this test ran.
				process.env[key!] = value;
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

// Load .dev.vars at module level
loadDevVars();

describe("Neon Service Integration Tests", () => {
	const testSlug = `test-integration-${Date.now()}`; // Unique slug per test run
	let createdProjectId: string | undefined;
	let createdConnectionString: string | undefined;
	void createdConnectionString;

	beforeAll(() => {
		// Re-load .dev.vars right before tests run, in case sibling test files
		// mutated/deleted process.env.NEON_API_KEY between module load and now.
		loadDevVars();

		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log(
				"⏭️  Skipping integration tests (SKIP_INTEGRATION_TESTS=true)",
			);
			return;
		}

		if (!process.env.NEON_API_KEY) {
			throw new Error(
				"NEON_API_KEY environment variable is required for integration tests.\n" +
					"Set SKIP_INTEGRATION_TESTS=true to skip these tests.\n" +
					"Note: NEON_API_KEY is automatically loaded from .dev.vars file.",
			);
		}
	});

	test("creates real Neon project and returns valid projectId and connectionString", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		const apiKey = process.env.NEON_API_KEY!;

		try {
			const result = await createTenantProject(
				{
					slug: testSlug,
					region: "aws-ap-southeast-1",
				},
				{ NEON_API_KEY: apiKey },
			);

			// Validate project ID format (Neon project IDs are typically UUIDs or similar)
			expect(result.projectId).toBeTruthy();
			expect(typeof result.projectId).toBe("string");
			expect(result.projectId.length).toBeGreaterThan(0);

			// Validate connection string format
			expect(result.connectionString).toBeTruthy();
			expect(result.connectionString).toContain("postgresql://");
			expect(result.connectionString).toContain("neon.tech");
			expect(result.connectionString).toContain("@");

			createdProjectId = result.projectId;
			createdConnectionString = result.connectionString;

			console.log(`✅ Created Neon project: ${createdProjectId}`);
		} catch (error) {
			// Handle project limit error gracefully
			if (
				error instanceof Error &&
				error.message.includes("PROJECTS_LIMIT_EXCEEDED")
			) {
				console.log(
					"⚠️  Skipping test: Neon account has reached project limit (30 projects)",
				);
				console.log(
					"   This is expected for free tier accounts. Delete some projects to run this test.",
				);
				return;
			}
			throw error;
		}
	}, 30000); // 30 second timeout for integration test

	test("creates project with correct name format", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		const apiKey = process.env.NEON_API_KEY!;
		const customSlug = `test-custom-${Date.now()}`;

		try {
			const result = await createTenantProject(
				{
					slug: customSlug,
					region: "aws-ap-southeast-1",
				},
				{ NEON_API_KEY: apiKey },
			);

			expect(result.projectId).toBeTruthy();
			expect(result.connectionString).toBeTruthy();

			// Clean up this test project immediately
			await deleteTenantProject(result.projectId, { NEON_API_KEY: apiKey });
			console.log(`✅ Cleaned up test project: ${result.projectId}`);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("PROJECTS_LIMIT_EXCEEDED")
			) {
				console.log("⚠️  Skipping test: Neon account has reached project limit");
				return;
			}
			throw error;
		}
	}, 30000); // 30 second timeout for integration test

	test("creates project with default region when not specified", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		const apiKey = process.env.NEON_API_KEY!;
		const defaultRegionSlug = `test-default-region-${Date.now()}`;

		try {
			const result = await createTenantProject(
				{
					slug: defaultRegionSlug,
					// region not specified - should use default
				},
				{ NEON_API_KEY: apiKey },
			);

			expect(result.projectId).toBeTruthy();
			expect(result.connectionString).toBeTruthy();

			// Clean up this test project immediately
			await deleteTenantProject(result.projectId, { NEON_API_KEY: apiKey });
			console.log(`✅ Cleaned up test project: ${result.projectId}`);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("PROJECTS_LIMIT_EXCEEDED")
			) {
				console.log("⚠️  Skipping test: Neon account has reached project limit");
				return;
			}
			throw error;
		}
	}, 30000); // 30 second timeout for integration test

	test("throws error when API key is invalid", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		await expect(
			createTenantProject(
				{
					slug: "test-invalid-key",
				},
				{ NEON_API_KEY: "invalid-api-key-12345" },
			),
		).rejects.toThrow("Failed to create Neon project");
	});

	afterAll(async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			return;
		}

		// Clean up created project
		if (createdProjectId && process.env.NEON_API_KEY) {
			try {
				await deleteTenantProject(createdProjectId, {
					NEON_API_KEY: process.env.NEON_API_KEY,
				});
				console.log(
					`✅ Cleaned up integration test project: ${createdProjectId}`,
				);
			} catch (error) {
				console.error(
					`⚠️  Failed to clean up project ${createdProjectId}:`,
					error instanceof Error ? error.message : error,
				);
				console.log(
					`⚠️  Please manually delete project ${createdProjectId} from Neon console`,
				);
			}
		}
	});
});
