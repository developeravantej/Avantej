/**
 * Settings → Export Data / Import Data unit tests (Plan 5, Task 3).
 * Pins the dataExport.{listDatasets,exportDataset,exportAll} and
 * dataImport.{listEntities,history,preview,commit} wirings: request payloads,
 * in-flight/disabled states, and error surfacing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

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

const hasPermissionMock = vi.fn().mockReturnValue(true);
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: hasPermissionMock,
	}),
}));

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: "branch-x",
		isAllScope: false,
		activeScopeId: "branch-x",
		accessibleNodeIds: ["branch-x"],
		scopeNodes: [],
		topAccessibleNodeId: "branch-x",
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		isScopeReady: true,
		activeScopeNode: null,
	}),
}));

const downloadCsvMock = vi.fn();
vi.mock("@/lib/download-csv", () => ({
	downloadCsv: (...a: unknown[]) => downloadCsvMock(...a),
}));

import { DataExportPage } from "@/components/pages/settings/export/DataExportPage";
import { DataImportPage } from "@/components/pages/settings/import/DataImportPage";

// ─── Export ──────────────────────────────────────────────────────────────────

describe("DataExportPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasPermissionMock.mockReturnValue(true);
		mockClient.dataExport.listDatasets.mockResolvedValue([
			{ entity: "members", label: "Members", description: "All members" },
			{ entity: "sales", label: "Sales", description: "All sales orders" },
		]);
		mockClient.dataExport.exportDataset.mockResolvedValue({
			filename: "members.csv",
			csv: "id,name\n1,Ahmad",
			truncated: false,
		});
		mockClient.dataExport.exportAll.mockResolvedValue({
			filename: "export.zip",
			zipBase64: btoa("zip-bytes"),
			truncatedDatasets: [],
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("lists datasets and downloads one CSV with the branch scope applied", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DataExportPage />);

		expect(await screen.findByText("Members")).toBeInTheDocument();
		expect(mockClient.dataExport.listDatasets.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
		});

		const buttons = screen.getAllByRole("button", { name: /download csv/i });
		expect(buttons).toHaveLength(2);
		await user.click(buttons[0]);

		await waitFor(() => {
			expect(mockClient.dataExport.exportDataset).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.dataExport.exportDataset.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			entity: "members",
			branchId: "branch-x",
		});
		expect(downloadCsvMock).toHaveBeenCalledWith(
			"members.csv",
			"id,name\n1,Ahmad",
		);
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Export ready — downloading.");
		});
	});

	it("warns when a dataset export was truncated", async () => {
		mockClient.dataExport.exportDataset.mockResolvedValue({
			filename: "sales.csv",
			csv: "id\n1",
			truncated: true,
		});
		const user = userEvent.setup();
		renderWithProviders(<DataExportPage />);

		await screen.findByText("Sales");
		await user.click(
			screen.getAllByRole("button", { name: /download csv/i })[1],
		);

		await waitFor(() => {
			expect(toastWarning).toHaveBeenCalled();
		});
		expect(String(toastWarning.mock.calls[0][0])).toContain("50,000 rows");
	});

	it("exports everything as a ZIP and disables the button while zipping", async () => {
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn().mockReturnValue("blob:zip"),
			revokeObjectURL: vi.fn(),
		});
		let resolveExport: (v: unknown) => void = () => {};
		mockClient.dataExport.exportAll.mockImplementation(
			() => new Promise((res) => (resolveExport = res)),
		);
		const user = userEvent.setup();
		renderWithProviders(<DataExportPage />);

		const exportAllBtn = await screen.findByRole("button", {
			name: /export all \(zip\)/i,
		});
		await user.click(exportAllBtn);

		// In-flight state.
		const zipping = await screen.findByRole("button", { name: /zipping/i });
		expect(zipping).toBeDisabled();
		expect(mockClient.dataExport.exportAll.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			branchId: "branch-x",
		});

		resolveExport({
			filename: "export.zip",
			zipBase64: btoa("zip-bytes"),
			truncatedDatasets: [],
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith(
				"Full export ready — downloading ZIP.",
			);
		});
	});

	it("surfaces export errors via toast", async () => {
		mockClient.dataExport.exportDataset.mockRejectedValue(
			new Error("scope forbidden"),
		);
		const user = userEvent.setup();
		renderWithProviders(<DataExportPage />);

		await screen.findByText("Members");
		await user.click(
			screen.getAllByRole("button", { name: /download csv/i })[0],
		);

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("scope forbidden");
		});
		expect(downloadCsvMock).not.toHaveBeenCalled();
	});

	it("hides the download controls without the reports:export permission", async () => {
		hasPermissionMock.mockReturnValue(false);
		renderWithProviders(<DataExportPage />);

		await screen.findByText("Members");
		expect(
			screen.queryByRole("button", { name: /download csv/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /export all/i }),
		).not.toBeInTheDocument();
	});
});

// ─── Import ──────────────────────────────────────────────────────────────────

const clientSpec = {
	entity: "clients",
	label: "Clients",
	headerRow: "name,email,phone",
	columns: [
		{ name: "name", required: true, description: "Full name" },
		{ name: "email", required: false, description: "Email address" },
	],
};

describe("DataImportPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasPermissionMock.mockReturnValue(true);
		mockClient.dataImport.listEntities.mockResolvedValue([clientSpec]);
		mockClient.dataImport.history.mockResolvedValue([]);
		mockClient.dataImport.preview.mockResolvedValue({
			entity: "clients",
			rowCount: 2,
			okCount: 1,
			errorCount: 1,
			results: [
				{ line: 2, ok: true, errors: [] },
				{ line: 3, ok: false, errors: ["email invalid"] },
			],
		});
		mockClient.dataImport.commit.mockResolvedValue({
			createdCount: 1,
			skippedCount: 1,
			errorCount: 0,
		});
	});

	async function fillEntityAndCsv(user: ReturnType<typeof userEvent.setup>) {
		const select = await screen.findByLabelText("Data type");
		await waitFor(() => {
			expect(
				screen.getByRole("option", { name: "Clients" }),
			).toBeInTheDocument();
		});
		await user.selectOptions(select, "clients");
		const textarea = screen.getByLabelText("…or paste CSV");
		fireEvent.change(textarea, {
			target: { value: "name,email,phone\nAhmad,member@test.my,+60123456789" },
		});
	}

	it("previews the CSV with the selected entity payload", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DataImportPage />);

		await fillEntityAndCsv(user);

		const previewBtn = screen.getByRole("button", { name: "Preview" });
		expect(previewBtn).toBeEnabled();
		await user.click(previewBtn);

		await waitFor(() => {
			expect(mockClient.dataImport.preview).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.dataImport.preview.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			entity: "clients",
			csv: "name,email,phone\nAhmad,member@test.my,+60123456789",
		});
		// Validation summary renders.
		expect(await screen.findByText("2 rows")).toBeInTheDocument();
		expect(screen.getByText("1 valid")).toBeInTheDocument();
		expect(screen.getByText("1 errors")).toBeInTheDocument();
		expect(screen.getByText("email invalid")).toBeInTheDocument();
	});

	it("keeps Preview disabled until an entity and CSV are provided", async () => {
		renderWithProviders(<DataImportPage />);

		const previewBtn = await screen.findByRole("button", { name: "Preview" });
		expect(previewBtn).toBeDisabled();
		// Commit is gated behind a successful preview.
		expect(
			screen.getByRole("button", { name: "Commit import" }),
		).toBeDisabled();
	});

	it("commits only after preview, with skipInvalid:true, then resets the form", async () => {
		const user = userEvent.setup();
		renderWithProviders(<DataImportPage />);

		await fillEntityAndCsv(user);
		const commitBtn = screen.getByRole("button", { name: "Commit import" });
		expect(commitBtn).toBeDisabled(); // no preview yet

		await user.click(screen.getByRole("button", { name: "Preview" }));
		await screen.findByText("2 rows");
		expect(commitBtn).toBeEnabled();

		await user.click(commitBtn);

		await waitFor(() => {
			expect(mockClient.dataImport.commit).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.dataImport.commit.mock.calls[0][0]).toEqual({
			organizationId: "org-1",
			entity: "clients",
			csv: "name,email,phone\nAhmad,member@test.my,+60123456789",
			skipInvalid: true,
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith(
				"Import complete — 1 created, 1 skipped, 0 errors.",
			);
		});
		// Form reset: preview panel gone + CSV cleared.
		await waitFor(() => {
			expect(screen.queryByText("2 rows")).not.toBeInTheDocument();
		});
		expect(screen.getByLabelText("…or paste CSV")).toHaveValue("");
	});

	it("surfaces preview errors via toast", async () => {
		mockClient.dataImport.preview.mockRejectedValue(
			new Error("CSV missing header"),
		);
		const user = userEvent.setup();
		renderWithProviders(<DataImportPage />);

		await fillEntityAndCsv(user);
		await user.click(screen.getByRole("button", { name: "Preview" }));

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("CSV missing header");
		});
	});

	it("hides the commit button without the data_import:import permission", async () => {
		hasPermissionMock.mockReturnValue(false);
		const user = userEvent.setup();
		renderWithProviders(<DataImportPage />);

		await fillEntityAndCsv(user);
		expect(
			screen.queryByRole("button", { name: "Commit import" }),
		).not.toBeInTheDocument();
		// Preview stays available (read-only validation).
		expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
	});

	it("renders import history rows", async () => {
		mockClient.dataImport.history.mockResolvedValue([
			{
				id: "job-1",
				entity: "clients",
				status: "committed",
				createdCount: 10,
				skippedCount: 2,
				errorCount: 0,
				createdAt: "2026-07-01T10:00:00Z",
			},
		]);
		renderWithProviders(<DataImportPage />);

		expect(await screen.findByText("committed")).toBeInTheDocument();
		expect(screen.getByText("10")).toBeInTheDocument();
		expect(mockClient.dataImport.history.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
		});
	});
});
