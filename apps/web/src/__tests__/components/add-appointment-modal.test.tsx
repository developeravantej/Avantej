import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: {
		members: {
			list: {
				queryOptions: (opts: { input: unknown }) => ({
					queryKey: ["members-mock", opts],
					queryFn: () => mockClient.members.list(opts.input as Parameters<typeof mockClient.members.list>[0]),
				}),
			},
		},
		services: {
			list: {
				queryOptions: (opts: { input: unknown }) => ({
					queryKey: ["services-mock", opts],
					queryFn: () => mockClient.services.list(opts.input as Parameters<typeof mockClient.services.list>[0]),
				}),
			},
		},
		packageInstances: {
			listAll: {
				queryOptions: (opts: { input: unknown }) => ({
					queryKey: ["pkgInstances-mock", opts],
					queryFn: () => mockClient.packageInstances.listAll(opts.input as Parameters<typeof mockClient.packageInstances.listAll>[0]),
				}),
			},
		},
		classSlots: {
			list: {
				queryOptions: (opts: { input: unknown }) => ({
					queryKey: ["classSlots-mock", opts],
					queryFn: () => mockClient.classSlots.list(opts.input as Parameters<typeof mockClient.classSlots.list>[0]),
				}),
			},
		},
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			organizations: [],
		},
	}),
}));

vi.mock("@/hooks/useAuth", () => ({
	useAuth: () => ({ user: null }),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
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
			expect(screen.getByText(/add new appointment/i)).toBeInTheDocument();
		});
	});

	test("calls onClose when close button is clicked", async () => {
		const onClose = vi.fn();
		renderWithProviders(<AddAppointmentModal {...defaultProps} onClose={onClose} />);

		await waitFor(() => {
			expect(screen.getByText(/add new appointment/i)).toBeInTheDocument();
		});

		// The close button is an absolute-positioned ghost button with the X lucide icon
		const buttons = screen.getAllByRole("button");
		const closeBtn = buttons.find((btn) =>
			btn.querySelector(".lucide-x") !== null
		);
		expect(closeBtn).toBeDefined();
		fireEvent.click(closeBtn!);
		expect(onClose).toHaveBeenCalled();
	});

	test("does not render when isOpen is false", () => {
		renderWithProviders(<AddAppointmentModal {...defaultProps} isOpen={false} />);
		expect(screen.queryByText(/add new appointment/i)).not.toBeInTheDocument();
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
			/>
		);
		await waitFor(() => {
			expect(screen.getByText(/add new appointment/i)).toBeInTheDocument();
		});
	});
});
