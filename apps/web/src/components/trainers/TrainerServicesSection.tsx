"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	CategoryBufferRow,
	type CategoryBufferRowData,
} from "./category-buffer-row";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	organizationId: string;
	memberId: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
export function TrainerServicesSection({
	organizationId,
	memberId,
	isOpen,
	onOpenChange,
}: Props) {
	const queryClient = useQueryClient();

	const [editingBufferServiceId, setEditingBufferServiceId] = useState<
		string | null
	>(null);
	const [bufferInputValue, setBufferInputValue] = useState<string>("");

	// ── Queries ──────────────────────────────────────────────────────────────

	const { data: trainerServices = [] } = useQuery({
		...orpc.serviceMembers.listForMember.queryOptions({
			input: { organizationId, memberId },
		}),
		enabled: isOpen,
	});

	const { data: allServices = [] } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId, isActive: true },
		}),
		enabled: isOpen,
	});

	const { data: allCategories = [] } = useQuery({
		...orpc.serviceCategories.list.queryOptions({
			input: { organizationId },
		}),
		enabled: isOpen,
	});

	// ── Mutations ─────────────────────────────────────────────────────────────

	const assignMutation = useMutation({
		mutationFn: (serviceId: string) =>
			client.serviceMembers.assign({
				organizationId,
				memberId,
				serviceId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries(
				orpc.serviceMembers.listForMember.queryOptions({
					input: { organizationId, memberId },
				}),
			);
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to assign service.",
			),
	});

	const removeMutation = useMutation({
		mutationFn: (serviceId: string) =>
			client.serviceMembers.remove({
				organizationId,
				memberId,
				serviceId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries(
				orpc.serviceMembers.listForMember.queryOptions({
					input: { organizationId, memberId },
				}),
			);
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to remove service.",
			),
	});

	const updateBufferMutation = useMutation({
		mutationFn: ({
			serviceId,
			bufferTimeMinutes,
		}: {
			serviceId: string;
			bufferTimeMinutes: number | null;
		}) =>
			client.serviceMembers.updateBuffer({
				organizationId,
				memberId,
				serviceId,
				bufferTimeMinutes,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries(
				orpc.serviceMembers.listForMember.queryOptions({
					input: { organizationId, memberId },
				}),
			);
			setEditingBufferServiceId(null);
			toast.success("Buffer time updated.");
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to update buffer.",
			),
	});

	const { data: categoryBuffers = [] } = useQuery({
		...orpc.categoryBufferOverrides.listForMember.queryOptions({
			input: { organizationId, memberId },
		}),
		enabled: isOpen && !!organizationId && !!memberId,
	});

	const updateCategoryBufferMutation = useMutation({
		mutationFn: (args: {
			categoryId: string;
			bufferTimeMinutes: number | null;
		}) =>
			client.categoryBufferOverrides.upsert({
				organizationId,
				memberId,
				...args,
			}),
		onSuccess: () => {
			toast.success("Category buffer updated");
			queryClient.invalidateQueries(
				orpc.categoryBufferOverrides.listForMember.queryOptions({
					input: { organizationId, memberId },
				}),
			);
		},
		onError: () => toast.error("Failed to update category buffer"),
	});

	// ── Derived data ──────────────────────────────────────────────────────────

	type TrainerService = { serviceId: string; bufferTimeMinutes: number | null };
	const assignedServiceIds = new Set(
		(trainerServices as TrainerService[]).map((s) => s.serviceId),
	);

	type ServiceGroup = {
		categoryId: string | null;
		categoryName: string;
		services: typeof allServices;
	};
	const categoryById = new Map(allCategories.map((c) => [c.id, c]));
	const groupMap = new Map<string, ServiceGroup>();
	for (const svc of allServices) {
		const key = svc.categoryId ?? "__none__";
		if (!groupMap.has(key)) {
			const cat = svc.categoryId ? categoryById.get(svc.categoryId) : undefined;
			groupMap.set(key, {
				categoryId: svc.categoryId ?? null,
				categoryName: cat?.name ?? "Uncategorized",
				services: [],
			});
		}
		groupMap.get(key)!.services.push(svc);
	}
	const groups = Array.from(groupMap.values());

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<Collapsible open={isOpen} onOpenChange={onOpenChange}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between pt-1"
				>
					<div className="space-y-0.5 text-left">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Services
						</p>
						<Separator />
					</div>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isOpen && "rotate-180",
						)}
					/>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-3">
				{groups.length === 0 ? (
					<p className="text-sm text-muted-foreground py-2">
						No services available.
					</p>
				) : (
					<div className="space-y-4">
						{groups.map((group) => {
							const assignedCount = group.services.filter((s) =>
								assignedServiceIds.has(s.id),
							).length;
							const allAssigned = assignedCount === group.services.length;
							const someAssigned = assignedCount > 0 && !allAssigned;

							return (
								<div key={group.categoryId ?? "__none__"}>
									{/* Category row */}
									<div className="flex items-center gap-2 py-1">
										<Checkbox
											checked={
												allAssigned
													? true
													: someAssigned
														? "indeterminate"
														: false
											}
											onCheckedChange={async (checked) => {
												if (checked) {
													const toAssign = group.services.filter(
														(s) => !assignedServiceIds.has(s.id),
													);
													await Promise.allSettled(
														toAssign.map((s) =>
															assignMutation.mutateAsync(s.id),
														),
													);
												} else {
													const toRemove = group.services.filter((s) =>
														assignedServiceIds.has(s.id),
													);
													await Promise.allSettled(
														toRemove.map((s) =>
															removeMutation.mutateAsync(s.id),
														),
													);
												}
												queryClient.invalidateQueries(
													orpc.serviceMembers.listForMember.queryOptions({
														input: { organizationId, memberId },
													}),
												);
											}}
											disabled={
												assignMutation.isPending || removeMutation.isPending
											}
										/>
										<span className="text-sm font-medium">
											{group.categoryName}
										</span>
										<span className="text-xs text-muted-foreground">
											({assignedCount}/{group.services.length})
										</span>
									</div>

									{/* Service rows */}
									<div className="ml-6 space-y-0.5">
										{group.services.map((svc) => {
											const isAssigned = assignedServiceIds.has(svc.id);
											const assignedDetails = (
												trainerServices as TrainerService[]
											).find((ts) => ts.serviceId === svc.id);
											return (
												<div key={svc.id}>
													<div className="flex items-center gap-2 py-1">
														<Checkbox
															checked={isAssigned}
															onCheckedChange={(checked) => {
																if (checked) {
																	assignMutation.mutate(svc.id);
																} else {
																	removeMutation.mutate(svc.id);
																	if (editingBufferServiceId === svc.id) {
																		setEditingBufferServiceId(null);
																	}
																}
															}}
															disabled={
																assignMutation.isPending ||
																removeMutation.isPending
															}
														/>
														<span className="text-sm">{svc.name}</span>
													</div>
													{/* Buffer editor — only for assigned services */}
													{isAssigned && (
														<div className="ml-6 flex items-center gap-2 py-1 border-b last:border-0">
															{editingBufferServiceId === svc.id ? (
																<div className="flex items-center gap-1.5">
																	<Input
																		type="number"
																		min={0}
																		max={480}
																		className="w-20 h-7 text-sm"
																		placeholder="min"
																		value={bufferInputValue}
																		onChange={(e) =>
																			setBufferInputValue(e.target.value)
																		}
																	/>
																	<Button
																		type="button"
																		size="sm"
																		variant="default"
																		className="h-7 px-2 text-xs"
																		onClick={() => {
																			const parsed = parseInt(
																				bufferInputValue,
																				10,
																			);
																			const val: number | null =
																				bufferInputValue === "" || isNaN(parsed)
																					? null
																					: parsed;
																			updateBufferMutation.mutate({
																				serviceId: svc.id,
																				bufferTimeMinutes: val,
																			});
																		}}
																		disabled={updateBufferMutation.isPending}
																	>
																		Save
																	</Button>
																	<Button
																		type="button"
																		size="sm"
																		variant="ghost"
																		className="h-7 px-2 text-xs"
																		onClick={() =>
																			setEditingBufferServiceId(null)
																		}
																	>
																		Cancel
																	</Button>
																</div>
															) : (
																<div className="flex items-center gap-2">
																	<span className="text-xs text-muted-foreground">
																		Buffer:{" "}
																		{assignedDetails?.bufferTimeMinutes != null
																			? `${assignedDetails.bufferTimeMinutes} min`
																			: "Using default"}
																	</span>
																	<Button
																		type="button"
																		size="sm"
																		variant="ghost"
																		className="h-7 px-2"
																		onClick={() => {
																			setEditingBufferServiceId(svc.id);
																			setBufferInputValue(
																				assignedDetails?.bufferTimeMinutes?.toString() ??
																					"",
																			);
																		}}
																	>
																		<Edit className="size-3" />
																	</Button>
																</div>
															)}
														</div>
													)}
												</div>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* Category Buffer Defaults */}
				<div className="mt-4 space-y-2">
					<p className="text-sm font-medium text-muted-foreground">
						Category Buffer Defaults
					</p>
					<p className="text-xs text-muted-foreground">
						Set a default buffer for this trainer per service category. Leave
						blank to use the org-wide default. Service-level overrides take
						priority.
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
										updateCategoryBufferMutation.mutate({
											categoryId,
											bufferTimeMinutes,
										})
									}
								/>
							))}
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
