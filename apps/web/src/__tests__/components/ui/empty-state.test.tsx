import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

// Minimal mock LucideIcon component for testing custom icon prop.
// Cast via `unknown` because LucideIcon is ForwardRefExoticComponent and our
// simple function component doesn't carry `$$typeof` at the type level.
const MockIcon = ((props: React.SVGProps<SVGSVGElement>) => (
	<svg data-testid="mock-icon" {...props} />
)) as unknown as LucideIcon;

describe("EmptyState", () => {
	test("renders title text", () => {
		render(<EmptyState title="No results found" />);
		expect(screen.getByText("No results found")).toBeInTheDocument();
	});

	test("renders description when provided", () => {
		render(
			<EmptyState
				title="No results found"
				description="Try adjusting your search filters."
			/>,
		);
		expect(
			screen.getByText("Try adjusting your search filters."),
		).toBeInTheDocument();
	});

	test("does NOT render description when omitted", () => {
		render(<EmptyState title="No results found" />);
		expect(
			screen.queryByText("Try adjusting your search filters."),
		).not.toBeInTheDocument();
	});

	test("renders CTA button when action provided and context is empty (default)", () => {
		const handleClick = vi.fn();
		render(
			<EmptyState
				title="No results found"
				action={{ label: "Add item", onClick: handleClick }}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Add item" }),
		).toBeInTheDocument();
	});

	test("does NOT render CTA when context is search", () => {
		const handleClick = vi.fn();
		render(
			<EmptyState
				title="No results found"
				action={{ label: "Add item", onClick: handleClick }}
				context="search"
			/>,
		);
		expect(
			screen.queryByRole("button", { name: "Add item" }),
		).not.toBeInTheDocument();
	});

	test("does NOT render CTA when action is undefined", () => {
		render(<EmptyState title="No results found" />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("custom icon prop replaces default Inbox icon", () => {
		render(<EmptyState title="No results found" icon={MockIcon} />);
		expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
	});

	test("CTA onClick fires when clicked", () => {
		const handleClick = vi.fn();
		render(
			<EmptyState
				title="No results found"
				action={{ label: "Add item", onClick: handleClick }}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Add item" }));
		expect(handleClick).toHaveBeenCalledTimes(1);
	});
});
