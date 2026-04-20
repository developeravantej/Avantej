import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CartSummary } from "@/components/pos/cart-summary";
import { CustomerStep } from "@/components/pos/customer-step";
import { ItemsStep } from "@/components/pos/items-step";
import { PaymentStep } from "@/components/pos/payment-step";
import { PromoStep } from "@/components/pos/promo-step";
import type {
	AppliedPromo,
	CartItem,
	CustomerType,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

// ─── Route definition ──────────────────────────────────────────────────────────

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/create",
)({
	component: PosCreatePage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page component ────────────────────────────────────────────────────────────

function PosCreatePage() {
	const navigate = useNavigate();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — gate in-component
	const canCreate = hasPermission("pos:create");

	// ── Accordion state ────────────────────────────────────────────────────────
	const [accordionValue, setAccordionValue] = useState<string>("customer");

	// ── Customer type toggle ───────────────────────────────────────────────────
	const [customerTypeMode, setCustomerTypeMode] =
		useState<CustomerType>("member");

	// ── Customer ───────────────────────────────────────────────────────────────
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(null);

	// ── Walk-in customers list (loaded when walk-in mode is active) ────────────
	const walkInCustomersQuery = useQuery({
		queryKey: ["walkInCustomers-pos", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return (client as any).walkInCustomers.list({
				organizationId,
				isActive: true,
				limit: 100,
			}) as Promise<
				Array<{
					id: string;
					name: string;
					phone: string | null;
					email?: string | null;
					branchId?: string | null;
				}>
			>;
		},
		enabled: !!organizationId && customerTypeMode === "walk_in",
	});

	// ── Walk-in mode: selected walk-in customer id ─────────────────────────────
	const [selectedWalkInId, setSelectedWalkInId] = useState<string | null>(null);

	// ── Items ──────────────────────────────────────────────────────────────────
	const [items, setItems] = useState<CartItem[]>([]);
	const [clearCartDialogOpen, setClearCartDialogOpen] = useState(false);
	const pendingCustomerRef = useRef<SelectedCustomer | null>(null);

	// ── Branch (inferred from customer) ───────────────────────────────────────
	// Decision: trust branchId returned by searchCustomers. For members, the
	// backend resolves hierarchyScopeId. Fallback: use org member's scope.
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const defaultBranchId =
		currentOrg?.hierarchy?.member?.hierarchyScopeId ?? null;

	// For walk-in mode, resolve branchId from the selected walk-in record
	const selectedWalkIn =
		customerTypeMode === "walk_in" && selectedWalkInId
			? (walkInCustomersQuery.data ?? []).find((c) => c.id === selectedWalkInId)
			: null;

	const resolvedBranchId =
		customerTypeMode === "member"
			? (selectedCustomer?.branchId ?? defaultBranchId)
			: (selectedWalkIn?.branchId ?? defaultBranchId);

	// ── Promo ──────────────────────────────────────────────────────────────────
	const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

	// ── Tax ────────────────────────────────────────────────────────────────────
	const [selectedTaxRateId, setSelectedTaxRateId] = useState<string | null>(
		null,
	);
	const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);

	// Load tax rates
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

	// Load default tax rate
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

	// ── Computed totals ────────────────────────────────────────────────────────
	const discountCents = appliedPromo?.discountCents ?? 0;
	const { subtotalCents, totalCents } = calcTotals(
		items,
		discountCents,
		taxRateBps,
	);

	// ── Submit readiness ───────────────────────────────────────────────────────
	const hasCustomer =
		customerTypeMode === "member"
			? selectedCustomer !== null
			: selectedWalkInId !== null;
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
			// Items changed — remove promo and notify user (server re-validates on submit)
			setAppliedPromo(null);
			toast.info("Cart changed — promo code removed. Re-apply if still valid.");
		}
		prevSubtotalRef.current = subtotalCents;
	}, [subtotalCents, appliedPromo]);

	// ── Handlers: customer type mode ──────────────────────────────────────────

	function handleCustomerTypeModeChange(mode: CustomerType) {
		if (mode === customerTypeMode) return;
		// Switching modes resets both customer selections and clears the cart
		setCustomerTypeMode(mode);
		setSelectedCustomer(null);
		setSelectedWalkInId(null);
		setItems([]);
		setAppliedPromo(null);
	}

	// ── Handlers: customer ─────────────────────────────────────────────────────

	function handleCustomerSelect(customer: SelectedCustomer) {
		// If items exist and we're changing customer, warn about branch lock
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

	// Load installment plan code for submission
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

	const submitMutation = useMutation({
		mutationFn: async () => {
			if (!organizationId || !paymentMethod || !selectedTaxRateId) {
				throw new Error("Missing required sale information.");
			}

			// Resolve customer details based on mode
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
				if (!selectedWalkInId || !selectedWalkIn) {
					throw new Error("Please select a walk-in customer.");
				}
				customerType = "walk_in";
				customerId = selectedWalkIn.id;
				customerName = selectedWalkIn.name;
			}

			if (!resolvedBranchId) {
				throw new Error(
					"Branch could not be determined. Please select a customer.",
				);
			}

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
				taxRateId: selectedTaxRateId,
				paymentMethod,
				paymentReference: paymentReference || undefined,
				amountTenderedCents:
					paymentMethod === "cash" ? amountTenderedCents : undefined,
				installmentPlanCode: selectedPlan?.code,
				notes: notes || undefined,
			});
		},
		onSuccess: (data) => {
			toast.success("Sale recorded successfully!");
			navigate({
				to: "/dashboard/sales/$id",
				params: { id: data.salesOrderId },
			});
		},
		onError: (err) => {
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to record sale. Please try again.",
			);
		},
	});

	// ── Guard: no org ──────────────────────────────────────────────────────────

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

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Link to="/dashboard/sales/view">
					<Button variant="ghost" size="icon" className="h-8 w-8">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-primary/10 p-2">
						<ShoppingCart className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="font-bold font-heading text-2xl">New Sale</h1>
						<p className="text-muted-foreground text-sm">
							Record an in-store sale
						</p>
					</div>
				</div>
			</div>

			{/* Two-column layout: form + cart */}
			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
				{/* Left: stepped form */}
				<div className="lg:col-span-2">
					<Accordion
						type="single"
						collapsible
						value={accordionValue}
						onValueChange={setAccordionValue}
						className="w-full"
					>
						{/* Step 1: Customer */}
						<AccordionItem value="customer">
							<AccordionTrigger className="font-semibold text-base hover:no-underline">
								<span className="flex items-center gap-2">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										1
									</span>
									Customer
									{customerTypeMode === "member" && selectedCustomer && (
										<span className="ml-1 font-normal text-muted-foreground text-sm">
											— {selectedCustomer.name}
										</span>
									)}
									{customerTypeMode === "walk_in" && selectedWalkIn && (
										<span className="ml-1 font-normal text-muted-foreground text-sm">
											— {selectedWalkIn.name}
										</span>
									)}
								</span>
							</AccordionTrigger>
							<AccordionContent className="pt-3 pb-5">
								<div className="space-y-4">
									{/* Customer type toggle */}
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

									{/* Member search */}
									{customerTypeMode === "member" && (
										<CustomerStep
											organizationId={organizationId}
											branchId={resolvedBranchId}
											selected={selectedCustomer}
											onSelect={handleCustomerSelect}
											onClear={handleCustomerClear}
										/>
									)}

									{/* Walk-in customer picker */}
									{customerTypeMode === "walk_in" && (
										<div className="space-y-1.5">
											<Label htmlFor="walk-in-customer">Walk-in customer</Label>
											<Select
												value={selectedWalkInId ?? ""}
												onValueChange={(v) => {
													setSelectedWalkInId(v || null);
													// Advance to items when a walk-in is selected
													if (v) setAccordionValue("items");
												}}
											>
												<SelectTrigger
													id="walk-in-customer"
													className="w-full max-w-sm"
												>
													<SelectValue placeholder="Select a walk-in customer..." />
												</SelectTrigger>
												<SelectContent>
													{walkInCustomersQuery.isLoading && (
														<SelectItem value="_loading" disabled>
															Loading...
														</SelectItem>
													)}
													{!walkInCustomersQuery.isLoading &&
														(walkInCustomersQuery.data ?? []).length === 0 && (
															<SelectItem value="_empty" disabled>
																No walk-in customers — add one first.
															</SelectItem>
														)}
													{(walkInCustomersQuery.data ?? []).map((c) => (
														<SelectItem key={c.id} value={c.id}>
															{c.name}
															{c.phone ? ` · ${c.phone}` : ""}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
								</div>
							</AccordionContent>
						</AccordionItem>

						{/* Step 2: Items */}
						<AccordionItem value="items">
							<AccordionTrigger className="font-semibold text-base hover:no-underline">
								<span className="flex items-center gap-2">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										2
									</span>
									Items
									{items.length > 0 && (
										<span className="ml-1 font-normal text-muted-foreground text-sm">
											— {items.length} item{items.length !== 1 ? "s" : ""}
										</span>
									)}
								</span>
							</AccordionTrigger>
							<AccordionContent className="pt-3 pb-5">
								{!hasCustomer ? (
									<p className="text-muted-foreground text-sm">
										Select a customer first before adding items.
									</p>
								) : (
									<ItemsStep
										organizationId={organizationId}
										isWalkIn={customerTypeMode === "walk_in"}
										items={items}
										onAddItem={handleAddItem}
										onUpdateItem={handleUpdateItem}
										onRemoveItem={handleRemoveItem}
									/>
								)}
							</AccordionContent>
						</AccordionItem>

						{/* Step 3: Promo */}
						<AccordionItem value="promo">
							<AccordionTrigger className="font-semibold text-base hover:no-underline">
								<span className="flex items-center gap-2">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										3
									</span>
									Promotion
									{appliedPromo && (
										<span className="ml-1 font-normal text-green-600 text-sm">
											— {appliedPromo.code}
										</span>
									)}
									<span className="font-normal text-muted-foreground text-xs">
										(optional)
									</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className="pt-3 pb-5">
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
												: (selectedWalkInId ?? "")
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

						{/* Step 4: Tax */}
						<AccordionItem value="tax">
							<AccordionTrigger className="font-semibold text-base hover:no-underline">
								<span className="flex items-center gap-2">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										4
									</span>
									Tax
									{selectedTaxRate && (
										<span className="ml-1 font-normal text-muted-foreground text-sm">
											— {selectedTaxRate.name} (
											{(selectedTaxRate.rateInBasisPoints / 100).toFixed(0)}%)
										</span>
									)}
								</span>
							</AccordionTrigger>
							<AccordionContent className="pt-3 pb-5">
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

						{/* Step 5: Payment */}
						<AccordionItem value="payment">
							<AccordionTrigger className="font-semibold text-base hover:no-underline">
								<span className="flex items-center gap-2">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										5
									</span>
									Payment
									{paymentMethod && (
										<span className="ml-1 font-normal text-muted-foreground text-sm capitalize">
											—{" "}
											{paymentMethod === "bank_transfer"
												? "Bank Transfer"
												: paymentMethod.charAt(0).toUpperCase() +
													paymentMethod.slice(1)}
										</span>
									)}
								</span>
							</AccordionTrigger>
							<AccordionContent className="pt-3 pb-5">
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

					{/* Notes */}
					<div className="mt-4 space-y-1.5">
						<Label htmlFor="sale-notes">Notes (optional)</Label>
						<Textarea
							id="sale-notes"
							placeholder="Any special instructions or notes about this sale..."
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
						/>
					</div>

					<Separator className="my-5" />

					{/* Submit */}
					<div className="flex items-center justify-between gap-4">
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
							className="min-w-40"
						>
							{submitMutation.isPending ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
									Processing...
								</>
							) : (
								"Charge & Confirm"
							)}
						</Button>
					</div>
				</div>

				{/* Right: cart summary (sticky on desktop) */}
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

			{/* Clear cart confirmation dialog */}
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
