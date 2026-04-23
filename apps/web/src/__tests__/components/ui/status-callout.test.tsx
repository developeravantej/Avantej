import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusCallout } from "@/components/ui/status-callout";

describe("StatusCallout", () => {
	describe("smoke tests — all 4 variants render without throwing", () => {
		const variants = ["success", "warning", "error", "info"] as const;

		for (const variant of variants) {
			test(`renders variant="${variant}" without throwing`, () => {
				expect(() =>
					render(
						<StatusCallout variant={variant} message="Test message" />,
					),
				).not.toThrow();
			});
		}
	});

	describe("retry button", () => {
		test("error variant shows Retry button when onRetry is provided", () => {
			const onRetry = vi.fn();
			render(
				<StatusCallout variant="error" message="Something failed" onRetry={onRetry} />,
			);
			expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
		});

		test("error variant does NOT show Retry button when onRetry is absent", () => {
			render(<StatusCallout variant="error" message="Something failed" />);
			expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
		});

		test("non-error variant does NOT show Retry button even when onRetry is provided", () => {
			// onRetry is intentionally typed as optional; UI only shows it for error
			render(
				<StatusCallout
					variant="info"
					message="FYI"
					onRetry={() => {}}
				/>,
			);
			expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
		});
	});

	describe("dismiss button", () => {
		test("dismiss button appears when onDismiss is provided", () => {
			const onDismiss = vi.fn();
			render(
				<StatusCallout
					variant="info"
					message="Dismissable"
					onDismiss={onDismiss}
				/>,
			);
			expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
		});

		test("dismiss button is NOT rendered when onDismiss is absent", () => {
			render(<StatusCallout variant="success" message="No dismiss" />);
			expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
		});

		test("clicking dismiss calls onDismiss", async () => {
			const user = userEvent.setup();
			const onDismiss = vi.fn();
			render(
				<StatusCallout
					variant="warning"
					message="Close me"
					onDismiss={onDismiss}
				/>,
			);
			await user.click(screen.getByRole("button", { name: /dismiss/i }));
			expect(onDismiss).toHaveBeenCalledTimes(1);
		});
	});

	describe("message prop (backwards compat)", () => {
		test("message prop renders as body text when children is absent", () => {
			render(<StatusCallout variant="info" message="Hello from message prop" />);
			expect(screen.getByText("Hello from message prop")).toBeTruthy();
		});

		test("children take precedence over message prop", () => {
			render(
				<StatusCallout variant="info" message="Should not appear">
					<span>Children content</span>
				</StatusCallout>,
			);
			expect(screen.getByText("Children content")).toBeTruthy();
			expect(screen.queryByText("Should not appear")).toBeNull();
		});
	});

	describe("custom icon prop", () => {
		test("custom icon overrides the default per-variant icon", () => {
			render(
				<StatusCallout
					variant="success"
					message="Custom icon test"
					icon={<span data-testid="custom-icon">★</span>}
				/>,
			);
			expect(screen.getByTestId("custom-icon")).toBeTruthy();
		});
	});

	describe("aria roles", () => {
		test('error variant has role="alert"', () => {
			render(<StatusCallout variant="error" message="Error occurred" />);
			expect(screen.getByRole("alert")).toBeTruthy();
		});

		test('success variant has role="status"', () => {
			render(<StatusCallout variant="success" message="Success!" />);
			expect(screen.getByRole("status")).toBeTruthy();
		});

		test('warning variant has role="status"', () => {
			render(<StatusCallout variant="warning" message="Warning!" />);
			expect(screen.getByRole("status")).toBeTruthy();
		});

		test('info variant has role="status"', () => {
			render(<StatusCallout variant="info" message="Info" />);
			expect(screen.getByRole("status")).toBeTruthy();
		});
	});

	describe("title prop", () => {
		test("title is rendered when provided", () => {
			render(
				<StatusCallout variant="info" title="Heads up" message="Some detail" />,
			);
			expect(screen.getByText("Heads up")).toBeTruthy();
			expect(screen.getByText("Some detail")).toBeTruthy();
		});

		test("title is absent from DOM when not provided", () => {
			const { container } = render(
				<StatusCallout variant="info" message="No title here" />,
			);
			// The only text should be the message
			expect(container.querySelectorAll("p")).toHaveLength(1);
		});
	});

	describe("className prop", () => {
		test("additional className is forwarded to the container", () => {
			const { container } = render(
				<StatusCallout
					variant="info"
					message="Custom class"
					className="my-extra-class"
				/>,
			);
			const callout = container.firstChild as HTMLElement;
			expect(callout.className).toMatch(/my-extra-class/);
		});
	});
});
