/**
 * Notifications view unit test (Plan 5, Task 2).
 * Pins the list / markRead / markAllRead wiring on
 * routes/_authenticated/dashboard/_layout/notifications/view.lazy.tsx.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let RouteComponent: React.ComponentType;

vi.mock("@tanstack/react-router", () => ({
	createLazyFileRoute: () => (opts: { component: React.ComponentType }) => {
		RouteComponent = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

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

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
	toast: {
		success: (...a: unknown[]) => toastSuccess(...a),
		error: vi.fn(),
	},
}));

let currentOrgId: string | null = "org-1";
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: currentOrgId, organizations: [] },
	}),
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Table stub that still renders the page-defined "actions" column cell so the
// per-row Mark Read wiring is exercised.
vi.mock("@/components/tables/sales/view/data-table", () => ({
	default: ({
		columns,
		data,
	}: {
		columns: Array<{
			id?: string;
			cell?: (ctx: {
				row: { original: Record<string, unknown> };
			}) => React.ReactNode;
		}>;
		data: Array<Record<string, unknown>>;
	}) => {
		const actionsCol = columns.find((c) => c.id === "actions");
		return (
			<div data-testid="notifications-table">
				{data.map((row) => (
					<div key={String(row.id)} data-testid={`row-${row.id}`}>
						<span>{String(row.title)}</span>
						{actionsCol?.cell?.({ row: { original: row } })}
					</div>
				))}
			</div>
		);
	},
}));

const notifications = [
	{
		id: "n-1",
		title: "Payment received",
		message: "RM 300 received",
		type: "payment",
		isRead: false,
		createdAt: "2026-07-01T10:00:00Z",
	},
	{
		id: "n-2",
		title: "Membership expiring",
		message: "Expires soon",
		type: "membership",
		isRead: true,
		createdAt: "2026-07-02T10:00:00Z",
	},
];

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/notifications/view.lazy"
	);
});

describe("Notifications view (RouteComponent)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentOrgId = "org-1";
		mockClient.notifications.list.mockResolvedValue(notifications);
		mockClient.notifications.markRead.mockResolvedValue({ ok: true });
		mockClient.notifications.markAllRead.mockResolvedValue({ ok: true });
	});

	it("lists notifications for the current org", async () => {
		renderWithProviders(<RouteComponent />);

		expect(await screen.findByText("Payment received")).toBeInTheDocument();
		expect(screen.getByText("Membership expiring")).toBeInTheDocument();
		expect(mockClient.notifications.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
		});
	});

	it("marks a single notification read via markRead (unread rows only)", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RouteComponent />);

		await screen.findByText("Payment received");
		// Only the unread row (n-1) renders a Mark Read action.
		const markReadButtons = screen.getAllByRole("button", {
			name: "Mark Read",
		});
		expect(markReadButtons).toHaveLength(1);

		await user.click(markReadButtons[0]);

		await waitFor(() => {
			expect(mockClient.notifications.markRead).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.notifications.markRead.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			id: "n-1",
		});
	});

	it("marks everything read via markAllRead", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RouteComponent />);

		const btn = await screen.findByRole("button", {
			name: "Mark All as Read",
		});
		await user.click(btn);

		await waitFor(() => {
			expect(mockClient.notifications.markAllRead).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.notifications.markAllRead.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("All marked as read");
		});
	});

	it("re-queries with isRead=false when the Unread tab is selected", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RouteComponent />);

		await screen.findByText("Payment received");
		await user.click(screen.getByRole("button", { name: "Unread" }));

		await waitFor(() => {
			const calls = mockClient.notifications.list.mock.calls.map((c) => c[0]);
			expect(calls.some((i) => i.isRead === false)).toBe(true);
		});
	});

	it("disables Mark All as Read and shows the empty state when there are no rows", async () => {
		mockClient.notifications.list.mockResolvedValue([]);
		renderWithProviders(<RouteComponent />);

		expect(await screen.findByText("No notifications")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Mark All as Read" }),
		).toBeDisabled();
	});

	it("guards when no organization is selected", async () => {
		currentOrgId = null;
		renderWithProviders(<RouteComponent />);

		expect(
			await screen.findByText("Select an organization to view notifications."),
		).toBeInTheDocument();
		expect(mockClient.notifications.list).not.toHaveBeenCalled();
	});
});
