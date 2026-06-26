import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import type {
	ScopeContextValue,
	ScopeNode,
} from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

const setActiveScope = vi.fn();
const resetScope = vi.fn();

// Mutable holder the mock reads on every render.
let scopeValue: ScopeContextValue;

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => scopeValue,
}));

function node(
	partial: Partial<ScopeNode> & { id: string; name: string },
): ScopeNode {
	return {
		type: "branch",
		depth: 2,
		parentId: null,
		createdAt: null,
		updatedAt: null,
		...partial,
	} as ScopeNode;
}

const MY = node({ id: "n-my", name: "Malaysia", type: "country", depth: 0 });
const KL = node({
	id: "n-kl",
	name: "KL Branch",
	type: "branch",
	depth: 2,
	parentId: "n-sel",
});
const PJ = node({
	id: "n-pj",
	name: "PJ Branch",
	type: "branch",
	depth: 2,
	parentId: "n-sel",
});

function makeScope(overrides: Partial<ScopeContextValue>): ScopeContextValue {
	return {
		activeScopeId: "n-my",
		activeScopeNode: MY,
		setActiveScope,
		resetScope,
		accessibleNodeIds: ["n-my", "n-kl", "n-pj"],
		scopeNodes: [MY, KL, PJ],
		topAccessibleNodeId: "n-my",
		isAllScope: true,
		scopeNodeId: undefined,
		isScopeReady: true,
		...overrides,
	};
}

describe("ScopeSwitcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		scopeValue = makeScope({});
	});

	test("renders nothing until scope is ready", () => {
		scopeValue = makeScope({ isScopeReady: false });
		const { container } = renderWithProviders(<ScopeSwitcher />);
		expect(container).toBeEmptyDOMElement();
	});

	test("renders a static label (no combobox) when only one node is accessible", () => {
		scopeValue = makeScope({
			scopeNodes: [KL],
			accessibleNodeIds: ["n-kl"],
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			topAccessibleNodeId: "n-kl",
			isAllScope: true,
			scopeNodeId: undefined,
		});
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByTestId("scope-switcher-static")).toHaveTextContent(
			"KL Branch",
		);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	test("trigger shows an 'All' label when isAllScope", () => {
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByRole("combobox")).toHaveTextContent(/All/);
	});

	test("trigger shows the active node name when narrowed to one branch", () => {
		scopeValue = makeScope({
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			isAllScope: false,
			scopeNodeId: "n-kl",
		});
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByRole("combobox")).toHaveTextContent("KL Branch");
	});

	test("opening lists the 'All' entry plus each accessible descendant", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));

		const options = await screen.findAllByRole("option");
		// All + KL + PJ — the top node (Malaysia) is represented by "All", not listed twice.
		expect(options).toHaveLength(3);
		expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
			"All",
		);
		expect(screen.getByText("KL Branch")).toBeInTheDocument();
		expect(screen.getByText("PJ Branch")).toBeInTheDocument();
	});

	test("selecting a branch calls setActiveScope with its node id", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByText("PJ Branch"));
		expect(setActiveScope).toHaveBeenCalledWith("n-pj");
	});

	test("selecting 'All' calls resetScope", async () => {
		const user = userEvent.setup();
		scopeValue = makeScope({
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			isAllScope: false,
			scopeNodeId: "n-kl",
		});
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByRole("option", { name: /All/ }));
		expect(resetScope).toHaveBeenCalledTimes(1);
	});

	test("typing in the search box filters the descendant list and hides 'All'", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.type(
			await screen.findByPlaceholderText("Search branches..."),
			"PJ",
		);
		expect(screen.getByText("PJ Branch")).toBeInTheDocument();
		expect(screen.queryByText("KL Branch")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /^All/ }),
		).not.toBeInTheDocument();
	});
});
