import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

const { navigateMock, searchRef } = vi.hoisted(() => ({
	navigateMock: vi.fn(),
	searchRef: { current: {} as { token: string; callbackURL: string } },
}));

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

vi.mock("@tanstack/react-router", () => ({
	// Capture the options object so we can render options.component and
	// exercise options.validateSearch directly.
	createFileRoute: () => (opts: unknown) => ({ options: opts }),
	useNavigate: () => navigateMock,
	useSearch: () => searchRef.current,
}));

import { Route } from "@/routes/verify-email";

const VerifyEmailPage = (Route.options as { component: React.ComponentType })
	.component;
const validateSearch = (
	Route.options as { validateSearch: { parse: (v: unknown) => unknown } }
).validateSearch;

describe("verify-email route — callbackURL transform (validateSearch)", () => {
	it("keeps a safe internal path", () => {
		expect(
			validateSearch.parse({ token: "t", callbackURL: "/dashboard" }),
		).toEqual(expect.objectContaining({ callbackURL: "/dashboard" }));
	});

	it("rejects protocol-relative URLs (//evil.com) -> /login", () => {
		expect(
			validateSearch.parse({ token: "t", callbackURL: "//evil.com" }),
		).toEqual(expect.objectContaining({ callbackURL: "/login" }));
	});

	it("rejects absolute external URLs -> /login", () => {
		expect(
			validateSearch.parse({ token: "t", callbackURL: "https://evil.com" }),
		).toEqual(expect.objectContaining({ callbackURL: "/login" }));
	});

	it("defaults missing callbackURL to /login", () => {
		expect(validateSearch.parse({ token: "t" })).toEqual(
			expect.objectContaining({ callbackURL: "/login" }),
		);
	});

	it("defaults missing token to an empty string", () => {
		expect(validateSearch.parse({})).toEqual(
			expect.objectContaining({ token: "" }),
		);
	});
});

describe("verify-email route — component behaviour", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		searchRef.current = { token: "valid-token", callbackURL: "/login" };
	});

	it("shows the missing-token error when no token is present", async () => {
		searchRef.current = { token: "", callbackURL: "/login" };
		renderWithProviders(<VerifyEmailPage />);

		await waitFor(() => {
			expect(
				screen.getByText(/missing verification token/i),
			).toBeInTheDocument();
		});
		expect(mockClient.auth.verifyEmail).not.toHaveBeenCalled();
	});

	it("calls auth.verifyEmail, shows success, then navigates to callbackURL", async () => {
		mockClient.auth.verifyEmail.mockResolvedValueOnce(undefined);
		searchRef.current = { token: "valid-token", callbackURL: "/dashboard" };
		renderWithProviders(<VerifyEmailPage />);

		await waitFor(() => {
			expect(mockClient.auth.verifyEmail).toHaveBeenCalledWith({
				token: "valid-token",
			});
		});
		await waitFor(() => {
			expect(screen.getByText(/email verified/i)).toBeInTheDocument();
		});

		// Redirect fires after a ~1200ms timer (real timers).
		await waitFor(
			() => {
				expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
			},
			{ timeout: 2500 },
		);
	});

	it("shows a failure message when verifyEmail rejects", async () => {
		mockClient.auth.verifyEmail.mockRejectedValueOnce(new Error("expired"));
		renderWithProviders(<VerifyEmailPage />);

		await waitFor(() => {
			expect(screen.getByText(/^verification failed$/i)).toBeInTheDocument();
		});
		expect(
			screen.getByText(/link may be expired or invalid/i),
		).toBeInTheDocument();
		expect(navigateMock).not.toHaveBeenCalled();
	});
});
