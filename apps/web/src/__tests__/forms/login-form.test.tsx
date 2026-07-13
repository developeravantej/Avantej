import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";

// --- Hoisted mocks --------------------------------------------------------
const {
	signInEmail,
	useSession,
	navigateMock,
	toastSuccess,
	toastError,
	searchRef,
} = vi.hoisted(() => ({
	signInEmail: vi.fn(),
	useSession: vi.fn(),
	navigateMock: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	// Mutable container so each test can control useSearch() output.
	searchRef: { current: {} as Record<string, unknown> },
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => useSession(),
		signIn: { email: signInEmail },
	},
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
	useSearch: () => searchRef.current,
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="#">{children}</a>
	),
}));

import LoginForm from "@/components/forms/login-form";

async function fillAndSubmit(
	user: ReturnType<typeof userEvent.setup>,
	email = "user@test.my",
	password = "password123",
) {
	await user.type(screen.getByLabelText(/email/i), email);
	await user.type(screen.getByLabelText(/password/i), password);
	await user.click(screen.getByRole("button", { name: /^login$/i }));
}

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		searchRef.current = {};
		// Default: not authenticated, done loading -> form renders.
		useSession.mockReturnValue({ data: null, isPending: false });
	});

	it("calls authClient.signIn.email with the entered credentials", async () => {
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		await waitFor(() => {
			expect(signInEmail).toHaveBeenCalledWith({
				email: "user@test.my",
				password: "password123",
			});
		});
	});

	it("on success shows a success toast and navigates to /dashboard", async () => {
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Login successful");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("surfaces the server error message on failure and does not navigate", async () => {
		signInEmail.mockResolvedValue({
			error: { message: "Invalid credentials" },
		});
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Invalid credentials");
		});
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("shows the loading state and disables the button while submitting", async () => {
		let resolveSignIn: (v: { error: null }) => void = () => {};
		signInEmail.mockReturnValue(
			new Promise<{ error: null }>((r) => {
				resolveSignIn = r;
			}),
		);
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		const btn = await screen.findByRole("button", { name: /logging in/i });
		expect(btn).toBeDisabled();

		resolveSignIn({ error: null });
		await waitFor(() => expect(navigateMock).toHaveBeenCalled());
	});

	it("does not call signIn when the email is invalid (client validation)", async () => {
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await user.type(screen.getByLabelText(/email/i), "not-an-email");
		await user.type(screen.getByLabelText(/password/i), "password123");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		// Client-side zod validation must block the network call for a bad email.
		await new Promise((r) => setTimeout(r, 150));
		expect(signInEmail).not.toHaveBeenCalled();
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("does not call signIn when the password is too short", async () => {
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await user.type(screen.getByLabelText(/email/i), "user@test.my");
		await user.type(screen.getByLabelText(/password/i), "short");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await new Promise((r) => setTimeout(r, 150));
		expect(signInEmail).not.toHaveBeenCalled();
	});

	it("redirects to /register when a registrationToken is present in search", async () => {
		searchRef.current = { registrationToken: "reg-123" };
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/register",
				search: { token: "reg-123" },
			});
		});
	});

	it("redirects to /accept-invitation when invitationToken + orgId are present", async () => {
		searchRef.current = { invitationToken: "inv-1", orgId: "org-9" };
		signInEmail.mockResolvedValue({ error: null });
		const user = userEvent.setup();
		renderWithProviders(<LoginForm />);

		await fillAndSubmit(user);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/accept-invitation",
				search: { token: "inv-1", orgId: "org-9" },
			});
		});
	});

	it("redirects an already-authenticated user to /dashboard on mount", async () => {
		useSession.mockReturnValue({
			data: { user: { id: "u1", email: "a@b.my" } },
			isPending: false,
		});
		renderWithProviders(<LoginForm />);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});
});
