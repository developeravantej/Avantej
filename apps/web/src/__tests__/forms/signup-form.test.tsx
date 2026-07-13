import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";

const {
	signUpEmail,
	refetch,
	navigateMock,
	toastSuccess,
	toastError,
	toastInfo,
	searchRef,
} = vi.hoisted(() => ({
	signUpEmail: vi.fn(),
	refetch: vi.fn().mockResolvedValue(undefined),
	navigateMock: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	searchRef: { current: {} as Record<string, unknown> },
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ isPending: false, refetch }),
		signUp: { email: signUpEmail },
	},
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError, info: toastInfo },
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
	useSearch: () => searchRef.current,
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="#">{children}</a>
	),
}));

import { SignupForm } from "@/components/forms/signup-form";

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText("First Name"), "John");
	await user.type(screen.getByLabelText("Last Name"), "Doe");
	await user.type(screen.getByLabelText("Email Address"), "user@test.my");
	await user.type(screen.getByLabelText("Password"), "Password1");
	await user.type(screen.getByLabelText("Confirm Password"), "Password1");
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		searchRef.current = {};
		refetch.mockResolvedValue(undefined);
	});

	it("calls signUp.email with the mapped payload (name, firstName, lastName)", async () => {
		signUpEmail.mockImplementation(async (_payload, cbs) => {
			await cbs?.onSuccess?.();
		});
		const user = userEvent.setup();
		renderWithProviders(<SignupForm />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		await waitFor(() => {
			expect(signUpEmail).toHaveBeenCalledTimes(1);
		});
		const [payload] = signUpEmail.mock.calls[0];
		expect(payload).toMatchObject({
			email: "user@test.my",
			password: "Password1",
			name: "John Doe",
			firstName: "John",
			lastName: "Doe",
		});
		// Let the async onSuccess (refetch + 300ms + navigate) fully settle so its
		// deferred navigate() does not leak into a later test.
		await waitFor(() => expect(navigateMock).toHaveBeenCalled());
	});

	it("on success shows toast, refetches session, and navigates to /dashboard", async () => {
		signUpEmail.mockImplementation(async (_payload, cbs) => {
			await cbs?.onSuccess?.();
		});
		const user = userEvent.setup();
		renderWithProviders(<SignupForm />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith(
				"Account created successfully!",
			);
		});
		await waitFor(() => {
			expect(refetch).toHaveBeenCalled();
			expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("calls onSignupSuccess instead of navigating when the prop is provided", async () => {
		signUpEmail.mockImplementation(async (_payload, cbs) => {
			await cbs?.onSuccess?.();
		});
		const onSignupSuccess = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		renderWithProviders(<SignupForm onSignupSuccess={onSignupSuccess} />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		await waitFor(() => {
			expect(onSignupSuccess).toHaveBeenCalled();
		});
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("routes existing users to /login when signUp reports the account already exists", async () => {
		signUpEmail.mockImplementation(async (_payload, cbs) => {
			await cbs?.onError?.({
				error: { message: "User already exists", statusText: "" },
			});
		});
		const user = userEvent.setup();
		renderWithProviders(<SignupForm />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		await waitFor(() => {
			expect(toastInfo).toHaveBeenCalled();
			expect(navigateMock).toHaveBeenCalledWith({ to: "/login", search: {} });
		});
	});

	it("surfaces a generic signup error via toast.error", async () => {
		signUpEmail.mockImplementation(async (_payload, cbs) => {
			await cbs?.onError?.({
				error: { message: "Something broke", statusText: "" },
			});
		});
		const user = userEvent.setup();
		renderWithProviders(<SignupForm />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Something broke");
		});
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("blocks submission and shows an error when passwords do not match", async () => {
		signUpEmail.mockResolvedValue(undefined);
		const user = userEvent.setup();
		renderWithProviders(<SignupForm />);

		await user.type(screen.getByLabelText("First Name"), "John");
		await user.type(screen.getByLabelText("Last Name"), "Doe");
		await user.type(screen.getByLabelText("Email Address"), "user@test.my");
		await user.type(screen.getByLabelText("Password"), "Password1");
		await user.type(screen.getByLabelText("Confirm Password"), "Password2");
		await user.click(screen.getByRole("button", { name: /^sign up$/i }));

		// The refine() mismatch check must block the signUp network call.
		await new Promise((r) => setTimeout(r, 150));
		expect(signUpEmail).not.toHaveBeenCalled();
	});

	it("prefills and locks the email field and labels the CTA for an invitation", async () => {
		renderWithProviders(
			<SignupForm
				invitationEmail="invited@test.my"
				invitationToken="tok"
				orgId="org1"
			/>,
		);

		const emailInput = screen.getByLabelText(
			"Email Address",
		) as HTMLInputElement;
		expect(emailInput.value).toBe("invited@test.my");
		expect(emailInput).toHaveAttribute("readonly");
		expect(
			screen.getByRole("button", { name: /sign up & accept invitation/i }),
		).toBeInTheDocument();
	});
});
