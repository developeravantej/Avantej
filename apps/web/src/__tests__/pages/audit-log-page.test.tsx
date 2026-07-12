import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import type { AuditRowEnriched } from "@/components/pages/audit/types";

// oRPC: client stubs + queryOptions wired through the SAME mock client.
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
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
	toast: {
		success: (...a: unknown[]) => toastSuccess(...a),
		error: (...a: unknown[]) => toastError(...a),
		warning: (...a: unknown[]) => toastWarning(...a),
	},
}));

// Permission toggle per test.
const hasPermissionMock = vi.fn().mockReturnValue(true);
let currentOrgId: string | null = "org-1";
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: currentOrgId,
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: {
						nodes: [{ id: "branch-1", name: "Main Branch", type: "branch" }],
						member: { accessibleNodeIds: ["branch-1"] },
					},
				},
			],
		},
		hasPermission: hasPermissionMock,
		hasRole: () => true,
	}),
}));

// boneyard-js Skeleton gates the body on a registry context jsdom lacks.
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The per-row detail dialog is out of scope for this test.
vi.mock("@/components/pages/audit/ChangesDialog", () => ({
	ChangesDialog: () => null,
}));

import { AuditLogPage } from "@/components/pages/audit/AuditLogPage";

function makeRow(overrides: Partial<AuditRowEnriched> = {}): AuditRowEnriched {
	return {
		id: `row-${Math.random().toString(36).slice(2)}`,
		actorUserId: "user-1",
		actorMemberId: null,
		actorRole: "admin",
		actorName: "Ahmad Firdaus",
		actorInitials: "AF",
		action: "sale.create",
		entityType: "sales_order",
		entityId: "so-1",
		entityLabel: "SO-0001",
		branchId: "branch-1",
		branchName: "Main Branch",
		summary: "Created sale SO-0001",
		severity: "info",
		changes: null,
		ipAddress: "127.0.0.1",
		userAgent: null,
		createdAt: new Date("2026-07-01T10:00:00Z").toISOString(),
		...overrides,
	};
}

describe("AuditLogPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentOrgId = "org-1";
		hasPermissionMock.mockReturnValue(true);
		mockClient.auditLogs.list.mockResolvedValue({
			rows: [makeRow()],
			total: 1,
		});
		mockClient.auditLogs.exportCsv.mockResolvedValue({
			csv: "id,action\nrow-1,sale.create",
			truncated: false,
			totalMatching: 1,
		});
	});

	it("renders list rows and the 4 KPI severity queries from mocks", async () => {
		mockClient.auditLogs.list.mockResolvedValue({
			rows: [makeRow({ actorName: "Ahmad Firdaus" })],
			total: 1,
		});
		renderWithProviders(<AuditLogPage />);

		await waitFor(() => {
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument();
		});

		// 4 KPI queries (limit:1) each with its severity slice + the main list.
		await waitFor(() => {
			const kpiCalls = mockClient.auditLogs.list.mock.calls
				.map((c) => c[0])
				.filter((input) => input?.limit === 1);
			const severities = kpiCalls.map((i) => i.severity);
			expect(severities).toContain("danger");
			expect(severities).toContain("warning");
			expect(severities).toContain("info");
			expect(severities).toContain(undefined); // total tile
		});
		expect(screen.getByText("TOTAL EVENTS")).toBeInTheDocument();
		expect(screen.getByText("DANGER")).toBeInTheDocument();
	});

	// Renders 100 rows; needs headroom beyond the 5s default under full-suite load.
	it("infinite scroll: Load more fetches the next page with the loaded offset", {
		timeout: 20_000,
	}, async () => {
		const firstPage = Array.from({ length: 100 }, (_, i) =>
			makeRow({ id: `r-${i}` }),
		);
		mockClient.auditLogs.list.mockResolvedValue({
			rows: firstPage,
			total: 250,
		});
		const user = userEvent.setup();
		renderWithProviders(<AuditLogPage />);

		const loadMore = await screen.findByRole("button", { name: "Load more" });
		expect(screen.getByText("100 of 250 results")).toBeInTheDocument();

		await user.click(loadMore);

		await waitFor(() => {
			// The main list uses client.auditLogs.list directly with limit=PAGE_LIMIT.
			const pageCalls = mockClient.auditLogs.list.mock.calls
				.map((c) => c[0])
				.filter((input) => input?.limit === 100);
			expect(pageCalls.some((i) => i.offset === 100)).toBe(true);
		});
	});

	it("exportCsv is invoked with the active filters", async () => {
		const createObjectURL = vi.fn().mockReturnValue("blob:mock");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL,
			revokeObjectURL,
		});

		const user = userEvent.setup();
		renderWithProviders(<AuditLogPage />);

		const actorInput = await screen.findByPlaceholderText("All actors");
		await user.type(actorInput, "user-42");

		const exportBtn = await screen.findByRole("button", {
			name: /export csv/i,
		});
		await waitFor(() => expect(exportBtn).toBeEnabled());
		await user.click(exportBtn);

		await waitFor(() => {
			expect(mockClient.auditLogs.exportCsv).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.auditLogs.exportCsv.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			actorUserId: "user-42",
		});
		expect(toastSuccess).toHaveBeenCalledWith("CSV exported successfully.");
		expect(createObjectURL).toHaveBeenCalled();

		vi.unstubAllGlobals();
	});

	it("warns when the export was truncated", async () => {
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn().mockReturnValue("blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		mockClient.auditLogs.exportCsv.mockResolvedValue({
			csv: "id\n1",
			truncated: true,
			totalMatching: 99999,
		});
		const user = userEvent.setup();
		renderWithProviders(<AuditLogPage />);

		const exportBtn = await screen.findByRole("button", {
			name: /export csv/i,
		});
		await waitFor(() => expect(exportBtn).toBeEnabled());
		await user.click(exportBtn);

		await waitFor(() => {
			expect(toastWarning).toHaveBeenCalled();
		});
		expect(String(toastWarning.mock.calls[0][0])).toContain("99999");

		vi.unstubAllGlobals();
	});

	it("shows the forbidden state when the audit_log:read permission is missing", async () => {
		hasPermissionMock.mockImplementation(
			(perm: string) => perm !== "audit_log:read",
		);
		renderWithProviders(<AuditLogPage />);

		expect(
			await screen.findByText("You don't have access to this page"),
		).toBeInTheDocument();
		// No queries fire without the permission.
		expect(mockClient.auditLogs.list).not.toHaveBeenCalled();
	});

	it("shows the no-organization state when no org is selected", async () => {
		currentOrgId = null;
		renderWithProviders(<AuditLogPage />);

		expect(
			await screen.findByText("No organization selected"),
		).toBeInTheDocument();
		expect(mockClient.auditLogs.list).not.toHaveBeenCalled();
	});

	it("shows the empty state when no rows match", async () => {
		mockClient.auditLogs.list.mockResolvedValue({ rows: [], total: 0 });
		renderWithProviders(<AuditLogPage />);

		expect(await screen.findByText("No audit events")).toBeInTheDocument();
	});
});
