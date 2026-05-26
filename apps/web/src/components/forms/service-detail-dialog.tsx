import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusCallout } from "@/components/ui/status-callout";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";
import { ServiceDetailsTab } from "./service-details-tab";

interface ServiceDetailDialogProps {
	isOpen: boolean;
	onClose: () => void;
	serviceId: string | null;
	organizationId: string | null;
	onEdit?: (serviceId: string) => void;
	onDelete?: (serviceId: string) => Promise<void>;
}

// ── Trainers Tab ──────────────────────────────────────────────────────────────

interface TrainersTabProps {
	serviceId: string;
	organizationId: string;
}

function TrainersTab({ serviceId, organizationId }: TrainersTabProps) {
	const queryClient = useQueryClient();

	// Current assigned trainers
	const { data: assigned, isLoading: loadingAssigned } = useQuery(
		orpc.serviceMembers.listForService.queryOptions({
			input: { organizationId, serviceId },
		})
	);

	// All members — for the assign dropdown
	const { data: allMembers, isLoading: loadingMembers } = useQuery(
		orpc.members.list.queryOptions({ input: { organizationId } })
	);

	const [selectedMemberId, setSelectedMemberId] = useState<string>("");

	const assignedIds = new Set((assigned ?? []).map((m: { memberId: string }) => m.memberId));

	const unassigned = (allMembers ?? []).filter(
		(m: { id: string }) => !assignedIds.has(m.id)
	);

	const assignMutation = useMutation({
		mutationFn: (memberId: string) =>
			client.serviceMembers.assign({ organizationId, serviceId, memberId }),
		onSuccess: () => {
			setSelectedMemberId("");
			queryClient.invalidateQueries({
				queryKey: orpc.serviceMembers.listForService.key({ input: { organizationId, serviceId } }),
			});
			toast.success("Trainer assigned");
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to assign trainer");
		},
	});

	const removeMutation = useMutation({
		mutationFn: (memberId: string) =>
			client.serviceMembers.remove({ organizationId, serviceId, memberId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.serviceMembers.listForService.key({ input: { organizationId, serviceId } }),
			});
			toast.success("Trainer removed");
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to remove trainer");
		},
	});

	if (loadingAssigned || loadingMembers) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Assign row */}
			<div className="flex gap-2">
				<Select
					value={selectedMemberId}
					onValueChange={setSelectedMemberId}
					disabled={unassigned.length === 0}
				>
					<SelectTrigger className="flex-1">
						<SelectValue
							placeholder={
								unassigned.length === 0
									? "All members assigned"
									: "Select a trainer to assign…"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{unassigned.map((m: { id: string; name?: string | null; email?: string | null }) => (
							<SelectItem key={m.id} value={m.id}>
								{m.name ?? m.email ?? m.id}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					size="sm"
					disabled={!selectedMemberId || assignMutation.isPending}
					onClick={() => selectedMemberId && assignMutation.mutate(selectedMemberId)}
				>
					{assignMutation.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<UserPlus className="size-4" />
					)}
					<span className="ml-1">Assign</span>
				</Button>
			</div>

			{/* Assigned list */}
			{assigned && assigned.length === 0 ? (
				<p className="text-sm text-muted-foreground italic py-4 text-center">
					No trainers assigned to this service.
				</p>
			) : (
				<ul className="space-y-2">
					{(assigned ?? []).map((m: { memberId: string; displayName: string }) => (
						<li
							key={m.memberId}
							className="flex items-center justify-between rounded-lg border border-brand-secondary-3 bg-card px-4 py-3"
						>
							<span className="text-sm font-medium">{m.displayName}</span>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 shrink-0"
								disabled={removeMutation.isPending}
								onClick={() => removeMutation.mutate(m.memberId)}
							>
								<X className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function ServiceDetailDialog({
	isOpen,
	onClose,
	serviceId,
	organizationId,
	onEdit,
	onDelete,
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}: ServiceDetailDialogProps) {
	const [service, setService] = useState<{
		id: string;
		name: string;
		categoryId: string | null;
		duration: number;
		durationUnitType: string | null;
		maxAttendees: number;
		price: number | null;
		schedulingType: string | null;
		isActive: boolean;
		description: string | null;
		type: string | null;
		taxable: boolean;
		taxPercentage: number;
		location: string | null;
		features: string[] | null;
		expirable: boolean;
		expiryDays: number | null;
		sessionCount: number | null;
		isRecommended: boolean;
		timePresetConfig: {
			recurringDays: string[];
			timeSlotsPerDay: Record<string, string[]>;
		} | null;
		createdAt: Date | string;
		updatedAt: Date | string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// react-doctor-disable-next-line react-doctor/no-cascading-set-state -- setStates are split across try/catch/finally branches for an async fetch; consolidating would require restructuring control flow without behavior change benefit
	useEffect(() => {
		if (isOpen && serviceId && organizationId) {
			const fetchService = async () => {
				setIsLoading(true);
				setError(null);
				try {
					const result = await client.services.getById({
						organizationId,
						id: serviceId,
					});
					setService(result);
				} catch (err: unknown) {
					const message =
						err instanceof Error ? err.message : "Failed to load service";
					setError(message);
					setService(null);
				} finally {
					setIsLoading(false);
				}
			};
			fetchService();
		} else {
			setService(null);
			setError(null);
		}
	}, [isOpen, serviceId, organizationId]);

	async function handleDelete() {
		if (!serviceId || !onDelete) return;
		try {
			setIsDeleting(true);
			await onDelete(serviceId);
			setShowDeleteConfirm(false);
			onClose();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to deactivate service";
			toast.error(message);
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<>
			<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<div className="flex items-center justify-between gap-3 pr-8">
							<DialogTitle className="font-heading text-2xl">
								Service Details
							</DialogTitle>
							{service && (
								<div className="flex items-center gap-2">
									{onEdit && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												onClose();
												onEdit(serviceId!);
											}}
										>
											<Pencil className="mr-1 size-4" />
											Edit
										</Button>
									)}
									{onDelete && (
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={() => setShowDeleteConfirm(true)}
										>
											<Trash2 className="mr-1 size-4" />
											Deactivate
										</Button>
									)}
								</div>
							)}
						</div>
						<DialogDescription>View and manage the details of this service.</DialogDescription>
					</DialogHeader>

					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-8 animate-spin text-muted-foreground" />
							<span className="ml-3 text-sm text-muted-foreground">
								Loading…
							</span>
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{service && !isLoading && (
						<Tabs defaultValue="details">
							<TabsList className="mb-4">
								<TabsTrigger value="details">Details</TabsTrigger>
								<TabsTrigger value="trainers">Trainers</TabsTrigger>
							</TabsList>

							<TabsContent value="details">
								<ServiceDetailsTab service={service} />
							</TabsContent>

							<TabsContent value="trainers">
								{organizationId && serviceId ? (
									<TrainersTab
										serviceId={serviceId}
										organizationId={organizationId}
									/>
								) : null}
							</TabsContent>
						</Tabs>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Confirmation dialog — sibling, not nested */}
			<Dialog
				open={showDeleteConfirm}
				onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="font-heading text-2xl">
							Deactivate service
						</DialogTitle>
						<DialogDescription>Deactivate this service to hide it from active lists.</DialogDescription>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Deactivate &quot;{service?.name}&quot;? It will be hidden from active
						lists. You can reactivate it later by editing.
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowDeleteConfirm(false)}
							disabled={isDeleting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
							Deactivate
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
