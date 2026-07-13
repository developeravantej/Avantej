import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

const { useSession } = vi.hoisted(() => ({
	useSession: vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => useSession() },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: unknown) => ({ options: opts }),
}));

import { Route } from "@/routes/set-password";

const SetPasswordPage = (Route.options as { component: React.ComponentType })
	.component;

const SESSION = {
	data: { user: { id: "u1", email: "member@test.my", name: "Ahmad" } },
	isPending: false,
};

describe("set-password route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSession.mockReturnValue(SESSION);
	});

	it("shows a spinner while the session is pending", () => {
		useSession.mockReturnValue({ data: null, isPending: true });
		const { container } = renderWithProviders(<SetPasswordPage />);
		expect(container.querySelector(".animate-spin")).toBeTruthy();
	});

	it("shows the expired-link card when there is no session", () => {
		useSession.mockReturnValue({ data: null, isPending: false });
		renderWithProviders(<SetPasswordPage />);
		expect(screen.getByText(/link expired/i)).toBeInTheDocument();
	});

	it("calls client.auth.setPassword and shows the success card on submit", async () => {
		mockClient.auth.setPassword.mockResolvedValueOnce(undefined);
		const user = userEvent.setup();
		renderWithProviders(<SetPasswordPage />);

		await user.type(screen.getByLabelText("Password"), "password123");
		await user.type(screen.getByLabelText(/confirm password/i), "password123");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		await waitFor(() => {
			expect(mockClient.auth.setPassword).toHaveBeenCalledWith({
				newPassword: "password123",
			});
		});
		await waitFor(() => {
			expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
		});
	});

	it("rejects a password shorter than 8 characters without calling the API", async () => {
		const user = userEvent.setup();
		renderWithProviders(<SetPasswordPage />);

		await user.type(screen.getByLabelText("Password"), "short");
		await user.type(screen.getByLabelText(/confirm password/i), "short");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		await waitFor(() => {
			expect(
				screen.getByText(/password must be at least 8 characters/i),
			).toBeInTheDocument();
		});
		expect(mockClient.auth.setPassword).not.toHaveBeenCalled();
	});

	it("shows a mismatch error when the passwords differ", async () => {
		const user = userEvent.setup();
		renderWithProviders(<SetPasswordPage />);

		await user.type(screen.getByLabelText("Password"), "password123");
		await user.type(screen.getByLabelText(/confirm password/i), "password999");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		await waitFor(() => {
			expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
		});
		expect(mockClient.auth.setPassword).not.toHaveBeenCalled();
	});

	it("surfaces the error message when setPassword throws", async () => {
		mockClient.auth.setPassword.mockRejectedValueOnce(
			new Error("Server unavailable"),
		);
		const user = userEvent.setup();
		renderWithProviders(<SetPasswordPage />);

		await user.type(screen.getByLabelText("Password"), "password123");
		await user.type(screen.getByLabelText(/confirm password/i), "password123");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		await waitFor(() => {
			expect(screen.getByText(/server unavailable/i)).toBeInTheDocument();
		});
		expect(screen.queryByText(/you're all set/i)).not.toBeInTheDocument();
	});
});
