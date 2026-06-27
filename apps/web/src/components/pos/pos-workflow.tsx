import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
	AppliedPromo,
	CartItem,
	CustomerType,
	ItemTrainerAssignments,
	PaymentMethod,
	SelectedCustomer,
	TaxRateOption,
} from "@/components/pos/types";
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
import { client } from "@/utils/orpc";
import { calcTotals, deriveScopeLeafBranchId } from "./workflow/helpers";
import { PosHeader } from "./workflow/PosHeader";
import { CustomerStepCard } from "./workflow/CustomerStepCard";
import { ItemsStepCard } from "./workflow/ItemsStepCard";
import { PromoStepCard } from "./workflow/PromoStepCard";
import { PaymentStepCard } from "./workflow/PaymentStepCard";
import { ConfirmStepCard } from "./workflow/ConfirmStepCard";
import { LiveOrderPanel } from "./workflow/LiveOrderPanel";
import { ClearCartDialog } from "./workflow/ClearCartDialog";
import { getInitials } from "./workflow/helpers";

// Logical step indices:
// 0 = Customer, 1 = Items, 2 = Promo, 3 = Payment, 4 = Confirm
type StepIndex = 0 | 1 | 2 | 3 | 4;

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

	// ── Step state ─────────────────────────────────────────────────────────────
	const initialStep: StepIndex = hideCustomerStep || prefillCustomerId ? 1 : 0;
	const [currentStep, setCurrentStep] = useState<StepIndex>(initialStep);

	// ── Customer type toggle ───────────────────────────────────────────────────
	const [customerTypeMode, setCustomerTypeMode] =
		useState<CustomerType>("member");

	// ── Customer ───────────────────────────────────────────────────────────────
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(null);

	// ── Prefill customer ──────────────────────────────────────────────────────
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
		setCurrentStep(1);
	}, [prefillQuery.data, prefillCustomerId, selectedCustomer]);

	// ── Items ──────────────────────────────────────────────────────────────────
	const [items, setItems] = useState<CartItem[]>([]);
	const [clearCartDialogOpen, setClearCartDialogOpen] = useState(false);
	const pendingCustomerRef = useRef<SelectedCustomer | null>(null);

	// ── Branch (recording target) ─────────────────────────────────────────────
	// POS is a WRITE path: the scope switcher is NOT a read filter here. The sale
	// records under its OWN branch. We only SEED that branch's default from the
	// active scope — and only when the active scope is a concrete LEAF BRANCH.
	const { scopeNodeId, scopeNodes } = useScope();
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberHomeBranchId =
		currentOrg?.hierarchy?.member?.hierarchyScopeId ?? null;

	// Convenience seed: when the picked scope is a leaf branch, default the
	// recording branch to it. For "All"/region/country/state scopes this returns
	// null, so we keep the member-home default — we NEVER auto-pick a sale under a
	// non-leaf node. This only sets the default; the customer's own branch still
	// takes precedence and the cashier confirms before recording.
	const scopeLeafBranchId = deriveScopeLeafBranchId(scopeNodeId, scopeNodes);
	const defaultBranchId = scopeLeafBranchId ?? memberHomeBranchId;

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
	const [tenderedTouched, setTenderedTouched] = useState(false);
	const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<
		string | null
	>(null);
	const [preferredTrainerId, setPreferredTrainerId] = useState<string | null>(
		null,
	);

	// ── Trainer assignments ───────────────────────────────────────────────────
	const [trainerAssignments, setTrainerAssignments] =
		useState<ItemTrainerAssignments>({});

	// ── Notes ─────────────────────────────────────────────────────────────────
	const [notes, setNotes] = useState("");

	// ── Origination attribution (Task #24) ────────────────────────────────────
	// soldBy: the closer (defaults to logged-in user's id; clearable)
	// leadSourceUserId: optional referrer (cross-DB user id)
	const currentUserId = userContext?.user?.id ?? null;
	const [soldBy, setSoldBy] = useState<string | null>(null);
	const [leadSourceUserId, setLeadSourceUserId] = useState<string | null>(null);

	// Fetch all active staff/members for the attribution selects
	const { data: staffMembers = [] } = useQuery({
		queryKey: ["members-staff-all", organizationId],
		queryFn: () =>
			client.members.list({
				organizationId: organizationId!,
				status: "active",
			}),
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});

	// Default soldBy to current user id when it loads (only once)
	useEffect(() => {
		if (soldBy !== null) return;
		if (!currentUserId) return;
		setSoldBy(currentUserId);
	}, [currentUserId, soldBy]);

	// ── Last receipt (populated after a successful sale in this session) ───────
	const [lastReceipt, setLastReceipt] = useState<{
		orgName: string;
		customerName: string;
		items: CartItem[];
		subtotalCents: number;
		discountCents: number;
		taxCents: number;
		totalCents: number;
		paymentMethod: PaymentMethod | null;
		timestamp: Date;
		// Stripe Payment Link for online sales — the customer pays here; webhook
		// completes the order. Null for cash/card/transfer sales.
		paymentLinkUrl: string | null;
	} | null>(null);

	// ── Seed lastReceipt from API on first mount (covers "first sale of session")
	const latestSaleQuery = useQuery({
		queryKey: ["pos-latest-sale", organizationId],
		queryFn: () =>
			client.salesOrders.getLatest({
				organizationId: organizationId!,
			}),
		enabled: !!organizationId,
		// Single fetch on mount — no background refetch needed for a seed value
		staleTime: Number.POSITIVE_INFINITY,
	});

	useEffect(() => {
		// Only seed once: skip if we already have an in-session receipt
		if (lastReceipt) return;
		const data = latestSaleQuery.data;
		if (!data) return;

		const { order, items: apiItems, paymentMethod: apiPaymentMethod } = data;

		// Map salesOrderItems rows to CartItem shape
		const cartItems: CartItem[] = apiItems.map((item) => ({
			id: item.id,
			type: item.serviceId ? "service" : "custom",
			refId: item.serviceId ?? undefined,
			description: item.description,
			quantity: item.quantity,
			unitPriceCents: item.unitPrice,
		}));

		const subtotalCents = cartItems.reduce(
			(acc, item) => acc + item.unitPriceCents * item.quantity,
			0,
		);

		setLastReceipt({
			orgName:
				userContext?.organizations.find((o) => o.id === organizationId)?.name ??
				"—",
			customerName: order.customerName,
			items: cartItems,
			subtotalCents,
			// Discount and tax are not stored on the order row — show 0 for historical seed
			discountCents: 0,
			taxCents:
				order.totalAmount - subtotalCents > 0
					? order.totalAmount - subtotalCents
					: 0,
			totalCents: order.totalAmount,
			paymentMethod: (apiPaymentMethod as PaymentMethod | null) ?? null,
			timestamp: order.createdAt,
			// getLatest only returns completed sales — no pending link to surface
			paymentLinkUrl: null,
		});
	}, [latestSaleQuery.data, lastReceipt, organizationId, userContext]);

	// ── Computed totals ────────────────────────────────────────────────────────
	const discountCents = appliedPromo?.discountCents ?? 0;
	const { subtotalCents, taxCents, totalCents } = calcTotals(
		items,
		discountCents,
		taxRateBps,
	);

	const hasServiceItems = items.some(
		(item) => item.type === "service" && item.refId,
	);

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
		setCurrentStep(1);
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
		setPreferredTrainerId(null);
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
		enabled: !!organizationId,
	});
	const selectedPlan = installmentPlansQuery.data?.find(
		(p) => p.id === selectedInstallmentPlanId,
	);

	// Amount the customer pays at POS (first instalment when a plan is selected)
	// DOMAIN INVARIANT: dueNowCents is the installment amount, not the full price
	const dueNowCents = selectedPlan
		? Math.round(
				(totalCents * (1 + (selectedPlan.pricePremiumBps ?? 0) / 10000)) /
					selectedPlan.numInstallments,
			)
		: totalCents;

	// ── Submit readiness ───────────────────────────────────────────────────────
	const hasCustomer =
		customerTypeMode === "walk_in" || selectedCustomer !== null;
	const hasItems = items.length > 0;
	const hasPaymentMethod = paymentMethod !== null;
	const cashOk =
		paymentMethod !== "cash" ||
		(amountTenderedCents >= dueNowCents && amountTenderedCents > 0);
	const isReadyToSubmit = hasCustomer && hasItems && hasPaymentMethod && cashOk;

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
					"Your account has no branch assigned. Please contact your administrator to assign your account to a branch.",
				);
			}

			// FE-M6: assignments are keyed by item.id (string); server expects numeric array-index keys.
			// Remap item-ID → current array index so the service layer can look up items[index].
			const filteredAssignments = Object.fromEntries(
				Object.entries(trainerAssignments)
					.map(([itemId, arr]) => {
						const arrayIndex = items.findIndex((i) => i.id === itemId);
						if (arrayIndex === -1) return null;
						const filtered = arr
							.filter((a) => a.staffId !== "")
							.map((a) => ({ staffId: a.staffId, slotIndex: a.slotIndex }));
						return filtered.length > 0 ? [String(arrayIndex), filtered] : null;
					})
					.filter(
						(
							entry,
						): entry is [string, { staffId: string; slotIndex: number }[]] =>
							entry !== null,
					),
			);

			const sale = await client.pos.recordSale({
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
				// DOMAIN INVARIANT: preferredTrainerId carries commission to the specific trainer.
				// When null, server routes commission via rotation queue.
				preferredTrainerId: preferredTrainerId ?? undefined,
				notes: notes || undefined,
				itemTrainerAssignments:
					Object.keys(filteredAssignments).length > 0
						? filteredAssignments
						: undefined,
				// Origination attribution (Task #24) — both optional
				soldBy: soldBy ?? undefined,
				leadSourceUserId: leadSourceUserId ?? undefined,
			});

			// Plan B Phase 3c.1 — online (Stripe) sales: the sale itself is recorded
			// in `pending`; create the real Stripe Payment Link on the org's connected
			// account so the customer can pay. The payment_intent.succeeded webhook
			// then flips order→completed / payment→succeeded / package→active.
			// Link-creation failure must NOT fail the sale (it's already recorded) —
			// staff can regenerate from the sale detail page.
			let paymentLinkUrl: string | null = null;
			let paymentLinkError: string | null = null;
			if (paymentMethod === "stripe" || paymentMethod === "online") {
				try {
					const link = await client.payments.createSalesOrderPaymentLink({
						organizationId,
						salesOrderId: sale.salesOrderId,
					});
					paymentLinkUrl = link.paymentLinkUrl;
				} catch (err) {
					paymentLinkError =
						err instanceof Error
							? err.message
							: "Failed to create payment link";
				}
			}

			return { ...sale, paymentLinkUrl, paymentLinkError };
		},
		successMessage: "Sale recorded successfully!",
		errorMessage: (err) => {
			if (
				(err as unknown as { data?: { cause?: string } }).data?.cause ===
				"non_client_member"
			) {
				return "This customer is staff/admin and cannot be a sale target. Use a client account or walk-in mode.";
			}
			return err.message || "Failed to record sale. Please try again.";
		},
		onSuccess: (data) => {
			// Online sale: link creation failed after the sale was recorded —
			// surface a warning (the sale itself succeeded; staff can regenerate).
			if (data.paymentLinkError) {
				toast.warning(
					`Sale recorded, but the Stripe payment link could not be created: ${data.paymentLinkError}`,
				);
			}

			// Snapshot the receipt before state is reset
			setLastReceipt({
				orgName:
					userContext?.organizations.find((o) => o.id === organizationId)
						?.name ?? "—",
				customerName: customerLabel ?? "Walk-in",
				items: [...items],
				subtotalCents,
				discountCents,
				taxCents,
				totalCents,
				paymentMethod,
				timestamp: new Date(),
				paymentLinkUrl: data.paymentLinkUrl,
			});

			// FE-C1: Reset all sale state after a completed sale
			setItems([]);
			setAppliedPromo(null);
			setPaymentMethod(null);
			setPaymentReference("");
			setAmountTenderedCents(0);
			setTenderedTouched(false);
			setSelectedInstallmentPlanId(null);
			setPreferredTrainerId(null);
			setTrainerAssignments({});
			setNotes("");
			// Reset attribution — soldBy re-defaults to current member via the useEffect above
			setSoldBy(null);
			setLeadSourceUserId(null);
			setCurrentStep(hideCustomerStep || prefillCustomerId ? 1 : 0);
			// Keep selectedCustomer if customer is prefilled/locked
			if (!hideCustomerStep && !prefillCustomerId) setSelectedCustomer(null);

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
			<div className="flex min-h-96 flex-1 items-center justify-center text-[#737373]">
				Select an organization to record a sale.
			</div>
		);
	}

	if (!canCreate) {
		return (
			<div className="flex min-h-96 flex-1 items-center justify-center text-[#737373]">
				<div className="space-y-2 text-center">
					<p className="font-medium text-[#0a0a0a]">Permission Denied</p>
					<p className="text-sm">You don't have permission to record sales.</p>
				</div>
			</div>
		);
	}

	// ── Step helpers ──────────────────────────────────────────────────────────

	// Logical step → card state
	// When hideCustomerStep, step 0 is skipped; we offset so step 1 appears as card index 0
	function stepState(logical: StepIndex): "done" | "active" | "idle" {
		if (logical < currentStep) return "done";
		if (logical === currentStep) return "active";
		return "idle";
	}

	// Step 0 → 1 needs customer
	// Step 1 → 2 needs items
	// Step 2 → 3 (promo is optional — always passable)
	// Step 3 → 4 needs payment + cashOk
	function canAdvanceFrom(step: StepIndex): boolean {
		if (step === 0) return hasCustomer;
		if (step === 1) return hasItems;
		if (step === 2) return true; // promo optional
		if (step === 3) return hasPaymentMethod && cashOk;
		return false;
	}

	function handleNext() {
		if (!canAdvanceFrom(currentStep as StepIndex)) return;
		setCurrentStep((s) => Math.min(s + 1, 4) as StepIndex);
	}

	// ── Live clock ────────────────────────────────────────────────────────────
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	// ── Derived display values ────────────────────────────────────────────────

	const customerLabel =
		customerTypeMode === "walk_in"
			? "Walk-in"
			: (selectedCustomer?.name ?? null);

	const customerInitials =
		customerTypeMode === "walk_in" ? "WI" : getInitials(customerLabel ?? "");

	const today = now.toLocaleString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const orgName = userContext?.organizations.find(
		(o) => o.id === organizationId,
	)?.name;

	// ─────────────────────────────────────────────────────────────────────────
	// Render
	// ─────────────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-1 flex-col bg-[#f3f3f3] overflow-hidden">
			{/* ── Page header ─────────────────────────────────────────────────── */}
			{showHeader && <PosHeader today={today} />}

			{/* ── Two-column layout ─────────────────────────────────────────── */}
			<div className="flex flex-1 overflow-hidden">
				<div className="flex w-full flex-1 gap-6 overflow-hidden px-6 py-6">
					{/* ── LEFT: Step cards ──────────────────────────────────────────── */}
					<div
						className="flex flex-1 flex-col gap-4 overflow-y-auto [&::-webkit-scrollbar]:hidden"
						style={{ scrollbarWidth: "none" }}
					>
						{/* ── STEP 0: Customer ─────────────────────────────────────── */}
						{!hideCustomerStep && (
							<CustomerStepCard
								state={stepState(0)}
								stepNumber={1}
								stepLabel="Step 1"
								customerTypeMode={customerTypeMode}
								customerLabel={customerLabel}
								customerInitials={customerInitials}
								hasCustomer={hasCustomer}
								selectedCustomer={selectedCustomer}
								organizationId={organizationId}
								resolvedBranchId={resolvedBranchId}
								onEdit={() => setCurrentStep(0)}
								onCustomerTypeModeChange={handleCustomerTypeModeChange}
								onCustomerSelect={handleCustomerSelect}
								onCustomerClear={handleCustomerClear}
								onContinue={handleNext}
							/>
						)}

						{/* ── STEP 1: Items ──────────────────────────────────────────── */}
						<ItemsStepCard
							state={stepState(1)}
							stepNumber={hideCustomerStep ? 1 : 2}
							stepLabel={hideCustomerStep ? "Step 1" : "Step 2"}
							hideCustomerStep={hideCustomerStep}
							customerLabel={customerLabel}
							customerInitials={customerInitials}
							customerTypeMode={customerTypeMode}
							organizationId={organizationId}
							selectedCustomer={selectedCustomer}
							items={items}
							hasServiceItems={hasServiceItems}
							trainerAssignments={trainerAssignments}
							taxRates={taxRates}
							selectedTaxRateId={selectedTaxRateId}
							notes={notes}
							hasItems={hasItems}
							onEdit={() => setCurrentStep(1)}
							onGoToCustomer={() => setCurrentStep(0)}
							onAddItem={handleAddItem}
							onUpdateItem={handleUpdateItem}
							onRemoveItem={handleRemoveItem}
							onTrainerAssignmentsChange={setTrainerAssignments}
							onTaxRateChange={setSelectedTaxRateId}
							onNotesChange={setNotes}
							onContinue={handleNext}
						/>

						{/* ── STEP 2: Promotions ─────────────────────────────────────── */}
						<PromoStepCard
							state={stepState(2)}
							stepNumber={hideCustomerStep ? 2 : 3}
							stepLabel={hideCustomerStep ? "Step 2" : "Step 3"}
							organizationId={organizationId}
							customerTypeMode={customerTypeMode}
							selectedCustomerId={selectedCustomer?.id ?? null}
							resolvedBranchId={resolvedBranchId}
							items={items}
							appliedPromo={appliedPromo}
							discountCents={discountCents}
							onEdit={() => setCurrentStep(2)}
							onApply={setAppliedPromo}
							onRemove={() => setAppliedPromo(null)}
							onBack={() => setCurrentStep(1)}
							onContinue={handleNext}
						/>

						{/* ── STEP 3: Payment ────────────────────────────────────────── */}
						<PaymentStepCard
							state={stepState(3)}
							stepNumber={hideCustomerStep ? 3 : 4}
							stepLabel={hideCustomerStep ? "Step 3" : "Step 4"}
							organizationId={organizationId}
							items={items}
							discountCents={discountCents}
							taxRateBps={taxRateBps}
							dueNowCents={dueNowCents}
							paymentMethod={paymentMethod}
							paymentReference={paymentReference}
							amountTenderedCents={amountTenderedCents}
							tenderedTouched={tenderedTouched}
							selectedInstallmentPlanId={selectedInstallmentPlanId}
							preferredTrainerId={preferredTrainerId}
							hasPaymentMethod={hasPaymentMethod}
							cashOk={cashOk}
							onEdit={() => setCurrentStep(3)}
							onMethodChange={setPaymentMethod}
							onReferenceChange={setPaymentReference}
							onAmountTenderedChange={setAmountTenderedCents}
							onTenderedTouched={() => setTenderedTouched(true)}
							onInstallmentPlanChange={setSelectedInstallmentPlanId}
							onPreferredTrainerChange={setPreferredTrainerId}
							onBack={() => setCurrentStep(2)}
							onContinue={handleNext}
						/>

						{/* ── STEP 4: Confirm ─────────────────────────────────────────── */}
						<ConfirmStepCard
							state={stepState(4)}
							stepNumber={hideCustomerStep ? 4 : 5}
							stepLabel={hideCustomerStep ? "Step 4" : "Step 5"}
							customerLabel={customerLabel}
							items={items}
							paymentMethod={paymentMethod}
							appliedPromo={appliedPromo}
							discountCents={discountCents}
							taxCents={taxCents}
							taxRateBps={taxRateBps}
							selectedTaxRate={selectedTaxRate}
							selectedPlan={selectedPlan}
							dueNowCents={dueNowCents}
							totalCents={totalCents}
							amountTenderedCents={amountTenderedCents}
							notes={notes}
							staffMembers={
								staffMembers as Array<{
									id: string;
									userId?: string;
									name?: string;
									role?: string;
								}>
							}
							soldBy={soldBy}
							leadSourceUserId={leadSourceUserId}
							isReadyToSubmit={isReadyToSubmit}
							isPending={submitMutation.isPending}
							onBack={() => setCurrentStep(3)}
							onSoldByChange={setSoldBy}
							onLeadSourceChange={setLeadSourceUserId}
							onSubmit={() => submitMutation.mutate()}
						/>
					</div>

					{/* ── RIGHT: Live order panel ───────────────────────────────────── */}
					<LiveOrderPanel
						hideCustomerStep={hideCustomerStep}
						customerLabel={customerLabel}
						customerTypeMode={customerTypeMode}
						items={items}
						appliedPromo={appliedPromo}
						paymentMethod={paymentMethod}
						discountCents={discountCents}
						taxCents={taxCents}
						taxRateBps={taxRateBps}
						selectedTaxRate={selectedTaxRate}
						selectedPlan={selectedPlan}
						dueNowCents={dueNowCents}
						subtotalCents={subtotalCents}
						totalCents={totalCents}
						stepState={stepState}
						now={now}
						today={today}
						lastReceipt={lastReceipt}
						organizationId={organizationId}
						orgName={orgName}
					/>
				</div>
			</div>

			{/* ── Clear cart dialog ──────────────────────────────────────────── */}
			<ClearCartDialog
				open={clearCartDialogOpen}
				onOpenChange={setClearCartDialogOpen}
				onCancel={() => {
					setClearCartDialogOpen(false);
					pendingCustomerRef.current = null;
				}}
				onConfirm={confirmClearCart}
			/>
		</div>
	);
}
