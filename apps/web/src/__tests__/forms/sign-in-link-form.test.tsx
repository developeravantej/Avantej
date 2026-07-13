import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";

const { magicLink, toastError } = vi.hoisted(() => ({
	magicLink: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signIn: { magicLink },
	},
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: toastError },
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="#">{children}</a>
	),
}));

import SignInLinkForm from "@/components/forms/sign-in-link-form";

describe("SignInLinkForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls signIn.magicLink with the email and /dashboard callbackURL", async () => {
		magicLink.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		await waitFor(() => {
			expect(magicLink).toHaveBeenCalledWith({
				email: "user@test.my",
				callbackURL: "/dashboard",
			});
		});
	});

	it("shows the confirmation screen with the email after a successful send", async () => {
		magicLink.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
		});
		expect(screen.getByText("user@test.my")).toBeInTheDocument();
		// Confirmation view replaces the send button.
		expect(
			screen.queryByRole("button", { name: /send sign-in link/i }),
		).not.toBeInTheDocument();
	});

	it("surfaces the error and stays on the form when sending fails", async () => {
		magicLink.mockResolvedValue({
			error: { message: "Rate limited" },
		});
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Rate limited");
		});
		expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
	});

	it("does not call magicLink when the email is invalid", async () => {
		magicLink.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "nope");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		// Client-side zod validation must block the network call for a bad email.
		await new Promise((r) => setTimeout(r, 150));
		expect(magicLink).not.toHaveBeenCalled();
		expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
	});

	it("shows a sending state while the request is in flight", async () => {
		let resolve: (v: { error: null }) => void = () => {};
		magicLink.mockReturnValue(
			new Promise<{ error: null }>((r) => {
				resolve = r;
			}),
		);
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		const btn = await screen.findByRole("button", { name: /sending/i });
		expect(btn).toBeDisabled();

		resolve({ error: null });
		await waitFor(() =>
			expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
		);
	});

	it("lets the user reset to a different email from the confirmation screen", async () => {
		magicLink.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<SignInLinkForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.click(
			screen.getByRole("button", { name: /send sign-in link/i }),
		);

		await screen.findByText(/check your inbox/i);
		await user.click(
			screen.getByRole("button", { name: /use a different email/i }),
		);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /send sign-in link/i }),
			).toBeInTheDocument();
		});
	});
});
