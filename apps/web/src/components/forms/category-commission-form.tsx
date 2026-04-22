"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { client } from "@/utils/orpc";

interface CategoryCommissionFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	categoryId: string;
	categoryName: string;
	organizationId: string;
}

type SlotEntry = { slotIndex: number; label: string; weightageBasisPoints: number };

type RateEntry = { trainerTierId: string; amount: number };

type ConditionEntry = {
	conditionIndex: number;
	operator: "lt" | "lte" | "gt" | "gte" | "eq" | "between";
	threshold: number;
	thresholdMax?: number;
	label?: string;
	rates: RateEntry[];
};

const SLOT_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500"];

function conditionDescription(c: ConditionEntry): string {
	const op = c.operator;
	if (op === "between") return `When attendees between ${c.threshold} and ${c.thresholdMax ?? "?"}`;
	if (op === "lt") return `When attendees < ${c.threshold}`;
	if (op === "lte") return `When attendees ≤ ${c.threshold}`;
	if (op === "gt") return `When attendees > ${c.threshold}`;
	if (op === "gte") return `When attendees ≥ ${c.threshold}`;
	if (op === "eq") return `When attendees = ${c.threshold}`;
	return "";
}

export function CategoryCommissionForm({
	open,
	onOpenChange,
	categoryId,
	categoryName,
	organizationId,
}: CategoryCommissionFormProps) {
	const [paymentType, setPaymentType] = useState<"fixed" | "variable">("fixed");
	const [isConditional, setIsConditional] = useState(false);
	const [maxCoaches, setMaxCoaches] = useState(1);
	const [slots, setSlots] = useState<SlotEntry[]>([
		{ slotIndex: 0, label: "Head Coach", weightageBasisPoints: 10000 },
	]);
	const [rates, setRates] = useState<RateEntry[]>([]);
	const [conditions, setConditions] = useState<ConditionEntry[]>([]);

	const { data: existingConfig, isLoading: isLoadingConfig } = useQuery({
		queryKey: ["categoryCommission", organizationId, categoryId],
		queryFn: () => client.categoryCommission.getByCategory({ organizationId, categoryId }),
		enabled: open && !!organizationId && !!categoryId,
	});

	const { data: tiers = [] } = useQuery({
		queryKey: ["trainerTiers", organizationId, "active"],
		queryFn: () => client.trainerTiers.list({ organizationId, includeInactive: false }),
		enabled: open && !!organizationId,
	});

	useEffect(() => {
		if (!existingConfig) return;
		const { config, slots: apiSlots, rates: apiRates, conditions: apiConditions } = existingConfig as any;
		setPaymentType(config.paymentType ?? "fixed");
		setIsConditional(config.isConditional ?? false);
		setMaxCoaches(config.maxCoaches ?? 1);
		setSlots(
			(apiSlots ?? []).map((s: any) => ({
				slotIndex: s.slotIndex,
				label: s.label,
				weightageBasisPoints: s.weightageBasisPoints,
			})),
		);
		if (!config.isConditional) {
			setRates(
				(apiRates ?? []).map((r: any) => ({
					trainerTierId: r.trainerTierId,
					amount: r.amount / 100,
				})),
			);
			setConditions([]);
		} else {
			setRates([]);
			setConditions(
				(apiConditions ?? []).map(({ condition, rates: cr }: any) => ({
					conditionIndex: condition.conditionIndex,
					operator: condition.operator,
					threshold: condition.threshold,
					thresholdMax: condition.thresholdMax ?? undefined,
					label: condition.label ?? undefined,
					rates: (cr ?? []).map((r: any) => ({
						trainerTierId: r.trainerTierId,
						amount: r.amount / 100,
					})),
				})),
			);
		}
	}, [existingConfig]);

	useEffect(() => {
		if (tiers.length === 0 || rates.length > 0) return;
		setRates(tiers.map((t: any) => ({ trainerTierId: t.id, amount: 0 })));
	}, [tiers]);

	const upsertMutation = useMutation({
		mutationFn: (payload: Parameters<typeof client.categoryCommission.upsert>[0]) =>
			client.categoryCommission.upsert(payload),
		onSuccess: () => {
			toast.success("Commission config saved");
			onOpenChange(false);
		},
		onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
	});

	function handleSubmit() {
		const totalBp = slots.reduce((s, sl) => s + sl.weightageBasisPoints, 0);
		if (totalBp !== 10000) {
			toast.error("Slot weightages must total 100%");
			return;
		}
		if (!isConditional && rates.length === 0) {
			toast.error("At least one rate is required");
			return;
		}
		if (isConditional && conditions.length === 0) {
			toast.error("At least one condition is required");
			return;
		}
		upsertMutation.mutate({
			organizationId,
			categoryId,
			paymentType,
			isConditional,
			maxCoaches,
			slots,
			rates: isConditional ? undefined : rates.map((r) => ({ ...r, amount: Math.round(r.amount * 100) })),
			conditions: isConditional
				? conditions.map((c) => ({
						...c,
						rates: c.rates.map((r) => ({ ...r, amount: Math.round(r.amount * 100) })),
					}))
				: undefined,
		});
	}

	function addSlot() {
		setSlots((prev) => [
			...prev,
			{ slotIndex: prev.length, label: "Assistant", weightageBasisPoints: 0 },
		]);
	}

	function removeSlot(index: number) {
		setSlots((prev) =>
			prev
				.filter((_, i) => i !== index)
				.map((sl, i) => ({ ...sl, slotIndex: i })),
		);
	}

	function updateSlot(index: number, field: keyof SlotEntry, value: string | number) {
		setSlots((prev) =>
			prev.map((sl, i) => (i === index ? { ...sl, [field]: value } : sl)),
		);
	}

	function updateRate(tierId: string, amount: number) {
		setRates((prev) =>
			prev.map((r) => (r.trainerTierId === tierId ? { ...r, amount } : r)),
		);
	}

	function addCondition() {
		setConditions((prev) => [
			...prev,
			{
				conditionIndex: prev.length,
				operator: "gte",
				threshold: 0,
				label: "",
				rates: tiers.map((t: any) => ({ trainerTierId: t.id, amount: 0 })),
			},
		]);
	}

	function removeCondition(index: number) {
		setConditions((prev) =>
			prev
				.filter((_, i) => i !== index)
				.map((c, i) => ({ ...c, conditionIndex: i })),
		);
	}

	function updateCondition(index: number, field: keyof Omit<ConditionEntry, "rates">, value: unknown) {
		setConditions((prev) =>
			prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
		);
	}

	function updateConditionRate(conditionIndex: number, tierId: string, amount: number) {
		setConditions((prev) =>
			prev.map((c, i) =>
				i === conditionIndex
					? {
							...c,
							rates: c.rates.map((r) => (r.trainerTierId === tierId ? { ...r, amount } : r)),
						}
					: c,
			),
		);
	}

	const totalWeightagePercent = slots.reduce((s, sl) => s + sl.weightageBasisPoints, 0) / 100;
	const weightageOk = totalWeightagePercent === 100;
	const unitLabel = paymentType === "fixed" ? "RM" : "%";

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
				<SheetHeader className="mb-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<SheetTitle>Commission Config</SheetTitle>
							<SheetDescription>{categoryName}</SheetDescription>
						</div>
						{!isLoadingConfig && (
							existingConfig
								? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">Configured</Badge>
								: <Badge variant="outline" className="text-muted-foreground shrink-0">No config yet</Badge>
						)}
					</div>
				</SheetHeader>

				{isLoadingConfig ? (
					<div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
						Loading...
					</div>
				) : (
					<div className="flex flex-col gap-5 pb-24">
						<div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
							<Label className="text-sm font-medium">Payment Type</Label>
							<RadioGroup
								value={paymentType}
								onValueChange={(v) => setPaymentType(v as "fixed" | "variable")}
								className="grid grid-cols-2 gap-3"
							>
								{(["fixed", "variable"] as const).map((type) => (
									<label
										key={type}
										htmlFor={`pt-${type}`}
										className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-all ${
											paymentType === type
												? "ring-2 ring-primary border-primary"
												: "border-border hover:border-muted-foreground/40"
										}`}
									>
										<div className="flex items-center gap-2">
											<RadioGroupItem value={type} id={`pt-${type}`} />
											<span className="text-sm font-medium">
												{type === "fixed" ? "Fixed RM" : "Variable %"}
											</span>
										</div>
										<p className="text-xs text-muted-foreground pl-6">
											{type === "fixed"
												? "Flat RM amount per session per trainer tier"
												: "Percentage of sale price per trainer tier"}
										</p>
									</label>
								))}
							</RadioGroup>
						</div>

						<Separator />

						<div className="rounded-lg border bg-card p-4 flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<Label className="text-sm font-medium">Coach Slots</Label>
								<Badge
									className={
										weightageOk
											? "bg-emerald-100 text-emerald-700 border-emerald-200"
											: "bg-red-100 text-red-700 border-red-200"
									}
								>
									{totalWeightagePercent.toFixed(0)}%
								</Badge>
							</div>

							{slots.length > 0 && (
								<div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
									{slots.map((sl, i) => (
										<div
											key={sl.slotIndex}
											className={`${SLOT_COLORS[i % SLOT_COLORS.length]} transition-all`}
											style={{ width: `${(sl.weightageBasisPoints / 10000) * 100}%` }}
										/>
									))}
								</div>
							)}

							<div className="flex flex-col gap-2">
								{slots.map((slot, i) => (
									<div key={slot.slotIndex} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
										<Input
											value={slot.label}
											onChange={(e) => updateSlot(i, "label", e.target.value)}
											placeholder="Label"
										/>
										<div className="relative">
											<Input
												type="number"
												min={0}
												max={100}
												step={0.01}
												value={(slot.weightageBasisPoints / 100).toFixed(2)}
												onChange={(e) =>
													updateSlot(
														i,
														"weightageBasisPoints",
														Math.round(parseFloat(e.target.value || "0") * 100),
													)
												}
												className="pr-6"
											/>
											<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
												%
											</span>
										</div>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => removeSlot(i)}
											disabled={slots.length === 1}
											className="h-8 w-8 p-0"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>
								))}
							</div>

							<Button size="sm" variant="outline" onClick={addSlot} className="w-fit">
								<Plus className="mr-2 h-3.5 w-3.5" />
								Add Slot
							</Button>

							<Separator />

							<div className="flex flex-col gap-1.5">
								<Label className="text-sm font-medium">Max Coaches per Session</Label>
								<Input
									type="number"
									min={1}
									max={10}
									value={maxCoaches}
									onChange={(e) => setMaxCoaches(parseInt(e.target.value, 10) || 1)}
									className="w-24"
								/>
								<p className="text-xs text-muted-foreground">
									Maximum simultaneous coach assignments per appointment.
								</p>
							</div>
						</div>

						<Separator />

						<div className="flex items-center gap-3">
							<Switch
								checked={isConditional}
								onCheckedChange={setIsConditional}
								id="conditional"
							/>
							<div>
								<Label htmlFor="conditional" className="cursor-pointer">
									Rate depends on attendee count
								</Label>
								{isConditional && (
									<p className="text-xs text-muted-foreground mt-0.5">
										For POS sales, the first condition (lowest index) will be applied automatically.
									</p>
								)}
							</div>
						</div>

						{!isConditional && (
							<div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
								<Label className="text-sm font-medium">Rates by Trainer Tier</Label>
								{tiers.length === 0 ? (
									<p className="text-sm text-muted-foreground">No active trainer tiers found.</p>
								) : (
									<div className="divide-y divide-border/30">
										{tiers.map((tier: any) => {
											const rate = rates.find((r) => r.trainerTierId === tier.id);
											return (
												<div key={tier.id} className="flex items-center gap-3 py-2">
													<span className="flex-1 text-sm font-medium">{tier.name}</span>
													<div className="flex items-center gap-2">
														<Input
															type="number"
															min={0}
															step={0.01}
															value={rate?.amount ?? 0}
															onChange={(e) =>
																updateRate(tier.id, parseFloat(e.target.value || "0"))
															}
															className="w-28 text-right"
														/>
														<span className="w-6 text-xs text-muted-foreground">{unitLabel}</span>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						)}

						{isConditional && (
							<div className="flex flex-col gap-4">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-medium">Conditions</Label>
									<Button size="sm" variant="outline" onClick={addCondition}>
										<Plus className="mr-2 h-3.5 w-3.5" />
										Add Condition
									</Button>
								</div>

								{conditions.length === 0 && (
									<p className="text-sm text-muted-foreground">No conditions yet. Add one above.</p>
								)}

								<div className="flex flex-col gap-4">
									{conditions.map((condition, ci) => (
										<div
											key={condition.conditionIndex}
											className="rounded-lg border bg-card p-4 flex flex-col gap-4"
										>
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<Badge variant="outline" className="text-xs">
														Condition {ci + 1}
													</Badge>
													<span className="text-xs text-muted-foreground">
														{conditionDescription(condition)}
													</span>
												</div>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => removeCondition(ci)}
													className="h-7 w-7 p-0"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</Button>
											</div>

											<div className="flex flex-wrap items-end gap-3">
												<div className="flex flex-col gap-1">
													<Label className="text-xs">Operator</Label>
													<Select
														value={condition.operator}
														onValueChange={(v) =>
															updateCondition(ci, "operator", v as ConditionEntry["operator"])
														}
													>
														<SelectTrigger className="w-32">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="lt">Less than</SelectItem>
															<SelectItem value="lte">At most</SelectItem>
															<SelectItem value="gt">Greater than</SelectItem>
															<SelectItem value="gte">At least</SelectItem>
															<SelectItem value="eq">Equal to</SelectItem>
															<SelectItem value="between">Between</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div className="flex flex-col gap-1">
													<Label className="text-xs">Threshold</Label>
													<Input
														type="number"
														min={0}
														value={condition.threshold}
														onChange={(e) =>
															updateCondition(ci, "threshold", parseInt(e.target.value, 10) || 0)
														}
														className="w-20"
													/>
												</div>

												{condition.operator === "between" && (
													<div className="flex flex-col gap-1">
														<Label className="text-xs">Max</Label>
														<Input
															type="number"
															min={0}
															value={condition.thresholdMax ?? 0}
															onChange={(e) =>
																updateCondition(ci, "thresholdMax", parseInt(e.target.value, 10) || 0)
															}
															className="w-20"
														/>
													</div>
												)}

												<div className="flex flex-col gap-1">
													<Label className="text-xs">Label (optional)</Label>
													<Input
														value={condition.label ?? ""}
														onChange={(e) => updateCondition(ci, "label", e.target.value)}
														placeholder="e.g. Small class"
														className="w-36"
													/>
												</div>
											</div>

											{tiers.length > 0 && (
												<div className="flex flex-col gap-2">
													<Label className="text-xs font-medium">Rates by Trainer Tier</Label>
													<div className="divide-y divide-border/30">
														{tiers.map((tier: any) => {
															const rate = condition.rates.find(
																(r) => r.trainerTierId === tier.id,
															);
															return (
																<div key={tier.id} className="flex items-center gap-3 py-2">
																	<span className="flex-1 text-sm font-medium">{tier.name}</span>
																	<div className="flex items-center gap-2">
																		<Input
																			type="number"
																			min={0}
																			step={0.01}
																			value={rate?.amount ?? 0}
																			onChange={(e) =>
																				updateConditionRate(
																					ci,
																					tier.id,
																					parseFloat(e.target.value || "0"),
																				)
																			}
																			className="w-28 text-right"
																		/>
																		<span className="w-6 text-xs text-muted-foreground">{unitLabel}</span>
																	</div>
																</div>
															);
														})}
													</div>
												</div>
											)}
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				<div className="absolute bottom-0 left-0 right-0 flex justify-end gap-2 border-t bg-background px-6 py-4">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={upsertMutation.isPending || isLoadingConfig}>
						{upsertMutation.isPending ? "Saving..." : "Save Config"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
