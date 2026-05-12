"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ShoppingCart, UserX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CartSummary } from "@/components/pos/cart-summary";
import { CustomerStep } from "@/components/pos/customer-step";
import { ItemsStep } from "@/components/pos/items-step";
import { PaymentStep } from "@/components/pos/payment-step";
import { PromoStep } from "@/components/pos/promo-step";
import { TrainerPickerStep } from "@/components/pos/trainer-picker-step";
import type {
	AppliedPromo,
	CartItem,
	CustomerType,
	ItemTrainerAssignments,
	PaymentMethod,
	SelectedCustomer,
	TaxRateOption,
} from "@/components/pos/types";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepBadge({
	n,
	isComplete,
	isLocked,
}: {
	n: number;
	isComplete: boolean;
	isLocked: boolean;
}) {
	if (isComplete) {
		return (
			<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500">
				<Check className="size-3.5 text-white" />
			</span>
		);
	}
	if (isLocked) {
		return (
			<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground text-xs">
				{n}
			</span>
		);
	}
	return (
		<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
			{n}
		</span>
	);
}

function calcTotals(
	items: CartItem[],
	discountCents: number,
	taxRateBps: number,
) {
	const subtotalCents = items.reduce(
		(acc, item) => acc + item.unitPriceCents * item.quantity,
		0,
	);
	const taxBase = subtotalCents - discountCents;
	const taxCents = Math.floor((taxBase * taxRateBps) / 10000);
	const totalCents = taxBase + taxCents;
	return { subtotalCents, taxCents, totalCents };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface PosWorkflowProps {
	/** When set, fetches this customer and prefills the customer step. */
	prefillCustomerId?: string;
	/** Show the page header with back-link. Default true. */
	showHeader?: boolean;
	/** Hide the customer step entirely (useful when embedded with a fixed customer). */
	hideCustomerStep?: boolean;
	/** Called after a successful sale. Defaults to navigating to the receipt page. */
	onSaleCreated?: (salesOrderId: string) => void;
}

export function PosWorkflow({
	prefillCustomerId,
	showHeader = true,
	hideCustomerStep = false,
	onSaleCreated,
}: PosWorkflowProps) {
	const navigate = useNavigate();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — gate in-component
	const canCreate = hasPermission("pos:create");

	// ── Accordion state ────────────────────────────────────────────────────────
	const [accordionValue, setAccordionValue] = useState<string>(
		hideCustomerStep || prefillCustomerId ? "items" : "customer",
	);

	// ── Customer type toggle ───────────────────────────────────────────────────
	const [customerTypeMode, setCustomerTypeMode] =
		useState<CustomerType>("member");

	// ── Customer ───────────────────────────────────────────────────────────────
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(null);

	// ── Prefill customer (when prefillCustomerId provided) ────────────────────
	const prefillQuery = useQuery({
		queryKey: ["pos-prefill-customer", organizationId, prefillCustomerId],
		queryFn: () =>
			client.customerDirectory.getById({
				organizationId: organizationId!,
				memberId: prefillCustomerId!,
			}),
		enabled: !!organizationId && !!prefillCustomerId && !selectedCustomer,
	});

	useEffect(() => {
		if (!prefillCustomerId || selectedCustomer) return;
		const detail = prefillQuery.data;
		if (!detail) return;
		setCustomerTypeMode("member");
		setSelectedCustomer({
			type: "member",
			id: detail.member.id,
			name: detail.user.name,
			phone: detail.profile?.phone ?? null,
			email: detail.user.email,
			branchId: detail.member.hierarchyScopeId,
		});
		setAccordionValue("items");
	}, [prefillQuery.data, prefillCustomerId, selectedCustomer]);

	// ── Items ──────────────────────────────────────────────────────────────────
	const [items, setItems] = useState<CartItem[]>([]);
	const [clearCartDialogOpen, setClearCartDialogOpen] = useState(false);
	const pendingCustomerRef = useRef<SelectedCustomer | null>(null);

	// ── Branch (inferred from customer) ───────────────────────────────────────
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const defaultBranchId =
		currentOrg?.hierarchy?.member?.hierarchyScopeId ?? null;

	const resolvedBranchId = selectedCustomer?.branchId ?? defaultBranchId;

	// ── Promo ──────────────────────────────────────────────────────────────────
	const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

	// ── Tax ────────────────────────────────────────────────────────────────────
	const [selectedTaxRateId, setSelectedTaxRateId] = useState<string | null>(
		null,
	);
	const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);

	useQuery({
		queryKey: ["tax-rates", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			const rates = await client.taxRates.list({
				organizationId,
				isActive: true,
			});
			const options: TaxRateOption[] = rates.map((r) => ({
				id: r.id,
				name: r.name,
				rateInBasisPoints: r.rateInBasisPoints,
			}));
			setTaxRates(options);
			return rates;
		},
		enabled: !!organizationId,
	});

	useQuery({
		queryKey: ["tax-rates-default", organizationId],
		queryFn: async () => {
			if (!organizationId) return null;
			const rate = await client.taxRates.getDefault({ organizationId });
			if (rate && !selectedTaxRateId) {
				setSelectedTaxRateId(rate.id);
			}
			return rate;
		},
		enabled: !!organizationId,
	});

	const selectedTaxRate = taxRates.find((r) => r.id === selectedTaxRateId);
	const taxRateBps = selectedTaxRate?.rateInBasisPoints ?? 0;

	// ── Payment ────────────────────────────────────────────────────────────────
	const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
		null,
	);
	const [paymentReference, setPaymentReference] = useState("");
	const [amountTenderedCents, setAmountTenderedCents] = useState(0);
	const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<
		string | null
	>(null);

	// ── Notes ─────────────────────────────────────────────────────────────────
	const [notes, setNotes] = useState("");

	// ── Trainer assignments ───────────────────────────────────────────────────
	const [trainerAssignments, setTrainerAssignments] =
		useState<ItemTrainerAssignments>({});

	// ── Computed totals ────────────────────────────────────────────────────────
	const discountCents = appliedPromo?.discountCents ?? 0;
	const { subtotalCents, totalCents } = calcTotals(
		items,
		discountCents,
		taxRateBps,
	);

	const hasServiceItems = items.some(
		(item) => item.type === "service" && item.refId,
	);

	const promoStepN = hasServiceItems ? 4 : 3;
	const taxStepN = hasServiceItems ? 5 : 4;
	const paymentStepN = hasServiceItems ? 6 : 5;

	// ── Submit readiness ───────────────────────────────────────────────────────
	const hasCustomer =
		customerTypeMode === "walk_in" || selectedCustomer !== null;
	const hasItems = items.length > 0;
	const hasPaymentMethod = paymentMethod !== null;
	const cashOk =
		paymentMethod !== "cash" ||
		(amountTenderedCents >= totalCents && amountTenderedCents > 0);
	const isReadyToSubmit = hasCustomer && hasItems && hasPaymentMethod && cashOk;

	// ── Promo re-validation on items change ───────────────────────────────────
	const prevSubtotalRef = useRef(subtotalCents);
	useEffect(() => {
		if (appliedPromo && prevSubtotalRef.current !== subtotalCents) {
			setAppliedPromo(null);
			toast.info("Cart changed — promo code removed. Re-apply if still valid.");
		}
		prevSubtotalRef.current = subtotalCents;
	}, [subtotalCents, appliedPromo]);

	// ── Handlers: customer type mode ──────────────────────────────────────────

	function handleCustomerTypeModeChange(mode: CustomerType) {
		if (mode === customerTypeMode) return;
		setCustomerTypeMode(mode);
		setSelectedCustomer(null);
		setItems([]);
		setAppliedPromo(null);
	}

	// ── Handlers: customer ─────────────────────────────────────────────────────

	function handleCustomerSelect(customer: SelectedCustomer) {
		if (
			items.length > 0 &&
			selectedCustomer &&
			selectedCustomer.id !== customer.id
		) {
			pendingCustomerRef.current = customer;
			setClearCartDialogOpen(true);
			return;
		}
		setSelectedCustomer(customer);
		setAccordionValue("items");
	}

	function handleCustomerClear() {
		if (items.length > 0) {
			pendingCustomerRef.current = null;
			setClearCartDialogOpen(true);
		} else {
			setSelectedCustomer(null);
			setAppliedPromo(null);
		}
	}

	function confirmClearCart() {
		setItems([]);
		setAppliedPromo(null);
		setTrainerAssignments({});
		if (pendingCustomerRef.current) {
			setSelectedCustomer(pendingCustomerRef.current);
			pendingCustomerRef.current = null;
		} else {
			setSelectedCustomer(null);
		}
		setClearCartDialogOpen(false);
	}

	// ── Handlers: items ────────────────────────────────────────────────────────

	const handleAddItem = useCallback((item: CartItem) => {
		setItems((prev) => [...prev, item]);
	}, []);

	const handleUpdateItem = useCallback(
		(id: string, patch: Partial<CartItem>) => {
			setItems((prev) =>
				prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
			);
		},
		[],
	);

	const handleRemoveItem = useCallback((id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	// ── Submit mutation ────────────────────────────────────────────────────────

	const installmentPlansQuery = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.installmentPlans.list({ organizationId, activeOnly: true });
		},
		enabled: !!organizationId && selectedInstallmentPlanId !== null,
	});
	const selectedPlan = installmentPlansQuery.data?.find(
		(p) => p.id === selectedInstallmentPlanId,
	);

	const submitMutation = useApiMutation({
		mutationFn: async () => {
			if (!organizationId || !paymentMethod) {
				throw new Error("Missing required sale information.");
			}

			let customerType: "member" | "walk_in";
			let customerId: string;
			let customerName: string;

			if (customerTypeMode === "member") {
				if (!selectedCustomer) {
					throw new Error("Please select a member.");
				}
				customerType = "member";
				customerId = selectedCustomer.id;
				customerName = selectedCustomer.name;
			} else {
				customerType = "walk_in";
				customerId = "anonymous";
				customerName = "Walk-in";
			}

			if (!resolvedBranchId) {
				throw new Error(
					"Branch could not be determined. Please select a customer.",
				);
			}

			const filteredAssignments = Object.fromEntries(
				Object.entries(trainerAssignments)
					.map(([k, arr]) => [
						k,
						arr.filter((a) => a.staffId !== "").map((a) => ({
							staffId: a.staffId,
							slotIndex: a.slotIndex,
						})),
					])
					.filter(([, arr]) => (arr as unknown[]).length > 0),
			);

			return client.pos.recordSale({
				organizationId,
				customerType,
				customerId,
				customerName,
				branchId: resolvedBranchId,
				items: items.map((item) => ({
					type: item.type,
					refId: item.refId,
					description: item.description,
					quantity: item.quantity,
					unitPriceCents: item.unitPriceCents,
				})),
				promotionCode: appliedPromo?.code,
				taxRateId: selectedTaxRateId ?? undefined,
				paymentMethod,
				paymentReference: paymentReference || undefined,
				amountTenderedCents:
					paymentMethod === "cash" ? amountTenderedCents : undefined,
				installmentPlanCode: selectedPlan?.code,
				notes: notes || undefined,
				itemTrainerAssignments:
					Object.keys(filteredAssignments).length > 0
						? filteredAssignments
						: undefined,
			});
		},
		successMessage: "Sale recorded successfully!",
		errorMessage: (err) =>
			err.message || "Failed to record sale. Please try again.",
		onSuccess: (data) => {
			if (onSaleCreated) {
				onSaleCreated(data.salesOrderId);
			} else {
				navigate({
					to: "/dashboard/sales/$id",
					params: { id: data.salesOrderId },
				});
			}
		},
	});

	// ── Guards ─────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to record a sale.
			</div>
		);
	}

	if (!canCreate) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">You don't have permission to record sales.</p>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────

	const stepNumberOffset = hideCustomerStep ? -1 : 0;

	return (
		<div
			className={
				showHeader
					? "space-y-6 p-6 bg-muted/30 -m-6 min-h-full"
					: "space-y-6 p-6"
			}
		>
			{showHeader && (
				<div className="flex items-center gap-3">
					<Link to="/dashboard/sales/view">
						<Button variant="ghost" size="icon" className="size-8 shrink-0">
							<ArrowLeft className="size-4" />
						</Button>
					</Link>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-primary p-2.5 shadow-sm">
							<ShoppingCart className="size-5 text-primary-foreground" />
						</div>
						<div>
							<h1 className="font-bold font-heading text-xl leading-tight">
								New Sale
							</h1>
							<p className="text-muted-foreground text-xs">Point of sale</p>
						</div>
					</div>
				</div>
			)}

			{hideCustomerStep && selectedCustomer && (
				<div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
					<span className="text-muted-foreground">Customer: </span>
					<span className="font-medium">{selectedCustomer.name}</span>
					{selectedCustomer.phone && (
						<span className="text-muted-foreground">
							{" "}
							· {selectedCustomer.phone}
						</span>
					)}
				</div>
			)}

			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
				<div className="lg:col-span-2 space-y-4">
					<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
						<Accordion
							type="single"
							collapsible
							value={accordionValue}
							onValueChange={setAccordionValue}
							className="w-full"
						>
							{/* Step 1: Customer (hidden when embedded with prefilled customer) */}
							{!hideCustomerStep && (
								<AccordionItem value="customer">
									<AccordionTrigger className="px-5 font-semibold text-base hover:no-underline">
										<span className="flex items-center gap-2">
											<StepBadge n={1} isComplete={hasCustomer} isLocked={false} />
											Customer
											{customerTypeMode === "member" && selectedCustomer && (
												<span className="ml-1 font-normal text-muted-foreground text-sm">
													({selectedCustomer.name})
												</span>
											)}
											{customerTypeMode === "walk_in" && (
												<span className="ml-1 font-normal text-muted-foreground text-sm">
													(Walk-in)
												</span>
											)}
										</span>
									</AccordionTrigger>
									<AccordionContent className="px-5 pt-2 pb-6">
										<div className="space-y-4">
											<div className="flex gap-2">
												<Button
													type="button"
													size="sm"
													variant={
														customerTypeMode === "member" ? "default" : "outline"
													}
													onClick={() => handleCustomerTypeModeChange("member")}
													className="min-w-24"
												>
													Member
												</Button>
												<Button
													type="button"
													size="sm"
													variant={
														customerTypeMode === "walk_in" ? "default" : "outline"
													}
													onClick={() => handleCustomerTypeModeChange("walk_in")}
													className="min-w-24"
												>
													Walk-in
												</Button>
											</div>

											{customerTypeMode === "member" && (
												<CustomerStep
													organizationId={organizationId}
													branchId={resolvedBranchId}
													selected={selectedCustomer}
													onSelect={handleCustomerSelect}
													onClear={handleCustomerClear}
												/>
											)}

											{customerTypeMode === "walk_in" && (
												<div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
													<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
														<UserX className="size-4 text-muted-foreground" />
													</div>
													<div>
														<p className="font-medium text-sm">
															Anonymous Walk-in
														</p>
														<p className="text-muted-foreground text-xs">
															No customer record will be saved for this sale.
														</p>
													</div>
												</div>
											)}
										</div>
									</AccordionContent>
								</AccordionItem>
							)}

							{/* Step 2: Items */}
							<AccordionItem value="items">
								<AccordionTrigger
									disabled={!hasCustomer}
									className={`px-5 font-semibold text-base hover:no-underline ${!hasCustomer ? "cursor-not-allowed opacity-50" : ""}`}
								>
									<span className="flex items-center gap-2">
										<StepBadge
											n={2 + stepNumberOffset}
											isComplete={hasItems}
											isLocked={!hasCustomer}
										/>
										Items
										{items.length > 0 && (
											<span className="ml-1 font-normal text-muted-foreground text-sm">
												({items.length} item{items.length !== 1 ? "s" : ""})
											</span>
										)}
									</span>
								</AccordionTrigger>
								<AccordionContent className="px-5 pt-2 pb-6">
									{!hasCustomer ? (
										<p className="text-muted-foreground text-sm">
											Select a customer first before adding items.
										</p>
									) : (
										<ItemsStep
											organizationId={organizationId}
											selectedCustomer={selectedCustomer}
											items={items}
											onAddItem={handleAddItem}
											onUpdateItem={handleUpdateItem}
											onRemoveItem={handleRemoveItem}
										/>
									)}
								</AccordionContent>
							</AccordionItem>

							{hasServiceItems && (
								<AccordionItem value="trainers">
									<AccordionTrigger className="px-5 font-semibold text-base hover:no-underline">
										<span className="flex items-center gap-2">
											<StepBadge
												n={3 + stepNumberOffset}
												isComplete={false}
												isLocked={!hasItems}
											/>
											Trainers
											<span className="font-normal text-muted-foreground text-xs">
												(optional)
											</span>
										</span>
									</AccordionTrigger>
									<AccordionContent className="px-5 pt-2 pb-6">
										<TrainerPickerStep
											items={items}
											organizationId={organizationId}
											assignments={trainerAssignments}
											onChange={setTrainerAssignments}
										/>
										<Button
											className="mt-4 w-full"
											variant="outline"
											onClick={() => setAccordionValue("promo")}
											type="button"
										>
											Continue to Promotion
										</Button>
									</AccordionContent>
								</AccordionItem>
							)}

							<AccordionItem value="promo">
								<AccordionTrigger
									disabled={!hasCustomer}
									className={`px-5 font-semibold text-base hover:no-underline ${!hasCustomer ? "cursor-not-allowed opacity-50" : ""}`}
								>
									<span className="flex items-center gap-2">
										<StepBadge
											n={promoStepN + stepNumberOffset}
											isComplete={appliedPromo !== null}
											isLocked={!hasCustomer}
										/>
										Promotion
										{appliedPromo && (
											<span className="ml-1 font-normal text-green-600 text-sm">
												({appliedPromo.code})
											</span>
										)}
										<span className="font-normal text-muted-foreground text-xs">
											(optional)
										</span>
									</span>
								</AccordionTrigger>
								<AccordionContent className="px-5 pt-2 pb-6">
									{!hasCustomer ? (
										<p className="text-muted-foreground text-sm">
											Select a customer first to apply a promo code.
										</p>
									) : (
										<PromoStep
											organizationId={organizationId}
											customerId={
												customerTypeMode === "member"
													? (selectedCustomer?.id ?? "")
													: "anonymous"
											}
											branchId={resolvedBranchId}
											items={items}
											applied={appliedPromo}
											onApply={setAppliedPromo}
											onRemove={() => setAppliedPromo(null)}
										/>
									)}
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="tax">
								<AccordionTrigger className="px-5 font-semibold text-base hover:no-underline">
									<span className="flex items-center gap-2">
										<StepBadge
											n={taxStepN + stepNumberOffset}
											isComplete={true}
											isLocked={false}
										/>
										Tax
										{selectedTaxRate && (
											<span className="ml-1 font-normal text-muted-foreground text-sm">
												({selectedTaxRate.name},{" "}
												{(selectedTaxRate.rateInBasisPoints / 100).toFixed(0)}%)
											</span>
										)}
									</span>
								</AccordionTrigger>
								<AccordionContent className="px-5 pt-2 pb-6">
									<div className="space-y-1.5">
										<Label htmlFor="tax-rate">Tax rate</Label>
										<Select
											value={selectedTaxRateId ?? "none"}
											onValueChange={(v) =>
												setSelectedTaxRateId(v === "none" ? null : v)
											}
										>
											<SelectTrigger id="tax-rate" className="w-full max-w-xs">
												<SelectValue placeholder="No tax" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">No tax</SelectItem>
												{taxRates.map((rate) => (
													<SelectItem key={rate.id} value={rate.id}>
														{rate.name} (
														{(rate.rateInBasisPoints / 100).toFixed(0)}%)
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="payment">
								<AccordionTrigger className="px-5 font-semibold text-base hover:no-underline">
									<span className="flex items-center gap-2">
										<StepBadge
											n={paymentStepN + stepNumberOffset}
											isComplete={hasPaymentMethod && cashOk}
											isLocked={false}
										/>
										Payment
										{paymentMethod && (
											<span className="ml-1 font-normal text-muted-foreground text-sm capitalize">
												({" "}
												{paymentMethod === "bank_transfer"
													? "Bank Transfer"
													: paymentMethod.charAt(0).toUpperCase() +
														paymentMethod.slice(1)}
												)
											</span>
										)}
									</span>
								</AccordionTrigger>
								<AccordionContent className="px-5 pt-2 pb-6">
									<PaymentStep
										organizationId={organizationId}
										items={items}
										discountCents={discountCents}
										taxRateBps={taxRateBps}
										method={paymentMethod}
										paymentReference={paymentReference}
										amountTenderedCents={amountTenderedCents}
										selectedInstallmentPlanId={selectedInstallmentPlanId}
										onMethodChange={setPaymentMethod}
										onReferenceChange={setPaymentReference}
										onAmountTenderedChange={setAmountTenderedCents}
										onInstallmentPlanChange={setSelectedInstallmentPlanId}
									/>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</div>

					<div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="sale-notes" className="text-sm font-medium">
								Notes{" "}
								<span className="font-normal text-muted-foreground">
									(optional)
								</span>
							</Label>
							<Textarea
								id="sale-notes"
								placeholder="Any special instructions or notes..."
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								rows={2}
								className="resize-none"
							/>
						</div>

						<div className="flex items-center justify-between gap-4 pt-1">
							<div className="text-muted-foreground text-sm">
								{!isReadyToSubmit && (
									<span>
										{!hasCustomer
											? "Select a customer"
											: !hasItems
												? "Add at least one item"
												: !hasPaymentMethod
													? "Choose a payment method"
													: !cashOk
														? "Enter the tendered cash amount"
														: ""}
									</span>
								)}
							</div>
							<Button
								size="lg"
								disabled={!isReadyToSubmit || submitMutation.isPending}
								onClick={() => submitMutation.mutate()}
								className="min-w-44 font-semibold"
							>
								{submitMutation.isPending ? (
									<>
										<LoadingSpinner size="sm" className="mr-2" />
										Processing…
									</>
								) : (
									"Charge & Confirm"
								)}
							</Button>
						</div>
					</div>
				</div>

				<div className="lg:sticky lg:top-6 lg:col-span-1">
					<CartSummary
						items={items}
						discountCents={discountCents}
						taxRateBps={taxRateBps}
						paymentMethod={paymentMethod}
						amountTenderedCents={amountTenderedCents}
					/>
				</div>
			</div>

			<Dialog open={clearCartDialogOpen} onOpenChange={setClearCartDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Clear cart?</DialogTitle>
					</DialogHeader>
					<p className="py-2 text-muted-foreground text-sm">
						Changing the customer will clear all items from the cart. This
						cannot be undone.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setClearCartDialogOpen(false);
								pendingCustomerRef.current = null;
							}}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmClearCart}>
							Clear Cart & Continue
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
