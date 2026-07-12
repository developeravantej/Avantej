import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	type Mock,
} from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let RouteComponent: React.ComponentType;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		RouteComponent = opts.component;
		return {
			component: opts.component,
			useSearch: () => ({ tab: "buffer" as const }),
			fullPath: "/_authenticated/dashboard/_layout/my-services/view",
		};
	},
	useNavigate: () => vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
		hasPermission: () => true,
	}),
}));

// boneyard-js Skeleton gates the body on a registry context jsdom lacks.
vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Other tab's table isn't under test.
vi.mock("@/features/my-services/components/assigned-packages-table", () => ({
	AssignedPackagesTable: () => null,
}));

// The generic sales DataTable is heavy — stub it to render each row's service
// name plus the REAL actions-column cell so the Edit → dialog flow is the
// component's own wiring.
vi.mock("@/components/tables/sales/view/data-table", () => ({
	default: ({
		columns,
		data,
	}: {
		columns: Array<{
			id?: string;
			cell?: (ctx: { row: { original: unknown } }) => React.ReactNode;
		}>;
		data: Array<{ serviceId: string; serviceName: string }>;
	}) => {
		const actions = columns.find((c) => c.id === "actions");
		return (
			<div data-testid="buffer-table">
				{data.map((row) => (
					<div key={row.serviceId}>
						<span>{row.serviceName}</span>
						{actions?.cell?.({ row: { original: row } })}
					</div>
				))}
			</div>
		);
	},
}));

// jsdom sanitizes invalid strings out of <input type="number"> — force text so
// the isNaN branch of handleSave is reachable.
vi.mock("@/components/ui/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} type="text" />
	),
}));

const SERVICES = [
	{
		serviceId: "svc-1",
		serviceName: "Body Massage 60min",
		categoryId: null,
		categoryName: null,
		categoryDefaultBuffer: 0,
		bufferTimeMinutes: null,
	},
	{
		serviceId: "svc-2",
		serviceName: "PT Session",
		categoryId: "cat-1",
		categoryName: "Training",
		categoryDefaultBuffer: 10,
		bufferTimeMinutes: 30,
	},
];

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/my-services/view");
});

async function openEditFor(
	user: ReturnType<typeof userEvent.setup>,
	index: number,
) {
	renderWithProviders(<RouteComponent />);
	await waitFor(() => {
		expect(screen.getByTestId("buffer-table")).toBeInTheDocument();
	});
	await user.click(screen.getAllByRole("button", { name: /edit/i })[index]);
	await screen.findByRole("dialog");
}

describe("My Services — buffer handleSave", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.serviceMembers.listMine.mockResolvedValue(SERVICES);
		mockClient.categoryBufferOverrides.listMine.mockResolvedValue([]);
		mockClient.serviceMembers.updateMyBuffer.mockResolvedValue({});
	});

	it("saves valid minutes via serviceMembers.updateMyBuffer", async () => {
		const user = userEvent.setup();
		await openEditFor(user, 0);

		await user.type(screen.getByLabelText("My Buffer (minutes)"), "15");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(
				mockClient.serviceMembers.updateMyBuffer as unknown as Mock,
			).toHaveBeenCalledWith({
				organizationId: "org-1",
				serviceId: "svc-1",
				bufferTimeMinutes: 15,
			});
		});
	});

	it("rejects non-numeric input without calling the API", async () => {
		const { toast } = await import("sonner");
		const user = userEvent.setup();
		await openEditFor(user, 0);

		await user.type(screen.getByLabelText("My Buffer (minutes)"), "abc");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(toast.error).toHaveBeenCalledWith(
			"Please enter a valid number for buffer time.",
		);
		expect(
			mockClient.serviceMembers.updateMyBuffer as unknown as Mock,
		).not.toHaveBeenCalled();
	});

	it("blank input saves null (reset to category default)", async () => {
		const user = userEvent.setup();
		await openEditFor(user, 1); // svc-2 prefilled with "30"

		await user.clear(screen.getByLabelText("My Buffer (minutes)"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(
				mockClient.serviceMembers.updateMyBuffer as unknown as Mock,
			).toHaveBeenCalledWith({
				organizationId: "org-1",
				serviceId: "svc-2",
				bufferTimeMinutes: null,
			});
		});
	});

	it("Clear Override sends null for the selected service", async () => {
		const user = userEvent.setup();
		await openEditFor(user, 1);

		await user.click(screen.getByRole("button", { name: "Clear Override" }));

		await waitFor(() => {
			expect(
				mockClient.serviceMembers.updateMyBuffer as unknown as Mock,
			).toHaveBeenCalledWith({
				organizationId: "org-1",
				serviceId: "svc-2",
				bufferTimeMinutes: null,
			});
		});
	});
});
