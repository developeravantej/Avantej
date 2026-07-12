/**
 * BillingIdentityCard unit test (Plan 5, Task 2).
 * Pins the get/update/uploadLogo/removeLogo wiring, incl. the base64 file
 * payload on logo upload and the client-side type/size validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("sonner", () => ({
	toast: {
		success: (...a: unknown[]) => toastSuccess(...a),
		error: (...a: unknown[]) => toastError(...a),
	},
}));

import { BillingIdentityCard } from "@/components/pages/settings/billing-identity-card";

const ORG_ID = "org-1";

const baseProfile = {
	legalName: "MOVE COLLECTIVE MALAYSIA SDN BHD",
	registrationNo: "1590570-T",
	address: "Lot 1, Jalan Test",
	footerNote: null,
	logoDataUrl: null as string | null,
};

/** The hidden file input has no label — locate it by type. */
function getFileInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[type="file"]');
	if (!input) throw new Error("file input not found");
	return input as HTMLInputElement;
}

describe("BillingIdentityCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.billingProfile.get.mockResolvedValue({ ...baseProfile });
		mockClient.billingProfile.update.mockResolvedValue({ ok: true });
		mockClient.billingProfile.uploadLogo.mockResolvedValue({ ok: true });
		mockClient.billingProfile.removeLogo.mockResolvedValue({ ok: true });
	});

	it("loads the profile and prefills the form fields", async () => {
		renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);

		const legalName = await screen.findByLabelText("Legal name");
		expect(legalName).toHaveValue("MOVE COLLECTIVE MALAYSIA SDN BHD");
		expect(screen.getByLabelText("Company registration no. (SSM)")).toHaveValue(
			"1590570-T",
		);
		expect(mockClient.billingProfile.get.mock.calls[0][0]).toMatchObject({
			organizationId: ORG_ID,
		});
	});

	it("saves the trimmed profile and nulls out blank fields on update", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);

		const legalName = await screen.findByLabelText("Legal name");
		await user.clear(legalName);
		await user.type(legalName, "  New Legal Name  ");

		const address = screen.getByLabelText("Document address");
		await user.clear(address); // blank → must be sent as null

		await user.click(
			screen.getByRole("button", { name: "Save Billing Identity" }),
		);

		await waitFor(() => {
			expect(mockClient.billingProfile.update).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.billingProfile.update.mock.calls[0][0]).toEqual({
			organizationId: ORG_ID,
			legalName: "New Legal Name",
			registrationNo: "1590570-T",
			address: null,
			footerNote: null,
		});
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Billing identity saved");
		});
	});

	it("uploads a valid logo with the base64 file payload", async () => {
		const { container } = renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);
		await screen.findByRole("button", { name: "Upload logo" });

		const file = new File([new Uint8Array([1, 2, 3, 4])], "logo.png", {
			type: "image/png",
		});
		fireEvent.change(getFileInput(container), {
			target: { files: [file] },
		});

		await waitFor(() => {
			expect(mockClient.billingProfile.uploadLogo).toHaveBeenCalledTimes(1);
		});
		const payload = mockClient.billingProfile.uploadLogo.mock.calls[0][0];
		expect(payload).toMatchObject({
			organizationId: ORG_ID,
			contentType: "image/png",
		});
		// base64 of [1,2,3,4]
		expect(payload.data).toBe("AQIDBA==");
	});

	it("rejects a disallowed content type without calling uploadLogo", async () => {
		const { container } = renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);
		await screen.findByRole("button", { name: "Upload logo" });

		const file = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
		fireEvent.change(getFileInput(container), {
			target: { files: [file] },
		});

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				"Logo must be a PNG, JPEG, or WebP image.",
			);
		});
		expect(mockClient.billingProfile.uploadLogo).not.toHaveBeenCalled();
	});

	it("rejects an oversized logo without calling uploadLogo", async () => {
		const { container } = renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);
		await screen.findByRole("button", { name: "Upload logo" });

		const big = new File([new Uint8Array(200 * 1024 + 1)], "big.png", {
			type: "image/png",
		});
		fireEvent.change(getFileInput(container), {
			target: { files: [big] },
		});

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Logo must be under 200KB.");
		});
		expect(mockClient.billingProfile.uploadLogo).not.toHaveBeenCalled();
	});

	it("removes the logo via removeLogo when one exists", async () => {
		mockClient.billingProfile.get.mockResolvedValue({
			...baseProfile,
			logoDataUrl: "data:image/png;base64,AQIDBA==",
		});
		const user = userEvent.setup();
		renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={true} />,
		);

		await user.click(await screen.findByRole("button", { name: "Remove" }));

		await waitFor(() => {
			expect(mockClient.billingProfile.removeLogo).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.billingProfile.removeLogo.mock.calls[0][0]).toEqual({
			organizationId: ORG_ID,
		});
	});

	it("disables all write controls for non-admins", async () => {
		renderWithProviders(
			<BillingIdentityCard organizationId={ORG_ID} isAdmin={false} />,
		);

		expect(
			await screen.findByRole("button", { name: "Upload logo" }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Save Billing Identity" }),
		).toBeDisabled();
		expect(screen.getByLabelText("Legal name")).toBeDisabled();
	});
});
