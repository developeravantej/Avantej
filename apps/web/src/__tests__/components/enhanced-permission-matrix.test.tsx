import { describe, test, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { EnhancedPermissionMatrix } from "@/components/access-control/permission-matrix/EnhancedPermissionMatrix";
import type {
	Role,
	PermissionResource,
} from "@/components/access-control/permission-matrix/permission-matrix.types";

// Mobile branch uses plain buttons for toggle (easier to drive in jsdom than
// Radix Select, which relies on pointer-capture APIs that jsdom doesn't ship).
// The toggle callback contract is identical in both branches — asserting it
// from the mobile branch exercises the same code path.
vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => true,
}));

// Patch pointer-capture APIs for any Radix elements that may still appear.
beforeAll(() => {
	if (!(HTMLElement.prototype as any).hasPointerCapture) {
		(HTMLElement.prototype as any).hasPointerCapture = () => false;
	}
	if (!(HTMLElement.prototype as any).releasePointerCapture) {
		(HTMLElement.prototype as any).releasePointerCapture = () => {};
	}
	if (!(HTMLElement.prototype as any).setPointerCapture) {
		(HTMLElement.prototype as any).setPointerCapture = () => {};
	}
	if (!(HTMLElement.prototype as any).scrollIntoView) {
		(HTMLElement.prototype as any).scrollIntoView = () => {};
	}
});

const FIXTURE_RESOURCES: PermissionResource[] = [
	{
		id: "users",
		name: "users",
		description: "User management",
		actions: [
			{ id: "create", name: "create", description: "Create a user" },
			{ id: "read", name: "read", description: "Read a user" },
		],
	},
];

const FIXTURE_ROLES: Role[] = [
	{
		id: "role-admin",
		name: "Admin Role",
		description: "Admin role for tests",
		priority: 1,
		permissions: [{ resourceId: "users", actionId: "read", scope: "own" }],
	},
];

describe("EnhancedPermissionMatrix (smoke)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("renders role name in the mobile card header", () => {
		renderWithProviders(
			<EnhancedPermissionMatrix
				roles={FIXTURE_ROLES}
				resources={FIXTURE_RESOURCES}
				onPermissionChange={() => {}}
				hideControls
			/>,
		);

		// Role header renders (always visible, even before expansion)
		expect(screen.getByText("Admin Role")).toBeInTheDocument();
	});

	test("expanding the role card reveals the resource name and action cells", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<EnhancedPermissionMatrix
				roles={FIXTURE_ROLES}
				resources={FIXTURE_RESOURCES}
				onPermissionChange={() => {}}
				hideControls
			/>,
		);

		// Click the role card header to expand its collapsible.
		await user.click(screen.getByText("Admin Role"));

		// Resource name renders (formatted Title Case)
		expect(screen.getByText("Users")).toBeInTheDocument();

		// Both action rows render
		expect(screen.getByText("Create")).toBeInTheDocument();
		expect(screen.getByText("Read")).toBeInTheDocument();
	});

	test("toggling a cell invokes onPermissionChange with the scope-cycle contract", async () => {
		const user = userEvent.setup();
		const spy = vi.fn();

		renderWithProviders(
			<EnhancedPermissionMatrix
				roles={FIXTURE_ROLES}
				resources={FIXTURE_RESOURCES}
				onPermissionChange={spy}
				hideControls
			/>,
		);

		// Expand the role's collapsible.
		await user.click(screen.getByText("Admin Role"));

		// After expansion, every action description row is present; the small
		// circular toggle button is the immediate sibling of the action text.
		// The "Create" action starts with no permission → first toggle should
		// grant "own".
		const createRow = screen.getByText("Create").closest("div")?.parentElement
			?.parentElement as HTMLElement;
		const createToggle = createRow.querySelector("button");
		expect(createToggle).not.toBeNull();

		await user.click(createToggle as HTMLElement);

		expect(spy).toHaveBeenCalledTimes(1);
		const [roleId, resourceId, actionId, enabled, scope] = spy.mock.calls[0];
		expect(roleId).toBe("role-admin");
		expect(resourceId).toBe("users");
		expect(actionId).toBe("create");
		expect(enabled).toBe(true);
		expect(scope).toBe("own");
	});
});
