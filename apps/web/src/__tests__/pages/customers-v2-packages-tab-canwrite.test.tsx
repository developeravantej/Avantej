import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

/**
 * PackagesTab (customer profile v2) — canWrite derivation.
 *
 * The row drawer's write actions are enforced server-side by exactly two
 * permissions: package_management:update (lifecycle unlock/freeze) and
 * service_management:update (confirm-payment / agreement / payment-proof).
 * The tab must pass canWrite=false to the drawer when the user holds
 * neither, and true when they hold at least one — never a hardcoded true.
 */

// Mutable permission set — each test seeds the permissions it wants.
let grantedPermissions: string[] = [];

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: {
		invalidateQueries: () => Promise.resolve(),
		setQueryData: () => {},
		getQueryData: () => undefined,
		clear: () => {},
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: { nodes: [], member: { accessibleNodeIds: [] } },
				},
			],
		},
		hasPermission: (perm: string) => grantedPermissions.includes(perm),
		hasRole: () => false,
	}),
}));

vi.mock("@/hooks/useDebounce", () => ({
	useDebounce: (val: unknown) => val,
}));

// Filters bar is irrelevant to the permission wiring — stub it out.
vi.mock(
	"@/components/pages/customers/v2/packages-tab-filters",
	async (importOriginal) => {
		const actual = (await importOriginal()) as Record<string, unknown>;
		return { ...actual, PackagesTabFilters: () => null };
	},
);

vi.mock("@/components/pages/customers/v2/package-instance-row", () => ({
	PackageInstanceRow: () => null,
}));

// Capture the canWrite prop the tab hands to the drawer.
const drawerProps: Array<{ canWrite: boolean }> = [];
vi.mock("@/components/pages/customers/v2/packages-tab-row-drawer", () => ({
	PackagesTabRowDrawer: (props: { canWrite: boolean }) => {
		drawerProps.push({ canWrite: props.canWrite });
		return (
			<div data-testid="row-drawer" data-can-write={String(props.canWrite)} />
		);
	},
}));

import { PackagesTab } from "@/components/pages/customers/v2/packages-tab";

async function renderTab() {
	const utils = renderWithProviders(
		<PackagesTab
			organizationId="org-1"
			clientUserId="nanoid-user-1"
			accessibleNodeIds={[]}
		/>,
	);
	await waitFor(() => {
		expect(utils.getByTestId("row-drawer")).toBeTruthy();
	});
	return utils;
}

describe("PackagesTab canWrite", () => {
	beforeEach(() => {
		drawerProps.length = 0;
		grantedPermissions = [];
		vi.mocked(mockClient.packageInstances.listAll).mockResolvedValue([]);
		vi.mocked(mockClient.installmentPlans.list).mockResolvedValue([]);
	});

	it("passes canWrite=false to the drawer when the user has no write permission", async () => {
		grantedPermissions = ["customer_management:read"];
		const utils = await renderTab();
		expect(utils.getByTestId("row-drawer").getAttribute("data-can-write")).toBe(
			"false",
		);
		expect(drawerProps.every((p) => p.canWrite === false)).toBe(true);
	});

	it("passes canWrite=true with package_management:update", async () => {
		grantedPermissions = ["package_management:update"];
		const utils = await renderTab();
		expect(utils.getByTestId("row-drawer").getAttribute("data-can-write")).toBe(
			"true",
		);
	});

	it("passes canWrite=true with service_management:update", async () => {
		grantedPermissions = ["service_management:update"];
		const utils = await renderTab();
		expect(utils.getByTestId("row-drawer").getAttribute("data-can-write")).toBe(
			"true",
		);
	});
});
