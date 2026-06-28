import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScopeContextValue } from "@/components/scope/ScopeProvider";

// <Link> ("New Sale" CTA) needs router context jsdom lacks — stub to children.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Drive the real ScopeSwitcher via a mocked useScope so the header renders it.
let scopeValue: ScopeContextValue;
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => scopeValue,
}));

import { DashboardHeader } from "@/components/pages/dashboard/DashboardHeader";

function makeScope(overrides: Partial<ScopeContextValue>): ScopeContextValue {
	return {
		activeScopeId: "n-my",
		activeScopeNode: {
			id: "n-my",
			name: "Malaysia",
			type: "country",
			depth: 0,
			parentId: null,
			createdAt: null,
			updatedAt: null,
		} as ScopeContextValue["activeScopeNode"],
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["n-my", "n-kl"],
		scopeNodes: [
			{
				id: "n-my",
				name: "Malaysia",
				type: "country",
				depth: 0,
				parentId: null,
				createdAt: null,
				updatedAt: null,
			},
			{
				id: "n-kl",
				name: "KL Branch",
				type: "branch",
				depth: 2,
				parentId: "n-my",
				createdAt: null,
				updatedAt: null,
			},
		] as ScopeContextValue["scopeNodes"],
		topAccessibleNodeId: "n-my",
		isAllScope: true,
		scopeNodeId: undefined,
		isScopeReady: true,
		...overrides,
	};
}

describe("DashboardHeader — scope switcher", () => {
	test("renders the ScopeSwitcher combobox in the Overview header", () => {
		scopeValue = makeScope({});
		render(
			<DashboardHeader
				period="this_month"
				onSelectPeriod={() => {}}
				onRefresh={() => {}}
			/>,
		);
		// Multi-node accessible → switcher renders as a combobox.
		expect(screen.getByRole("combobox")).toHaveTextContent(/All/);
	});
});
