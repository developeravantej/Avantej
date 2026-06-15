import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import {
	CategoryBufferRow,
	type CategoryBufferRowData,
} from "@/components/trainers/category-buffer-row";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Briefcase, Edit } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { AssignedPackagesTable } from "@/features/my-services/components/assigned-packages-table";

// ─── Route search schema ──────────────────────────────────────────────────────

const myServicesSearchSchema = z.object({
	tab: z.enum(["assigned", "buffer"]).default("assigned"),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/my-services/view",
)({
	component: MyServicesView,
	validateSearch: myServicesSearchSchema,
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

// ─── Buffer Time tab content ──────────────────────────────────────────────────

function BufferTimeTab({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();

	// ── Sheet state ────────────────────────────────────────────────────────
	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedService, setSelectedService] =
		useState<ServiceBufferAssignment | null>(null);
	const [bufferInput, setBufferInput] = useState("");

	// ── Queries ────────────────────────────────────────────────────────────
	const {
		data: myServices = [],
		isLoading,
		isError,
	} = useQuery({
		...orpc.serviceMembers.listMine.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const { data: categoryBuffers = [] } = useQuery({
		...orpc.categoryBufferOverrides.listMine.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	// ── Mutations ──────────────────────────────────────────────────────────
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
		invalidate: [
			orpc.serviceMembers.listMine.queryOptions({ input: { organizationId } })
				.queryKey,
		],
		onSuccess: () => {
			setSheetOpen(false);
			setSelectedService(null);
		},
	});

	const updateCategoryMutation = useMutation({
		mutationFn: (args: {
			categoryId: string;
			bufferTimeMinutes: number | null;
		}) =>
			client.categoryBufferOverrides.updateMine({ organizationId, ...args }),
		onSuccess: () => {
			toast.success("Category buffer updated");
			queryClient.invalidateQueries(
				orpc.categoryBufferOverrides.listMine.queryOptions({
					input: { organizationId },
				}),
			);
		},
		onError: () => toast.error("Failed to update"),
	});

	// ── Handlers ───────────────────────────────────────────────────────────
	function openEdit(row: ServiceBufferAssignment) {
		setSelectedService(row);
		setBufferInput(
			row.bufferTimeMinutes != null ? String(row.bufferTimeMinutes) : "",
		);
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
			saveMutation.mutate({
				serviceId: selectedService.serviceId,
				bufferTimeMinutes: null,
			});
			return;
		}
		const parsed = parseInt(bufferInput, 10);
		if (isNaN(parsed)) {
			toast.error("Please enter a valid number for buffer time.");
			return;
		}
		saveMutation.mutate({
			serviceId: selectedService.serviceId,
			bufferTimeMinutes: parsed,
		});
	}

	function handleClearOverride() {
		if (!selectedService) return;
		saveMutation.mutate({
			serviceId: selectedService.serviceId,
			bufferTimeMinutes: null,
		});
	}

	// ── Columns ────────────────────────────────────────────────────────────
	const columns: ColumnDef<ServiceBufferAssignment>[] = [
		{
			accessorKey: "serviceName",
			header: "Service",
			cell: ({ row }) => (
				<div>
					<span className="font-medium">{row.original.serviceName}</span>
					{row.original.categoryName && (
						<p className="text-xs text-[#737373]">
							{row.original.categoryName}
						</p>
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
						{val > 0 ? (
							`${val} min`
						) : (
							<span className="text-[#737373]">None</span>
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
					return <span className="text-[#737373]">— (using default)</span>;
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
					<Edit className="h-4 w-4 mr-1" aria-hidden="true" />
					Edit
				</Button>
			),
		},
	];

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center min-h-48 gap-3 text-rose-600">
				<p className="font-medium">Failed to load your services.</p>
				<p className="text-sm text-[#737373]">
					Please refresh the page or try again later.
				</p>
			</div>
		);
	}

	return (
		<Skeleton
			name="my-services-view"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<>
				{myServices.length === 0 ? (
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
					<p className="text-xs text-[#737373]">
						Set your default buffer for each service category. Leave blank to
						use the org default. Service-level overrides take priority.
					</p>
					{categoryBuffers.length === 0 ? (
						<p className="text-xs text-[#737373]">
							No service categories assigned.
						</p>
					) : (
						<div className="flex flex-col gap-2">
							{categoryBuffers.map((cat) => (
								<CategoryBufferRow
									key={cat.categoryId}
									cat={cat as CategoryBufferRowData}
									onSave={(categoryId, bufferTimeMinutes) =>
										updateCategoryMutation.mutate({
											categoryId,
											bufferTimeMinutes,
										})
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
					<DialogContent
						className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								SERVICE CATALOG
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Set Buffer Time
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								Override the default buffer time for this service.
							</DialogDescription>
						</DialogHeader>

						<div className="px-6 pt-4 pb-2 overflow-y-auto">
							<div className="flex flex-col gap-5">
								<div className="flex flex-col gap-1.5">
									<Label className="text-[#737373] text-xs uppercase tracking-wide font-semibold">
										Service
									</Label>
									<p className="text-sm font-medium">
										{selectedService?.serviceName ?? "—"}
									</p>
								</div>

								{selectedService?.categoryName && (
									<div className="flex flex-col gap-1.5">
										<Label className="text-[#737373] text-xs uppercase tracking-wide font-semibold">
											Category
										</Label>
										<p className="text-sm text-[#737373]">
											{selectedService.categoryName}
										</p>
									</div>
								)}

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
									<p className="text-xs text-[#737373]">
										Category default:{" "}
										{selectedService &&
										selectedService.categoryDefaultBuffer > 0
											? `${selectedService.categoryDefaultBuffer} min`
											: "None"}
									</p>
								</div>
							</div>
						</div>

						<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
									className="text-rose-600 border-rose-600 hover:bg-rose-600/5"
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
								className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							>
								{saveMutation.isPending ? "Saving..." : "Save"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</>
		</Skeleton>
	);
}

// ─── Page component ───────────────────────────────────────────────────────────

function MyServicesView() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? "";
	const { tab } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	function handleTabChange(value: string) {
		navigate({
			search: (prev) => ({ ...prev, tab: value as "assigned" | "buffer" }),
		});
	}

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-[#737373]">
				Select an organization to view your services.
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<Briefcase className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading">My Services</h1>
					<p className="text-[#737373] text-sm">
						View assigned packages and manage your buffer time per service.
					</p>
				</div>
			</div>

			<Separator />

			{/* Tabs */}
			<Tabs value={tab} onValueChange={handleTabChange}>
				<TabsList>
					<TabsTrigger value="assigned" data-testid="tab-assigned-packages">
						Assigned Packages
					</TabsTrigger>
					<TabsTrigger value="buffer">Buffer Time</TabsTrigger>
				</TabsList>

				<TabsContent value="assigned" className="mt-4">
					<AssignedPackagesTable organizationId={organizationId} />
				</TabsContent>

				<TabsContent value="buffer" className="mt-4">
					<BufferTimeTab organizationId={organizationId} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
