import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Content-level render check for the refactored google-calendar settings page.
// Guards the removed `as any` casts on the orgStatus + listConnectedCalendars
// queries (lines 134 / 404 / 405): if the typed query data broke the page, the
// content assertions below fail instead of silently rendering a broken strip.
test.describe("settings/google-calendar", () => {
	test("Google Calendar settings renders typed content (no crash)", async ({
		page,
	}) => {
		await smokeLoad(page, "/dashboard/settings/google-calendar");

		await expect(
			page.getByRole("heading", { name: /something went wrong/i }),
		).toHaveCount(0);

		// The page renders its Google Calendar content (title/connection panel).
		await expect(page.getByText(/google calendar/i).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
