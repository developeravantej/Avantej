import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// oRPC: client stubs + queryOptions wired through the SAME mock client.
// `queryClient` is imported by useApiMutation — stub it.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Org id + full permissions so Create/Edit affordances render.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
	}),
}));

// boneyard-js Skeleton gates the body on a registry context jsdom lacks —
// render children directly so the data layer mounts cleanly.
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The rooms DataTable is heavy TanStack Table UI — stub it to surface row
// names and an Edit trigger per row so we can exercise the update flow.
vi.mock("@/components/tables/rooms/view/data-table", () => ({
	DataTable: ({
		data,
		onEdit,
	}: {
		data: Array<{ id: string; name: string }>;
		onEdit: (row: unknown) => void;
	}) => (
		<div data-testid="rooms-table">
			{data.map((r) => (
				<div key={r.id}>
					<span>{r.name}</span>
					<button type="button" onClick={() => onEdit(r)}>
						edit-{r.id}
					</button>
				</div>
			))}
		</div>
	),
}));

// Radix <Select> can't be reliably driven in jsdom — replace with a minimal
// implementation where each SelectItem is a plain button firing onValueChange.
vi.mock("@/components/ui/select", async () => {
	const React = await import("react");
	const Ctx = React.createContext<(v: string) => void>(() => {});
	return {
		Select: ({
			onValueChange,
			children,
		}: {
			onValueChange: (v: string) => void;
			children: React.ReactNode;
		}) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
		SelectTrigger: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		SelectValue: ({ placeholder }: { placeholder?: string }) => (
			<span>{placeholder}</span>
		),
		SelectContent: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		SelectItem: ({
			value,
			children,
		}: {
			value: string;
			children: React.ReactNode;
		}) => {
			const onChange = React.useContext(Ctx);
			return (
				<button type="button" onClick={() => onChange(value)}>
					{children}
				</button>
			);
		},
	};
});

import { RoomsPage } from "@/components/pages/services/rooms-page";

const ROOM_1 = {
	id: "room-1",
	name: "Studio A",
	type: "training",
	branchId: "branch-1",
	capacity: 12,
	isActive: true,
	createdAt: null,
	updatedAt: null,
};

describe("RoomsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.hierarchy.listNodes.mockResolvedValue({
			nodes: [{ id: "branch-1", name: "Main Branch", type: "branch" }],
		});
		mockClient.rooms.list.mockResolvedValue([ROOM_1]);
		mockClient.rooms.create.mockResolvedValue({ id: "room-new" });
		mockClient.rooms.update.mockResolvedValue({ id: "room-1" });
	});

	it("renders room rows from rooms.list (default filter: active)", async () => {
		renderWithProviders(<RoomsPage />);

		await waitFor(() => {
			expect(screen.getByText("Studio A")).toBeInTheDocument();
		});
		expect(
			(mockClient.rooms.list as unknown as Mock).mock.calls[0][0],
		).toMatchObject({ organizationId: "org-1", isActive: true });
	});

	it("Inactive filter pill re-queries with isActive: false", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RoomsPage />);
		await waitFor(() => {
			expect(screen.getByText("Studio A")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: "Inactive" }));

		await waitFor(() => {
			const calls = (mockClient.rooms.list as unknown as Mock).mock.calls;
			expect(calls.some(([input]) => input.isActive === false)).toBe(true);
		});
	});

	it("create flow submits rooms.create with the entered payload", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RoomsPage />);
		await waitFor(() => {
			expect(screen.getByText("Studio A")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /create room/i }));
		const dialog = await screen.findByRole("dialog");

		await user.type(within(dialog).getByLabelText(/name/i), "Studio Z");
		await user.click(within(dialog).getByRole("button", { name: "Training" }));
		await user.type(within(dialog).getByLabelText(/capacity/i), "10");

		// BranchCombobox: focus opens the option list; pick the branch.
		await user.click(within(dialog).getByPlaceholderText("Search branch..."));
		await user.click(
			within(dialog).getByRole("button", { name: "Main Branch" }),
		);

		await user.click(
			within(dialog).getByRole("button", { name: "Create Room" }),
		);

		await waitFor(() => {
			expect(mockClient.rooms.create as unknown as Mock).toHaveBeenCalledWith({
				organizationId: "org-1",
				name: "Studio Z",
				type: "training",
				capacity: 10,
				branchId: "branch-1",
			});
		});
	});

	it("edit flow submits rooms.update with the edited payload", async () => {
		const user = userEvent.setup();
		renderWithProviders(<RoomsPage />);
		await waitFor(() => {
			expect(screen.getByText("Studio A")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: "edit-room-1" }));
		const dialog = await screen.findByRole("dialog");

		const capacityInput = within(dialog).getByLabelText(/capacity/i);
		await user.clear(capacityInput);
		await user.type(capacityInput, "20");

		await user.click(
			within(dialog).getByRole("button", { name: "Save Changes" }),
		);

		await waitFor(() => {
			expect(mockClient.rooms.update as unknown as Mock).toHaveBeenCalledWith({
				organizationId: "org-1",
				id: "room-1",
				name: "Studio A",
				type: "training",
				capacity: 20,
				branchId: "branch-1",
				isActive: true,
			});
		});
	});

	it("rejects create when capacity is invalid (no API call)", async () => {
		const { toast } = await import("sonner");
		const user = userEvent.setup();
		renderWithProviders(<RoomsPage />);
		await waitFor(() => {
			expect(screen.getByText("Studio A")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /create room/i }));
		const dialog = await screen.findByRole("dialog");

		await user.type(within(dialog).getByLabelText(/name/i), "Bad Room");
		await user.click(within(dialog).getByRole("button", { name: "Training" }));
		// capacity left empty → parseInt("") is NaN → validation error
		await user.click(
			within(dialog).getByRole("button", { name: "Create Room" }),
		);

		expect(toast.error).toHaveBeenCalledWith("Capacity must be at least 1");
		expect(mockClient.rooms.create as unknown as Mock).not.toHaveBeenCalled();
	});
});
