/**
 * Neon Service Test
 *
 * Tests Neon project provisioning functionality.
 *
 * Run with: bun test neon.service.test.ts
 *
 * Requires NEON_API_KEY environment variable for integration tests:
 * NEON_API_KEY=your_key bun test neon.service.test.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createTenantProject } from "./neon.service";

describe("Neon Service - createTenantProject", () => {
	const originalFetch = globalThis.fetch;
	const originalEnv = process.env.NEON_API_KEY;

	beforeEach(() => {
		// Reset mocks
		globalThis.fetch = originalFetch;
	});

	afterEach(() => {
		// Restore original fetch
		globalThis.fetch = originalFetch;
		if (originalEnv) {
			process.env.NEON_API_KEY = originalEnv;
		} else {
			delete (process.env as any).NEON_API_KEY;
		}
	});

	test("successfully creates Neon project and returns projectId and connectionString", async () => {
		const mockResponse = {
			project: {
				id: "test-project-id-123",
				connection_uris: [
					{
						connection_uri: "postgresql://user:pass@ep-xxx.neon.tech/neondb",
					},
				],
			},
		};

		// Mock fetch to handle both project creation and branches API calls
		(globalThis as any).fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/branches")) {
				// Mock branches API response
				return Promise.resolve({
					ok: true,
					json: async () => ({ branches: [] }),
				} as Response);
			}
			// Mock project creation response
			return Promise.resolve({
				ok: true,
				status: 201,
				statusText: "Created",
				json: async () => mockResponse,
			} as Response);
		});

		const result = await createTenantProject(
			{
				slug: "test-org",
				region: "aws-ap-southeast-1",
			},
			{ NEON_API_KEY: "test-api-key-12345" },
		);

		expect(result.projectId).toBe("test-project-id-123");
		expect(result.connectionString).toBe(
			"postgresql://user:pass@ep-xxx.neon.tech/neondb",
		);

		// Verify fetch was called (project creation + branches API)
		const fetchCalls = (globalThis.fetch as any).mock.calls;
		expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
		expect(fetchCalls[0][0]).toBe("https://console.neon.tech/api/v2/projects");
		expect(fetchCalls[0][1].method).toBe("POST");
		expect(fetchCalls[0][1].headers.Authorization).toBe(
			"Bearer test-api-key-12345",
		);
		expect(fetchCalls[0][1].headers["Content-Type"]).toBe("application/json");

		const body = JSON.parse(fetchCalls[0][1].body);
		expect(body.project.name).toBe("tenant-test-org");
		expect(body.project.region_id).toBe("aws-ap-southeast-1");
		expect(body.project.pg_version).toBe(17);
	});

	test("uses default region when region is not provided", async () => {
		const mockResponse = {
			project: {
				id: "test-project-id-456",
				connection_uris: [
					{
						connection_uri: "postgresql://user:pass@ep-xxx.neon.tech/neondb",
					},
				],
			},
		};

		(globalThis as any).fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 201,
				json: async () => mockResponse,
			} as Response),
		);

		await createTenantProject(
			{
				slug: "test-org",
			},
			{ NEON_API_KEY: "test-api-key-12345" },
		);

		const fetchCalls = (globalThis.fetch as any).mock.calls;
		const body = JSON.parse(fetchCalls[0][1].body);
		expect(body.project.region_id).toBe("aws-ap-southeast-1"); // Default region
	});

	test("throws error when NEON_API_KEY is not set", async () => {
		await expect(
			createTenantProject({
				slug: "test-org",
			}),
		).rejects.toThrow("NEON_API_KEY environment variable is not set");
	});

	test("throws error when API returns non-ok response", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({
					error: "Invalid project name",
				}),
			} as Response),
		);

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow("Failed to create Neon project: 400 Bad Request");
	});

	test("throws error when API response is missing project ID", async () => {
		const mockResponse = {
			project: {
				// Missing id
				connection_uris: [
					{
						connection_uri: "postgresql://user:pass@ep-xxx.neon.tech/neondb",
					},
				],
			},
		};

		(globalThis as any).fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 201,
				json: async () => mockResponse,
			} as Response),
		);

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow("Neon API response missing project ID");
	});

	test("throws error when API response is missing connection URI", async () => {
		const mockResponse = {
			project: {
				id: "test-project-id-789",
				// Missing connection_uris
			},
		};

		// Mock fetch to handle branches API call (will return empty branches, then fail to get connection URI)
		(globalThis as any).fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/branches")) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ branches: [] }),
				} as Response);
			}
			if (typeof url === "string" && url.includes("/connection_uri")) {
				return Promise.resolve({
					ok: false,
					status: 404,
					json: async () => ({}),
				} as Response);
			}
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => mockResponse,
			} as Response);
		});

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow("connection string could not be retrieved");
	});

	test("throws error when API response has empty connection_uris array", async () => {
		const mockResponse = {
			project: {
				id: "test-project-id-789",
				connection_uris: [], // Empty array
			},
		};

		// Mock fetch to handle branches API call (will return empty branches, then fail to get connection URI)
		(globalThis as any).fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/branches")) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ branches: [] }),
				} as Response);
			}
			if (typeof url === "string" && url.includes("/connection_uri")) {
				return Promise.resolve({
					ok: false,
					status: 404,
					json: async () => ({}),
				} as Response);
			}
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => mockResponse,
			} as Response);
		});

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow("connection string could not be retrieved");
	});

	test("handles network errors gracefully", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.reject(new Error("Network error")),
		);

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow("Failed to create Neon project: Network error");
	});

	test("handles invalid JSON response gracefully", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => {
					throw new Error("Invalid JSON");
				},
			} as unknown as Response),
		);

		await expect(
			createTenantProject(
				{
					slug: "test-org",
				},
				{ NEON_API_KEY: "test-api-key-12345" },
			),
		).rejects.toThrow(
			"Failed to create Neon project: 500 Internal Server Error",
		);
	});

	test("generates correct project name from slug", async () => {
		const mockResponse = {
			project: {
				id: "test-project-id",
				connection_uris: [
					{
						connection_uri: "postgresql://user:pass@ep-xxx.neon.tech/neondb",
					},
				],
			},
		};

		(globalThis as any).fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 201,
				json: async () => mockResponse,
			} as Response),
		);

		await createTenantProject(
			{
				slug: "my-fitness-studio",
			},
			{ NEON_API_KEY: "test-api-key-12345" },
		);

		const fetchCalls = (globalThis.fetch as any).mock.calls;
		const body = JSON.parse(fetchCalls[0][1].body);
		expect(body.project.name).toBe("tenant-my-fitness-studio");
	});
});
