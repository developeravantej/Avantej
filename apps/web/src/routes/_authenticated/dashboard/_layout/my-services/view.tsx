import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { CategoryBufferRow, type CategoryBufferRowData } from "@/components/trainers/category-buffer-row";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Briefcase, Edit } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/my-services/view",
)({
	component: MyServicesView,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceBufferAssignment = {
	serviceId: string;
	serviceName: string;
	categoryId: string | null;
	categoryName: string | null;
	categoryDefaultBuffer: number;
	bufferTimeMinutes: number | null;
};

// ─── Page component ───────────────────────────────────────────────────────────

function MyServicesView() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? "";
	const queryClient = useQueryClient();

	// ── Sheet state ──────────────────────────────────────────────────────────

	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedService, setSelectedService] =
		useState<ServiceBufferAssignment | null>(null);
	const [bufferInput, setBufferInput] = useState("");

	// ── Query ────────────────────────────────────────────────────────────────

	const { data: myServices = [], isLoading, isError } = useQuery({
		queryKey: ["myServices", organizationId],
		queryFn: () =>
			client.serviceMembers.listMine({ organizationId }),
		enabled: !!organizationId,
	});

	// ── Mutation ─────────────────────────────────────────────────────────────

	const saveMutation = useApiMutation({
		mutationFn: ({
			serviceId,
			bufferTimeMinutes,
		}: {
			serviceId: string;
			bufferTimeMinutes: number | null;
		}) =>
			client.serviceMembers.updateMyBuffer({
				organizationId,
				serviceId,
				bufferTimeMinutes,
			}),
		successMessage: "Buffer time updated.",
		errorMessage: (err) => err.message || "Failed to update.",
		invalidate: [["myServices", organizationId]],
		onSuccess: () => {
			setSheetOpen(false);
			setSelectedService(null);
		},
	});

	// ── Category buffer query & mutation ────────────────────────────────────

	const { data: categoryBuffers = [] } = useQuery({
		queryKey: ["myCategoryBuffers", organizationId],
		queryFn: () =>
			client.categoryBufferOverrides.listMine({ organizationId }),
		enabled: !!organizationId,
	});

	const updateCategoryMutation = useMutation({
		mutationFn: (args: { categoryId: string; bufferTimeMinutes: number | null }) =>
			client.categoryBufferOverrides.updateMine({ organizationId, ...args }),
		onSuccess: () => {
			toast.success("Category buffer updated");
			queryClient.invalidateQueries({ queryKey: ["myCategoryBuffers", organizationId] });
		},
		onError: () => toast.error("Failed to update"),
	});

	// ── Sheet helpers ────────────────────────────────────────────────────────

	function openEdit(row: ServiceBufferAssignment) {
		setSelectedService(row);
		setBufferInput(row.bufferTimeMinutes != null ? String(row.bufferTimeMinutes) : "");
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setSelectedService(null);
		setBufferInput("");
	}

	function handleSave() {
		if (!selectedService) return;
		if (bufferInput.trim() === "") {
			saveMutation.mutate({ serviceId: selectedService.serviceId, bufferTimeMinutes: null });
			return;
		}
		const parsed = parseInt(bufferInput, 10);
		if (isNaN(parsed)) {
			toast.error("Please enter a valid number for buffer time.");
			return;
		}
		saveMutation.mutate({ serviceId: selectedService.serviceId, bufferTimeMinutes: parsed });
	}

	function handleClearOverride() {
		if (!selectedService) return;
		saveMutation.mutate({ serviceId: selectedService.serviceId, bufferTimeMinutes: null });
	}

	// ── Table columns ────────────────────────────────────────────────────────

	const columns: ColumnDef<ServiceBufferAssignment>[] = [
		{
			accessorKey: "serviceName",
			header: "Service",
			cell: ({ row }) => (
				<div>
					<span className="font-medium">
						{row.original.serviceName}
					</span>
					{row.original.categoryName && (
						<p className="text-xs text-muted-foreground">{row.original.categoryName}</p>
					)}
				</div>
			),
		},
		{
			accessorKey: "categoryDefaultBuffer",
			header: "Category Default",
			cell: ({ row }) => {
				const val = row.original.categoryDefaultBuffer;
				return (
					<span className="text-sm">
						{val > 0 ? `${val} min` : (
							<span className="text-muted-foreground">None</span>
						)}
					</span>
				);
			},
		},
		{
			accessorKey: "bufferTimeMinutes",
			header: "My Override",
			cell: ({ row }) => {
				const val = row.original.bufferTimeMinutes;
				if (val == null) {
					return (
						<span className="text-muted-foreground">- (using default)</span>
					);
				}
				return <Badge variant="outline">{val} min</Badge>;
			},
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => openEdit(row.original)}
					disabled={saveMutation.isPending}
				>
					<Edit className="size-4 mr-1" aria-hidden="true" />
					Edit
				</Button>
			),
		},
	];

	// ── Guard: no org selected ───────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view your services.
			</div>
		);
	}

	// ── Guard: loading ───────────────────────────────────────────────────────

	if (isLoading) {
		return <PageLoader />;
	}

	// ── Guard: error ─────────────────────────────────────────────────────────

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center min-h-96 gap-3 text-destructive">
				<p className="font-medium">Failed to load your services.</p>
				<p className="text-sm text-muted-foreground">
					Please refresh the page or try again later.
				</p>
			</div>
		);
	}

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<Briefcase className="size-6 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading">My Services</h1>
					<p className="text-muted-foreground text-sm">
						Manage your buffer time per assigned service.
					</p>
				</div>
			</div>

			<Separator />

			{/* Empty state */}
			{myServices.length === 0 && !isLoading ? (
				<EmptyState
					icon={Briefcase}
					title="No services assigned"
					description="Contact your manager to get assigned to services."
				/>
			) : (
				<DataTable<ServiceBufferAssignment, unknown>
					columns={columns}
					data={myServices}
				/>
			)}

			{/* Category Buffer Defaults */}
			<div className="mt-6 space-y-2">
				<p className="text-sm font-semibold">Category Buffer Defaults</p>
				<p className="text-xs text-muted-foreground">
					Set your default buffer for each service category. Leave blank to use
					the org default. Service-level overrides take priority.
				</p>
				{categoryBuffers.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No service categories assigned.
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{categoryBuffers.map((cat) => (
							<CategoryBufferRow
								key={cat.categoryId}
								cat={cat as CategoryBufferRowData}
								onSave={(categoryId, bufferTimeMinutes) =>
									updateCategoryMutation.mutate({ categoryId, bufferTimeMinutes })
								}
							/>
						))}
					</div>
				)}
			</div>

		{/* Edit Buffer Dialog */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Set Buffer Time</DialogTitle>
						<DialogDescription>
							Override the default buffer time for this service.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-5 p-4">
						{/* Read-only: Service name */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
								Service
							</Label>
							<p className="text-sm font-medium">
								{selectedService?.serviceName ?? "—"}
							</p>
						</div>

						{/* Read-only: Category name */}
						{selectedService?.categoryName && (
							<div className="flex flex-col gap-1.5">
								<Label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
									Category
								</Label>
								<p className="text-sm text-muted-foreground">
									{selectedService.categoryName}
								</p>
							</div>
						)}

						<Separator />

						{/* Buffer input */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="buffer-input">My Buffer (minutes)</Label>
							<Input
								id="buffer-input"
								type="number"
								min={0}
								step={1}
								placeholder="Leave blank to use category default"
								value={bufferInput}
								onChange={(e) => setBufferInput(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Category default:{" "}
								{selectedService && selectedService.categoryDefaultBuffer > 0
									? `${selectedService.categoryDefaultBuffer} min`
									: "None"}
							</p>
						</div>

						<DialogFooter className="px-0 pt-2 flex-col gap-2 sm:flex-row">
							<Button
								type="button"
								variant="outline"
								onClick={closeSheet}
								disabled={saveMutation.isPending}
							>
								Cancel
							</Button>
							{selectedService?.bufferTimeMinutes != null && (
								<Button
									type="button"
									variant="outline"
									className="text-destructive border-destructive hover:bg-destructive/5"
									onClick={handleClearOverride}
									disabled={saveMutation.isPending}
								>
									Clear Override
								</Button>
							)}
							<Button
								type="button"
								onClick={handleSave}
								disabled={saveMutation.isPending}
							>
								{saveMutation.isPending ? "Saving..." : "Save"}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
