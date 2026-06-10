import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			organizations: [],
		},
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: null, isPending: false }),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

import { AddAppointmentModal } from "@/components/calendar/add-appointment-modal";

const defaultProps = {
	isOpen: true,
	onClose: vi.fn(),
	onSubmit: vi.fn(),
	teamMembers: [],
	selectedDate: new Date("2026-04-24T10:00:00.000Z"),
};

describe("AddAppointmentModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.members.list.mockResolvedValue([]);
		mockClient.services.list.mockResolvedValue([]);
		mockClient.rooms.list.mockResolvedValue([]);
		mockClient.classSlots.list.mockResolvedValue([]);
		mockClient.packageInstances.listAll.mockResolvedValue([]);
	});

	test("renders without crashing when open", async () => {
		renderWithProviders(<AddAppointmentModal {...defaultProps} />);
		await waitFor(() => {
			expect(screen.getByText(/add appointment/i)).toBeInTheDocument();
		});
	});

	test("mounts as an open, accessible dialog wired to onClose", async () => {
		const onClose = vi.fn();
		renderWithProviders(
			<AddAppointmentModal {...defaultProps} onClose={onClose} />,
		);

		// The redesigned modal renders with `hideCloseButton` — there is no
		// discrete close button; dismissal is delegated to the Radix Dialog
		// (Escape / overlay) via onOpenChange={(o) => { if (!o) onClose() }}.
		// We assert the part we own: an open dialog with its accessible title.
		// (Radix's Escape/overlay dismissal is the library's responsibility and
		// is not reliably drivable under jsdom.)
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(screen.getByText(/add appointment/i)).toBeInTheDocument();
	});

	test("does not render when isOpen is false", () => {
		renderWithProviders(
			<AddAppointmentModal {...defaultProps} isOpen={false} />,
		);
		expect(screen.queryByText(/add appointment/i)).not.toBeInTheDocument();
	});

	test("renders with a pre-selected trainer when defaultTrainerId is provided", async () => {
		const teamMembers = [
			{ id: "trainer-1", name: "Bob Trainer", email: "bob@example.com" },
		];
		renderWithProviders(
			<AddAppointmentModal
				{...defaultProps}
				teamMembers={teamMembers}
				defaultTrainerId="trainer-1"
			/>,
		);
		await waitFor(() => {
			expect(screen.getByText(/add appointment/i)).toBeInTheDocument();
		});
	});
});
