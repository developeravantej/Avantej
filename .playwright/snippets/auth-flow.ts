/**
 * Avantej login snippet — used by tests/global-setup.ts to mint storage state per actor.
 *
 * Mirrors the existing e2e/auth.setup.ts (which the legacy spec batches still use).
 * Better-Auth on this project uses a cookie session; storage state captures it.
 */

import type { Page } from "@playwright/test";

export type LoginCredentials = {
	email: string;
	password: string;
};

export async function login(page: Page, creds: LoginCredentials): Promise<void> {
	await page.goto("/login");
	await page.getByLabel("Email").fill(creds.email);
	await page.getByLabel("Password").fill(creds.password);
	await page.getByRole("button", { name: /sign in|login/i }).click();
	// Either /dashboard (tenant admin) or /platform-admin (control panel admin)
	await page.waitForURL(/\/(dashboard|platform-admin)/, { timeout: 20_000 });
}
