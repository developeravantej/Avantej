import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";

const { navigateMock, toastSuccess, toastError, toastInfo, searchRef } =
	vi.hoisted(() => ({
		navigateMock: vi.fn(),
		toastSuccess: vi.fn(),
		toastError: vi.fn(),
		toastInfo: vi.fn(),
		searchRef: { current: {} as { token?: string } },
	}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError, info: toastInfo },
}));

vi.mock("@/lib/config", () => ({ getServerUrl: () => "https://api.test" }));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: unknown) => ({ options: opts }),
	useNavigate: () => navigateMock,
	useSearch: () => searchRef.current,
}));

import { Route } from "@/routes/(auth)/setup-password";

const SetupPasswordPage = (Route.options as { component: React.ComponentType })
	.component;

const VALID_TOKEN_INFO = {
	email: "member@test.my",
	full_name: "Ahmad Firdaus",
	is_expired: false,
	expires_at: "2099-01-01T00:00:00Z",
	already_has_password: false,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
	return Promise.resolve({
		ok,
		status,
		json: () => Promise.resolve(body),
	} as Response);
}

describe("setup-password route", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		searchRef.current = { token: "setup-token" };
		localStorage.clear();
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("redirects to /login when no token is present", async () => {
		searchRef.current = {};
		renderWithProviders(<SetupPasswordPage />);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("No setup token provided");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("validates the token on mount and renders the form for a valid token", async () => {
		fetchMock.mockImplementation((url: string) => {
			if (String(url).includes("setup-token-info")) {
				return jsonResponse(VALID_TOKEN_INFO);
			}
			return jsonResponse({});
		});
		renderWithProviders(<SetupPasswordPage />);

		await waitFor(() => {
			expect(screen.getByText(/Ahmad Firdaus/)).toBeInTheDocument();
		});
		expect(fetchMock.mock.calls[0][0]).toContain(
			"/api/v1/auth-setup/setup-token-info/setup-token",
		);
	});

	it("redirects to /login when the token is expired", async () => {
		fetchMock.mockImplementation(() =>
			jsonResponse({ ...VALID_TOKEN_INFO, is_expired: true }),
		);
		renderWithProviders(<SetupPasswordPage />);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"Password setup link has expired",
			);
			expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
		});
	});

	it("redirects to /login when the account already has a password", async () => {
		fetchMock.mockImplementation(() =>
			jsonResponse({ ...VALID_TOKEN_INFO, already_has_password: true }),
		);
		renderWithProviders(<SetupPasswordPage />);

		await waitFor(() => {
			expect(toastInfo).toHaveBeenCalledWith(
				"Password already set for this account",
			);
			expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
		});
	});

	it("redirects to /login when token validation fails", async () => {
		fetchMock.mockImplementation(() => jsonResponse({}, false, 404));
		renderWithProviders(<SetupPasswordPage />);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"Invalid or expired password setup link",
			);
			expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
		});
	});

	it("submits the password, stores the access token, and navigates to /onboarding", async () => {
		fetchMock.mockImplementation((url: string, init?: RequestInit) => {
			if (String(url).includes("setup-token-info")) {
				return jsonResponse(VALID_TOKEN_INFO);
			}
			if (String(url).includes("setup-password") && init?.method === "POST") {
				return jsonResponse({
					access_token: "at-123",
					user_id: "u1",
					email: "member@test.my",
					full_name: "Ahmad Firdaus",
				});
			}
			return jsonResponse({});
		});

		const user = userEvent.setup();
		renderWithProviders(<SetupPasswordPage />);

		await screen.findByText(/Ahmad Firdaus/);

		await user.type(screen.getByLabelText("Password"), "password123");
		await user.type(screen.getByLabelText(/confirm password/i), "password123");
		await user.click(screen.getByRole("button", { name: /set up password/i }));

		await waitFor(() => {
			expect(localStorage.getItem("authToken")).toBe("at-123");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/onboarding" });
		});
		expect(toastSuccess).toHaveBeenCalled();

		// The POST body carries the token and the entered password.
		const postCall = fetchMock.mock.calls.find(
			(c) => String(c[0]).includes("setup-password") && c[1]?.method === "POST",
		);
		expect(JSON.parse(postCall![1].body as string)).toEqual({
			token: "setup-token",
			password: "password123",
		});
	});

	it("does not submit when the passwords do not match", async () => {
		fetchMock.mockImplementation(() => jsonResponse(VALID_TOKEN_INFO));

		const user = userEvent.setup();
		renderWithProviders(<SetupPasswordPage />);

		await screen.findByText(/Ahmad Firdaus/);

		await user.type(screen.getByLabelText("Password"), "password123");
		await user.type(screen.getByLabelText(/confirm password/i), "different1");
		await user.click(screen.getByRole("button", { name: /set up password/i }));

		await waitFor(() => {
			expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
		});
		// Only the mount-time GET fired; no POST.
		expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(
			false,
		);
	});
});
