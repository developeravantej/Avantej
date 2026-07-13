/**
 * AnnouncementsViewPage BEHAVIORAL tests (Plan 5, Task 2).
 * Pins the create / update / pin / deactivate mutation payloads and the
 * client-side validation in handleSubmit. Scope-injection is covered
 * separately by announcements-page-scope.test.tsx (left untouched).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import type {
	AnnouncementRow,
	FormState,
} from "@/components/pages/announcements/types";

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
const toastError = vi.fn();
vi.mock("sonner", () => ({
	toast: {
		success: (...a: unknown[]) => toastSuccess(...a),
		error: (...a: unknown[]) => toastError(...a),
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: undefined,
		isAllScope: true,
		activeScopeId: null,
		accessibleNodeIds: [],
		scopeNodes: [],
		topAccessibleNodeId: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Interactive stubs — drive the page's own state/handlers ──────────────
vi.mock("@/components/pages/announcements/AnnouncementsFilterRail", () => ({
	AnnouncementsFilterRail: () => <div data-testid="filter-rail" />,
}));
vi.mock("@/components/pages/announcements/AnnouncementsEmptyState", () => ({
	AnnouncementsEmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock("@/components/pages/announcements/AnnouncementListItem", () => ({
	AnnouncementListItem: ({
		row,
		onPin,
		onEdit,
		onDeactivate,
	}: {
		row: AnnouncementRow;
		onPin: (id: string, isPinned: boolean) => void;
		onEdit: (row: AnnouncementRow) => void;
		onDeactivate: (id: string) => void;
	}) => (
		<div data-testid={`item-${row.id}`}>
			<span>{row.title}</span>
			<button type="button" onClick={() => onPin(row.id, !row.isPinned)}>
				stub-pin
			</button>
			<button type="button" onClick={() => onEdit(row)}>
				stub-edit
			</button>
			<button type="button" onClick={() => onDeactivate(row.id)}>
				stub-deactivate
			</button>
		</div>
	),
}));

// Form dialog stub: fills the page-owned form state, then submits.
vi.mock("@/components/pages/announcements/AnnouncementFormDialog", () => ({
	AnnouncementFormDialog: ({
		open,
		editingId,
		form,
		onFormChange,
		onSubmit,
	}: {
		open: boolean;
		editingId: string | null;
		form: FormState;
		onFormChange: (f: FormState) => void;
		onSubmit: (e: React.FormEvent) => void;
	}) =>
		open ? (
			<div data-testid="form-dialog" data-editing-id={editingId ?? ""}>
				<span data-testid="form-title-value">{form.title}</span>
				<button
					type="button"
					onClick={() =>
						onFormChange({
							...form,
							title: "Gym closed for Raya",
							message: "We reopen on Tuesday.",
							priority: "high",
							targetAudience: "clients",
							startDate: "2026-07-15T09:00",
							endDate: "2026-07-16T09:00",
							isPinned: true,
							requiresAcknowledgement: true,
							scopedBranchIds: ["branch-1"],
						})
					}
				>
					stub-fill-form
				</button>
				<button
					type="button"
					onClick={() =>
						onFormChange({
							...form,
							title: "Bad dates",
							message: "end before start",
							startDate: "2026-07-16T09:00",
							endDate: "2026-07-15T09:00",
						})
					}
				>
					stub-fill-bad-dates
				</button>
				<button
					type="button"
					onClick={() =>
						onSubmit({ preventDefault: () => {} } as React.FormEvent)
					}
				>
					stub-submit
				</button>
			</div>
		) : null,
}));

vi.mock("@/components/pages/announcements/AnnouncementDeleteDialog", () => ({
	AnnouncementDeleteDialog: ({
		open,
		onConfirm,
	}: {
		open: boolean;
		onConfirm: () => void;
	}) =>
		open ? (
			<button type="button" onClick={onConfirm}>
				stub-confirm-delete
			</button>
		) : null,
}));

vi.mock(
	"@/components/pages/announcements/AnnouncementDeactivateDialog",
	() => ({
		AnnouncementDeactivateDialog: ({
			open,
			onConfirm,
		}: {
			open: boolean;
			onConfirm: () => void;
		}) =>
			open ? (
				<button type="button" onClick={onConfirm}>
					stub-confirm-deactivate
				</button>
			) : null,
	}),
);

import { AnnouncementsViewPage } from "@/components/pages/announcements/AnnouncementsViewPage";

const existingRow = {
	id: "ann-1",
	title: "Old title",
	message: "Old message",
	priority: "normal",
	targetAudience: "all",
	branchId: null,
	startDate: null,
	endDate: null,
	isPinned: false,
	isActive: true,
	requiresAcknowledgement: false,
	createdAt: "2026-07-01T00:00:00Z",
	scopedBranchIds: [],
};

describe("AnnouncementsViewPage behavior (create/update/pin/deactivate)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.announcements.list.mockResolvedValue([existingRow]);
		mockClient.hierarchy.listNodes.mockResolvedValue({ nodes: [] });
		mockClient.announcements.create.mockResolvedValue({ id: "ann-new" });
		mockClient.announcements.update.mockResolvedValue({ id: "ann-1" });
		mockClient.announcements.delete.mockResolvedValue({ ok: true });
	});

	it("creates an announcement with the full payload incl. ISO dates", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(await screen.findByRole("button", { name: "New" }));
		await user.click(screen.getByRole("button", { name: "stub-fill-form" }));
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(mockClient.announcements.create).toHaveBeenCalledTimes(1);
		});
		const payload = mockClient.announcements.create.mock.calls[0][0];
		expect(payload).toMatchObject({
			organizationId: "org-1",
			title: "Gym closed for Raya",
			message: "We reopen on Tuesday.",
			priority: "high",
			targetAudience: "clients",
			isPinned: true,
			requiresAcknowledgement: true,
			scopedBranchIds: ["branch-1"],
		});
		// Dates are converted from datetime-local to ISO strings.
		expect(payload.startDate).toBe(new Date("2026-07-15T09:00").toISOString());
		expect(payload.endDate).toBe(new Date("2026-07-16T09:00").toISOString());
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith(
				"Announcement created successfully.",
			);
		});
	});

	it("updates an existing announcement with its id and prefilled form", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(await screen.findByRole("button", { name: "stub-edit" }));
		// Edit mode: dialog opens against the row id with the row's title prefilled.
		const dialog = await screen.findByTestId("form-dialog");
		expect(dialog).toHaveAttribute("data-editing-id", "ann-1");
		expect(screen.getByTestId("form-title-value")).toHaveTextContent(
			"Old title",
		);

		await user.click(screen.getByRole("button", { name: "stub-fill-form" }));
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(mockClient.announcements.update).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.announcements.update.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			id: "ann-1",
			title: "Gym closed for Raya",
		});
		expect(mockClient.announcements.create).not.toHaveBeenCalled();
	});

	it("pins via a minimal update payload (id + isPinned only)", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(await screen.findByRole("button", { name: "stub-pin" }));

		await waitFor(() => {
			expect(mockClient.announcements.update).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.announcements.update.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			id: "ann-1",
			isPinned: true,
		});
	});

	it("deactivates via update isActive:false after confirmation", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(
			await screen.findByRole("button", { name: "stub-deactivate" }),
		);
		await user.click(
			await screen.findByRole("button", { name: "stub-confirm-deactivate" }),
		);

		await waitFor(() => {
			expect(mockClient.announcements.update).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.announcements.update.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			id: "ann-1",
			isActive: false,
		});
	});

	it("blocks submit when title/message are empty", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(await screen.findByRole("button", { name: "New" }));
		// Submit the untouched EMPTY_FORM.
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"Title and message are required.",
			);
		});
		expect(mockClient.announcements.create).not.toHaveBeenCalled();
	});

	it("blocks submit when endDate is not after startDate", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AnnouncementsViewPage />);

		await user.click(await screen.findByRole("button", { name: "New" }));
		await user.click(
			screen.getByRole("button", { name: "stub-fill-bad-dates" }),
		);
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"End Date must be after Start Date.",
			);
		});
		expect(mockClient.announcements.create).not.toHaveBeenCalled();
	});
});
