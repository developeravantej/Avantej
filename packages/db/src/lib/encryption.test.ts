/**
 * Encryption Utilities Test
 * 
 * Tests AES-256-GCM encryption/decryption round-trip
 * 
 * Run with: bun test encryption.test.ts
 * 
 * Requires ENCRYPTION_KEY environment variable:
 * ENCRYPTION_KEY=$(openssl rand -hex 32) bun test encryption.test.ts
 */

import { describe, test, expect } from "bun:test";
import { encrypt, decrypt } from "./encryption";

describe("Encryption Utilities", () => {
	// Use a test encryption key (32 bytes = 64 hex chars)
	const TEST_ENCRYPTION_KEY = "23c13068d7e40921af59305dc8f4e5fecbb1d61894674a4cd0c9dad2365d0f32";

	test("encrypt and decrypt round-trip matches original string", () => {
		// Set test encryption key
		process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

		const original = "postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require";
		
		const encrypted = encrypt(original);
		const decrypted = decrypt(encrypted);

		expect(decrypted).toBe(original);
		expect(encrypted).not.toBe(original);
		expect(encrypted).toContain(":"); // Format: iv:authTag:encrypted
	});

	test("encrypt produces different output for same input (due to random IV)", () => {
		process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

		const original = "postgresql://user:password@ep-xxx.neon.tech/neondb";
		
		const encrypted1 = encrypt(original);
		const encrypted2 = encrypt(original);

		// Should be different due to random IV
		expect(encrypted1).not.toBe(encrypted2);
		
		// But both should decrypt to same original
		expect(decrypt(encrypted1)).toBe(original);
		expect(decrypt(encrypted2)).toBe(original);
	});

	test("decrypt throws error for invalid format", () => {
		process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

		expect(() => decrypt("invalid")).toThrow("Invalid encrypted format");
		expect(() => decrypt("a:b")).toThrow("Invalid encrypted format");
		expect(() => decrypt("")).toThrow("Cannot decrypt empty string");
	});

	test("encrypt throws error for empty string", () => {
		process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

		expect(() => encrypt("")).toThrow("Cannot encrypt empty string");
	});

	test("decrypt throws error for tampered data", () => {
		process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

		const original = "postgresql://user:password@ep-xxx.neon.tech/neondb";
		const encrypted = encrypt(original);
		
		// Tamper with encrypted data
		const tampered = encrypted.replace(/.$/, "x"); // Change last character
		
		expect(() => decrypt(tampered)).toThrow("Decryption failed");
	});

	test("throws error when ENCRYPTION_KEY is not set", () => {
		delete process.env.ENCRYPTION_KEY;

		expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is required");
		expect(() => decrypt("test:tag:encrypted")).toThrow("ENCRYPTION_KEY environment variable is required");
	});

	test("throws error when ENCRYPTION_KEY is invalid format", () => {
		process.env.ENCRYPTION_KEY = "invalid-key";

		expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be a 64-character hex string");
	});
});

