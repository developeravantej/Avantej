/**
 * Connection String Encryption Utilities
 *
 * Provides AES-256-GCM encryption/decryption for tenant database connection strings.
 * Connection strings are encrypted before storage in the control panel database
 * and decrypted only when establishing database connections.
 *
 * Security:
 * - Uses AES-256-GCM (Authenticated Encryption with Associated Data)
 * - Random IV (Initialization Vector) generated for each encryption
 * - Auth tag prevents tampering
 * - Format: iv:authTag:encrypted
 *
 * Environment Variable:
 * - ENCRYPTION_KEY: 64-character hex string (32 bytes) - Generate with: openssl rand -hex 32
 *
 * Usage:
 * ```typescript
 * import { encrypt, decrypt } from "@/lib/encryption";
 *
 * const encrypted = encrypt(connectionString);
 * // Store encrypted in database
 *
 * const decrypted = decrypt(encrypted);
 * // Use decrypted connection string for database connection
 * ```
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES

/**
 * Get encryption key from environment variable
 * Throws error if ENCRYPTION_KEY is not set or invalid
 */
function getSecretKey(): Buffer {
	const encryptionKey = process.env.ENCRYPTION_KEY;

	if (!encryptionKey) {
		throw new Error("ENCRYPTION_KEY environment variable is required");
	}

	// Validate hex format and length (64 hex chars = 32 bytes)
	if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
		throw new Error(
			"ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
		);
	}

	return Buffer.from(encryptionKey, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 *
 * @param text - Plaintext string to encrypt (e.g., database connection string)
 * @returns Encrypted string in format: iv:authTag:encrypted
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
export function encrypt(text: string): string {
	if (!text) {
		throw new Error("Cannot encrypt empty string");
	}

	const secretKey = getSecretKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);

	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");

	const authTag = cipher.getAuthTag().toString("hex");

	// Format: iv:authTag:encrypted
	return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted string using AES-256-GCM
 *
 * @param encryptedText - Encrypted string in format: iv:authTag:encrypted
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (invalid format, tampered data, or missing ENCRYPTION_KEY)
 */
export function decrypt(encryptedText: string): string {
	if (!encryptedText) {
		throw new Error("Cannot decrypt empty string");
	}

	const secretKey = getSecretKey();
	const parts = encryptedText.split(":");

	if (parts.length !== 3) {
		throw new Error(
			"Invalid encrypted format. Expected format: iv:authTag:encrypted",
		);
	}

	const [ivHex, authTagHex, encrypted] = parts;

	if (!ivHex || !authTagHex || !encrypted) {
		throw new Error(
			"Invalid encrypted format. All parts (iv, authTag, encrypted) must be present",
		);
	}

	try {
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");
		const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);

		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Decryption failed: ${error.message}`);
		}
		throw new Error("Decryption failed: Unknown error");
	}
}
