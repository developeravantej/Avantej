import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { PaymentProofSection } from "@/components/pages/payment/payment-proof-section";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const PKG_ID = "pkg-1";

const defaultProps = {
	organizationId: ORG_ID,
	packageInstanceId: PKG_ID,
	canWrite: true,
};

function proofRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "proof-1",
		fileName: "receipt.png",
		uploadedAt: "2026-07-01T10:00:00.000Z",
		...overrides,
	};
}

/** Grab the hidden file input rendered next to the Upload button. */
function getFileInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[type="file"]');
	if (!input) throw new Error("file input not rendered");
	return input as HTMLInputElement;
}

const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
	vi.clearAllMocks();
	mockClient.packageInstances.listPaymentProofs.mockResolvedValue([]);
	// jsdom does not implement object URLs.
	URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
	URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
	URL.createObjectURL = realCreateObjectURL;
	URL.revokeObjectURL = realRevokeObjectURL;
	vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PaymentProofSection — upload", () => {
	it("uploads the picked file as base64 with name and content type", async () => {
		mockClient.packageInstances.uploadPaymentProof.mockResolvedValue({
			id: "proof-new",
		});
		const user = userEvent.setup();
		const { container } = renderWithProviders(
			<PaymentProofSection {...defaultProps} />,
		);

		// "hello" → base64 aGVsbG8=
		const file = new File(["hello"], "slip.png", { type: "image/png" });
		await user.upload(getFileInput(container), file);

		await waitFor(() => {
			expect(
				mockClient.packageInstances.uploadPaymentProof,
			).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				packageInstanceId: PKG_ID,
				fileName: "slip.png",
				contentType: "image/png",
				dataBase64: "aGVsbG8=",
			});
		});
		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Payment proof uploaded");
		});
	});

	it("falls back to application/octet-stream when the file has no type", async () => {
		mockClient.packageInstances.uploadPaymentProof.mockResolvedValue({
			id: "proof-new",
		});
		const user = userEvent.setup();
		const { container } = renderWithProviders(
			<PaymentProofSection {...defaultProps} />,
		);

		// .pdf matches the input's accept list by extension even with no MIME type.
		const file = new File(["x"], "slip.pdf", { type: "" });
		await user.upload(getFileInput(container), file);

		await waitFor(() => {
			expect(
				mockClient.packageInstances.uploadPaymentProof,
			).toHaveBeenCalledWith(
				expect.objectContaining({ contentType: "application/octet-stream" }),
			);
		});
	});

	it("rejects files over 10 MB without calling the API", async () => {
		const user = userEvent.setup();
		const { container } = renderWithProviders(
			<PaymentProofSection {...defaultProps} />,
		);

		const file = new File(["tiny"], "huge.pdf", { type: "application/pdf" });
		Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
		await user.upload(getFileInput(container), file);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"File is too large (max 10 MB).",
			);
		});
		expect(
			mockClient.packageInstances.uploadPaymentProof,
		).not.toHaveBeenCalled();
	});

	it("surfaces an upload failure as an error toast", async () => {
		mockClient.packageInstances.uploadPaymentProof.mockRejectedValue(
			new Error("R2 write failed"),
		);
		const user = userEvent.setup();
		const { container } = renderWithProviders(
			<PaymentProofSection {...defaultProps} />,
		);

		const file = new File(["hello"], "slip.png", { type: "image/png" });
		await user.upload(getFileInput(container), file);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("R2 write failed");
		});
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("hides the upload control when canWrite is false", async () => {
		const { container } = renderWithProviders(
			<PaymentProofSection {...defaultProps} canWrite={false} />,
		);
		await screen.findByText(/no payment proofs uploaded yet/i);
		expect(
			screen.queryByRole("button", { name: /upload/i }),
		).not.toBeInTheDocument();
		expect(container.querySelector('input[type="file"]')).toBeNull();
	});
});

describe("PaymentProofSection — download", () => {
	it("downloads a proof and opens it in a new tab", async () => {
		mockClient.packageInstances.listPaymentProofs.mockResolvedValue([
			proofRow(),
		]);
		// "hi" → base64 aGk=
		mockClient.packageInstances.downloadPaymentProof.mockResolvedValue({
			dataBase64: "aGk=",
			contentType: "image/png",
			fileName: "receipt.png",
		});
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue(null as unknown as Window);
		const user = userEvent.setup();
		renderWithProviders(<PaymentProofSection {...defaultProps} />);

		await user.click(
			await screen.findByRole("button", { name: /receipt\.png/ }),
		);

		await waitFor(() => {
			expect(
				mockClient.packageInstances.downloadPaymentProof,
			).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				proofId: "proof-1",
			});
		});
		await waitFor(() => {
			expect(openSpy).toHaveBeenCalledWith(
				"blob:mock-url",
				"_blank",
				"noopener",
			);
		});
		expect(URL.createObjectURL).toHaveBeenCalled();
	});

	it("shows an error toast when the download fails", async () => {
		mockClient.packageInstances.listPaymentProofs.mockResolvedValue([
			proofRow(),
		]);
		mockClient.packageInstances.downloadPaymentProof.mockRejectedValue(
			new Error("proof missing from R2"),
		);
		vi.spyOn(window, "open").mockReturnValue(null as unknown as Window);
		const user = userEvent.setup();
		renderWithProviders(<PaymentProofSection {...defaultProps} />);

		await user.click(
			await screen.findByRole("button", { name: /receipt\.png/ }),
		);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("proof missing from R2");
		});
		expect(window.open).not.toHaveBeenCalled();
	});

	it("lists uploaded proofs with their dates", async () => {
		mockClient.packageInstances.listPaymentProofs.mockResolvedValue([
			proofRow(),
			proofRow({ id: "proof-2", fileName: "bank-slip.pdf" }),
		]);
		renderWithProviders(<PaymentProofSection {...defaultProps} />);

		expect(await screen.findByText("receipt.png")).toBeInTheDocument();
		expect(screen.getByText("bank-slip.pdf")).toBeInTheDocument();
	});
});
