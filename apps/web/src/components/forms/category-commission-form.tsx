"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { client } from "@/utils/orpc";
import { centsToRm, rmToCents } from "@/lib/money";

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
		const { config, slots: apiSlots, rates: apiRates, conditions: apiConditions } = existingConfig;
		setPaymentType((config.paymentType ?? "fixed") as "fixed" | "variable");
		setIsConditional(config.isConditional ?? false);
		setMaxCoaches(config.maxCoaches ?? 1);
		setSlots(
			(apiSlots ?? []).map((s) => ({
				slotIndex: s.slotIndex,
				label: s.label,
				weightageBasisPoints: s.weightageBasisPoints,
			})),
		);
		if (!config.isConditional) {
			setRates(
				(apiRates ?? []).map((r) => ({
					trainerTierId: r.trainerTierId,
					amount: Number(centsToRm(r.amount)),
				})),
			);
			setConditions([]);
		} else {
			setRates([]);
			setConditions(
				(apiConditions ?? []).map(({ condition, rates: cr }) => ({
					conditionIndex: condition.conditionIndex,
					operator: condition.operator as ConditionEntry["operator"],
					threshold: condition.threshold,
					thresholdMax: condition.thresholdMax ?? undefined,
					label: condition.label ?? undefined,
					rates: (cr ?? []).map((r) => ({
						trainerTierId: r.trainerTierId,
						amount: Number(centsToRm(r.amount)),
					})),
				})),
			);
		}
	}, [existingConfig]);

	useEffect(() => {
		if (tiers.length === 0 || rates.length > 0) return;
		setRates(tiers.map((t) => ({ trainerTierId: t.id, amount: 0 })));
	}, [tiers]);

	const upsertMutation = useApiMutation({
		mutationFn: (payload: Parameters<typeof client.categoryCommission.upsert>[0]) =>
			client.categoryCommission.upsert(payload),
		successMessage: "Commission config saved",
		errorMessage: (err) => err.message || "Failed to save",
		onSuccess: () => onOpenChange(false),
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
			rates: isConditional ? undefined : rates.map((r) => ({ ...r, amount: rmToCents(r.amount) })),
			conditions: isConditional
				? conditions.map((c) => ({
						...c,
						rates: c.rates.map((r) => ({ ...r, amount: rmToCents(r.amount) })),
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
			prev.reduce<SlotEntry[]>((acc, sl, i) => {
				if (i === index) return acc;
				acc.push({ ...sl, slotIndex: acc.length });
				return acc;
			}, []),
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
				rates: tiers.map((t) => ({ trainerTierId: t.id, amount: 0 })),
			},
		]);
	}

	function removeCondition(index: number) {
		setConditions((prev) =>
			prev.reduce<ConditionEntry[]>((acc, c, i) => {
				if (i === index) return acc;
				acc.push({ ...c, conditionIndex: acc.length });
				return acc;
			}, []),
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
				<DialogHeader className="mb-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<DialogTitle>Commission Config</DialogTitle>
							<DialogDescription>{categoryName}</DialogDescription>
						</div>
						{!isLoadingConfig && (
							existingConfig
								? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">Configured</Badge>
								: <Badge variant="outline" className="text-muted-foreground shrink-0">No config yet</Badge>
						)}
					</div>
				</DialogHeader>

				{isLoadingConfig ? (
					<div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
						Loading…
					</div>
				) : (
					<div className="flex flex-col gap-5 overflow-y-auto -mx-6 px-6">
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
											className="size-8 p-0"
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								))}
							</div>

							<Button size="sm" variant="outline" onClick={addSlot} className="w-fit">
								<Plus className="mr-2 size-3.5" />
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
										{tiers.map((tier) => {
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
										<Plus className="mr-2 size-3.5" />
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
													className="size-7 p-0"
												>
													<Trash2 className="size-3.5" />
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
														{tiers.map((tier) => {
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

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={upsertMutation.isPending || isLoadingConfig}>
						{upsertMutation.isPending ? "Saving..." : "Save Config"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
