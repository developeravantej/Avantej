/**
 * Commission cycle policy settings unit test (Plan 5, Task 3).
 * Pins the commissionCycle.list / delete / upsert wirings plus the
 * hierarchy.listNodes branch feed and the canEdit permission gate.
 * (Radix Select can't be driven in jsdom — the dialog tests stay on the
 * default calendar_month path and the edit-prefill path.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import type { Policy } from "@/components/pages/settings/commission-cycles/types";

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

const hasPermissionMock = vi.fn().mockReturnValue(true);
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: hasPermissionMock,
	}),
}));

// PolicyRow stub: surfaces the page-owned edit/delete callbacks per policy.
vi.mock("@/components/pages/settings/commission-cycles/PolicyRow", () => ({
	PolicyRow: ({
		policy,
		canEdit,
		onEdit,
		onDelete,
	}: {
		policy: Policy;
		canEdit: boolean;
		onEdit: () => void;
		onDelete: () => void;
	}) => (
		<tr data-testid={`policy-row-${policy.branchId ?? "tenant"}`}>
			<td>{policy.branchName ?? "Tenant default"}</td>
			<td>{policy.cycleType}</td>
			{canEdit ? (
				<td>
					<button type="button" onClick={onEdit}>
						stub-edit-{policy.branchId ?? "tenant"}
					</button>
					<button type="button" onClick={onDelete}>
						stub-delete-{policy.branchId ?? "tenant"}
					</button>
				</td>
			) : null}
		</tr>
	),
}));

import { CommissionCyclesPage } from "@/components/pages/settings/commission-cycles/CommissionCyclesPage";

const tenantPolicy: Policy = {
	id: "pol-tenant",
	branchId: null,
	branchName: null,
	cycleType: "calendar_month",
	anchorDay: null,
	updatedBy: null,
	updatedAt: new Date("2026-07-01T00:00:00Z"),
};

const branchPolicy: Policy = {
	id: "pol-branch",
	branchId: "branch-1",
	branchName: "Kota Kinabalu",
	cycleType: "monthly_anchored",
	anchorDay: 22,
	updatedBy: null,
	updatedAt: new Date("2026-07-01T00:00:00Z"),
};

describe("CommissionCyclesPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasPermissionMock.mockReturnValue(true);
		mockClient.commissionCycle.list.mockResolvedValue({
			policies: [tenantPolicy, branchPolicy],
		});
		mockClient.hierarchy.listNodes.mockResolvedValue({
			nodes: [
				{ id: "branch-1", name: "Kota Kinabalu", type: "branch" },
				{ id: "branch-2", name: "Penang", type: "branch" },
				{ id: "region-1", name: "Borneo", type: "region" },
			],
		});
		mockClient.commissionCycle.delete.mockResolvedValue({ ok: true });
		mockClient.commissionCycle.upsert.mockResolvedValue({ id: "pol-x" });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("lists the tenant-wide default and branch overrides from commissionCycle.list", async () => {
		renderWithProviders(<CommissionCyclesPage />);

		expect(await screen.findByTestId("policy-row-tenant")).toBeInTheDocument();
		expect(screen.getByTestId("policy-row-branch-1")).toBeInTheDocument();
		expect(mockClient.commissionCycle.list.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
		});
	});

	it("deletes the tenant-wide policy with branchId null after confirm", async () => {
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
		const user = userEvent.setup();
		renderWithProviders(<CommissionCyclesPage />);

		await user.click(
			await screen.findByRole("button", { name: "stub-delete-tenant" }),
		);

		await waitFor(() => {
			expect(mockClient.commissionCycle.delete).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.commissionCycle.delete.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			branchId: null,
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Cycle policy deleted.");
		});
	});

	it("deletes a branch override with its branchId, and does nothing when confirm is declined", async () => {
		const confirmFn = vi.fn().mockReturnValue(false);
		vi.stubGlobal("confirm", confirmFn);
		const user = userEvent.setup();
		renderWithProviders(<CommissionCyclesPage />);

		await user.click(
			await screen.findByRole("button", { name: "stub-delete-branch-1" }),
		);
		expect(confirmFn).toHaveBeenCalled();
		expect(mockClient.commissionCycle.delete).not.toHaveBeenCalled();

		confirmFn.mockReturnValue(true);
		await user.click(
			screen.getByRole("button", { name: "stub-delete-branch-1" }),
		);
		await waitFor(() => {
			expect(mockClient.commissionCycle.delete).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.commissionCycle.delete.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			branchId: "branch-1",
		});
	});

	it("creates a tenant-wide calendar_month policy via commissionCycle.upsert", async () => {
		// No tenant-wide policy yet → "Add policy" creates one.
		mockClient.commissionCycle.list.mockResolvedValue({
			policies: [branchPolicy],
		});
		const user = userEvent.setup();
		renderWithProviders(<CommissionCyclesPage />);

		await user.click(
			await screen.findByRole("button", { name: /add policy/i }),
		);
		// Dialog defaults: tenant scope + calendar_month + no anchor → valid.
		await user.click(
			await screen.findByRole("button", { name: "Create policy" }),
		);

		await waitFor(() => {
			expect(mockClient.commissionCycle.upsert).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.commissionCycle.upsert.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			branchId: null,
			cycleType: "calendar_month",
			anchorDay: null,
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Cycle policy created.");
		});
	});

	it("saves an edited branch policy with its anchored cycle preserved", async () => {
		const user = userEvent.setup();
		renderWithProviders(<CommissionCyclesPage />);

		await user.click(
			await screen.findByRole("button", { name: "stub-edit-branch-1" }),
		);
		// Editing keeps the policy's own scope/cycle/anchor prefilled.
		await user.click(
			await screen.findByRole("button", { name: "Save changes" }),
		);

		await waitFor(() => {
			expect(mockClient.commissionCycle.upsert).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.commissionCycle.upsert.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			branchId: "branch-1",
			cycleType: "monthly_anchored",
			anchorDay: 22,
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Cycle policy updated.");
		});
	});

	it("hides all write controls without the commission-management permission", async () => {
		hasPermissionMock.mockReturnValue(false);
		renderWithProviders(<CommissionCyclesPage />);

		await screen.findByTestId("policy-row-tenant");
		expect(
			screen.queryByRole("button", { name: /add policy/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "stub-edit-tenant" }),
		).not.toBeInTheDocument();
	});
});
