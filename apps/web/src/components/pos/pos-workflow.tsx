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
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

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

function getInitials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

function formatPaymentLabel(method: PaymentMethod | null): string {
	if (!method) return "—";
	const labels: Record<PaymentMethod, string> = {
		cash: "Cash",
		card: "Card",
		manual_transfer: "Bank Transfer (Manual)",
		fpx: "FPX",
		stripe: "Stripe",
		online: "Online (Payment Link)",
	};
	return labels[method] ?? (method as string);
}

// ─── Design-5 token classes ────────────────────────────────────────────────────
// paper: #f3f3f3  line: #e5e5e5  ink: #0a0a0a  warm: #d6cdb1

// ─── Timeline step dot ────────────────────────────────────────────────────────

function TlDot({ state, n }: { state: "done" | "active" | "idle"; n: number }) {
	return (
		<div
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold",
				state === "done" && "bg-[#0a0a0a] text-white",
				state === "active" &&
					"border-2 border-[#0a0a0a] bg-white text-[#0a0a0a]",
				state === "idle" && "border-2 border-[#e5e5e5] bg-white text-[#a3a3a3]",
			)}
		>
			{state === "done" ? (
				<svg width="12" height="12" fill="white" viewBox="0 0 16 16">
					<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
				</svg>
			) : (
				n
			)}
		</div>
	);
}

// ─── Right-panel timeline dot ─────────────────────────────────────────────────

function LiveDot({ state }: { state: "done" | "active" | "idle" }) {
	return (
		<div
			className={cn(
				"flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
				state === "done" && "bg-[#0a0a0a]",
				state === "active" && "border-2 border-[#0a0a0a] bg-white",
				state === "idle" && "border-2 border-[#e5e5e5] bg-white",
			)}
		>
			{state === "done" && (
				<svg width="10" height="10" fill="white" viewBox="0 0 16 16">
					<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
				</svg>
			)}
		</div>
	);
}

// ─── Step card shell ─────────────────────────────────────────────────────────

function StepCard({
	n,
	label,
	stepLabel,
	state,
	badge,
	onEdit,
	children,
}: {
	n: number;
	label: string;
	stepLabel: string;
	state: "done" | "active" | "idle";
	badge?: React.ReactNode;
	onEdit?: () => void;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"rounded-2xl border bg-white p-5 transition-opacity duration-200",
				state === "active" && "border-[#0a0a0a] shadow-sm",
				state === "done" && "border-[#e5e5e5]",
				state === "idle" &&
					"border-[#e5e5e5] opacity-50 pointer-events-none select-none",
			)}
			style={state === "active" ? { borderWidth: "1.5px" } : {}}
		>
			{/* Step header */}
			<div className="flex items-center gap-3">
				<TlDot state={state} n={n} />
				<div className="flex-1 min-w-0">
					<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						{stepLabel}
					</p>
					<p
						className={cn(
							"text-sm font-bold",
							state === "idle" ? "text-[#737373]" : "text-[#0a0a0a]",
						)}
					>
						{label}
					</p>
				</div>
				{state === "done" && onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="rounded-[10px] px-2.5 py-1 text-[11px] font-medium text-[#737373] transition hover:bg-[#f3f3f3] hover:text-[#0a0a0a]"
					>
						Edit
					</button>
				)}
				{state === "idle" && badge}
			</div>

			{/* Expanded content */}
			{state !== "idle" && children && <div className="mt-4">{children}</div>}
		</div>
	);
}

// ─── Locked badge ─────────────────────────────────────────────────────────────

function LockedBadge() {
	return (
		<span className="ml-auto inline-flex items-center rounded-full border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
			Locked
		</span>
	);
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

// Logical step indices:
// 0 = Customer, 1 = Items, 2 = Promo, 3 = Payment, 4 = Confirm
type StepIndex = 0 | 1 | 2 | 3 | 4;

const STEP_DEFS = [
	{ label: "Customer", stepLabel: "Step 1" },
	{ label: "Items", stepLabel: "Step 2" },
	{ label: "Promotions & Discounts", stepLabel: "Step 3" },
	{ label: "Payment Method", stepLabel: "Step 4" },
	{ label: "Confirm & Charge", stepLabel: "Step 5" },
] as const;

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

	// ─────────────────────────────────────────────────────────────────────────
	// Render
	// ─────────────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-1 flex-col bg-[#f3f3f3] overflow-hidden">
			{/* ── Page header ─────────────────────────────────────────────────── */}
			{showHeader && (
				<div className="flex items-end justify-between border-b border-[#e5e5e5] bg-[#f3f3f3] px-6 pb-4 pt-5">
					<div className="flex items-end gap-4">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a0a0a] text-white">
							<ShoppingCart className="h-5 w-5" />
						</div>
						<div>
							<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Point of Sale
							</p>
							<h1 className="text-[28px] font-extrabold leading-none tracking-tight text-[#0a0a0a]">
								New Sale
							</h1>
							<p className="mt-0.5 text-sm text-[#737373]">{today}</p>
						</div>
					</div>
					<div className="flex items-center gap-2 pb-1">
						<Link to="/dashboard/sales/view">
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
							>
								<ArrowLeft className="h-3.5 w-3.5" />
								Sales
							</button>
						</Link>
					</div>
				</div>
			)}

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
							<StepCard
								n={1}
								label={STEP_DEFS[0].label}
								stepLabel={STEP_DEFS[0].stepLabel}
								state={stepState(0)}
								badge={<LockedBadge />}
								onEdit={() => setCurrentStep(0)}
							>
								{/* Active content */}
								{currentStep === 0 && (
									<div className="flex flex-col gap-4">
										{/* Mode toggle */}
										<div className="flex gap-2">
											<button
												type="button"
												onClick={() => handleCustomerTypeModeChange("member")}
												className={cn(
													"rounded-[10px] px-4 py-2 text-sm font-semibold transition-all",
													customerTypeMode === "member"
														? "bg-[#0a0a0a] text-white"
														: "border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#a3a3a3]",
												)}
											>
												Member
											</button>
											<button
												type="button"
												onClick={() => handleCustomerTypeModeChange("walk_in")}
												className={cn(
													"rounded-[10px] px-4 py-2 text-sm font-semibold transition-all",
													customerTypeMode === "walk_in"
														? "bg-[#0a0a0a] text-white"
														: "border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#a3a3a3]",
												)}
											>
												Walk-in
											</button>
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
											<div className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
												<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1]">
													<UserX className="h-5 w-5 text-[#0a0a0a]" />
												</div>
												<div>
													<p className="text-sm font-semibold text-[#0a0a0a]">
														Anonymous Walk-in
													</p>
													<p className="text-xs text-[#737373]">
														No customer record will be saved for this sale.
													</p>
												</div>
											</div>
										)}

										{/* Continue button */}
										<div className="flex justify-end pt-1">
											<button
												type="button"
												disabled={!hasCustomer}
												onClick={handleNext}
												className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
											>
												Continue to Items →
											</button>
										</div>
									</div>
								)}

								{/* Done summary */}
								{stepState(0) === "done" && (
									<div className="flex items-center gap-3 rounded-xl bg-[#f3f3f3] px-3 py-2.5">
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1] text-xs font-bold text-[#0a0a0a]">
											{customerInitials}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-semibold text-[#0a0a0a]">
												{customerLabel}
											</p>
											<p className="text-[11px] text-[#737373]">
												{customerTypeMode === "member" ? "Member" : "Walk-in"}
											</p>
										</div>
										<span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
											Active
										</span>
									</div>
								)}
							</StepCard>
						)}

						{/* ── STEP 1: Items ──────────────────────────────────────────── */}
						<StepCard
							n={hideCustomerStep ? 1 : 2}
							label={STEP_DEFS[1].label}
							stepLabel={hideCustomerStep ? "Step 1" : STEP_DEFS[1].stepLabel}
							state={stepState(1)}
							badge={<LockedBadge />}
							onEdit={() => setCurrentStep(1)}
						>
							{currentStep === 1 && (
								<div className="flex flex-col gap-4">
									{/* Customer recap pill */}
									{customerLabel && (
										<div className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5">
											<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-[10px] font-bold text-white">
												{customerInitials}
											</div>
											<div className="flex-1 min-w-0">
												<p className="truncate text-sm font-semibold text-[#0a0a0a]">
													{customerLabel}
												</p>
												<p className="text-[11px] text-[#737373]">
													{customerTypeMode === "member" ? "Member" : "Walk-in"}
												</p>
											</div>
											{!hideCustomerStep && (
												<button
													type="button"
													onClick={() => setCurrentStep(0)}
													className="rounded-[10px] px-2 py-1 text-[11px] font-medium text-[#737373] transition hover:bg-white hover:text-[#0a0a0a]"
												>
													Change
												</button>
											)}
										</div>
									)}

									<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
										Add Items
									</p>

									<ItemsStep
										organizationId={organizationId}
										selectedCustomer={selectedCustomer}
										items={items}
										onAddItem={handleAddItem}
										onUpdateItem={handleUpdateItem}
										onRemoveItem={handleRemoveItem}
										isWalkIn={customerTypeMode === "walk_in"}
									/>

									{/* Optional: trainer assignment */}
									{hasServiceItems && (
										<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
											<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Trainer Assignment{" "}
												<span className="normal-case font-normal">
													(optional)
												</span>
											</p>
											<TrainerPickerStep
												items={items}
												organizationId={organizationId}
												assignments={trainerAssignments}
												onChange={setTrainerAssignments}
											/>
										</div>
									)}

									{/* Tax */}
									{taxRates.length > 0 && (
										<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
											<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Tax Rate
											</p>
											<div className="space-y-1.5">
												<Label htmlFor="tax-rate" className="sr-only">
													Tax rate
												</Label>
												<Select
													value={selectedTaxRateId ?? "none"}
													onValueChange={(v) =>
														setSelectedTaxRateId(v === "none" ? null : v)
													}
												>
													<SelectTrigger
														id="tax-rate"
														className="w-full max-w-xs border-[#e5e5e5]"
													>
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
										</div>
									)}

									{/* Notes */}
									<div className="space-y-1.5">
										<Label
											htmlFor="sale-notes"
											className="text-xs font-medium text-[#0a0a0a]"
										>
											Notes{" "}
											<span className="font-normal text-[#737373]">
												(optional)
											</span>
										</Label>
										<Textarea
											id="sale-notes"
											placeholder="Any special instructions or notes..."
											value={notes}
											onChange={(e) => setNotes(e.target.value)}
											rows={2}
											className="resize-none border-[#e5e5e5]"
										/>
									</div>

									{/* Continue */}
									<div className="flex justify-end pt-1">
										<button
											type="button"
											disabled={!hasItems}
											onClick={handleNext}
											className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
										>
											Continue to Promotions →
										</button>
									</div>
								</div>
							)}

							{/* Done summary */}
							{stepState(1) === "done" && items.length > 0 && (
								<div className="mt-3 space-y-2">
									{items.map((item) => (
										<div
											key={item.id}
											className="flex items-center justify-between text-sm"
										>
											<div className="flex items-center gap-2">
												<span className="flex h-5 w-5 items-center justify-center rounded border border-[#e5e5e5] bg-[#f3f3f3] text-[10px] font-bold text-[#0a0a0a]">
													×{item.quantity}
												</span>
												<span className="font-medium text-[#0a0a0a]">
													{item.description}
												</span>
											</div>
											<span className="font-mono tabular-nums font-bold text-[#0a0a0a]">
												{formatPrice(
													item.unitPriceCents * item.quantity,
													"MYR",
												)}
											</span>
										</div>
									))}
								</div>
							)}
						</StepCard>

						{/* ── STEP 2: Promotions ─────────────────────────────────────── */}
						<StepCard
							n={hideCustomerStep ? 2 : 3}
							label={STEP_DEFS[2].label}
							stepLabel={hideCustomerStep ? "Step 2" : STEP_DEFS[2].stepLabel}
							state={stepState(2)}
							badge={<LockedBadge />}
							onEdit={() => setCurrentStep(2)}
						>
							{currentStep === 2 && (
								<div className="flex flex-col gap-4">
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

									<div className="flex justify-between pt-1">
										<button
											type="button"
											onClick={() => setCurrentStep(1)}
											className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:border-[#a3a3a3]"
										>
											← Back
										</button>
										<button
											type="button"
											onClick={handleNext}
											className="rounded-xl bg-[#0a0a0a] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#262626]"
										>
											Continue to Payment →
										</button>
									</div>
								</div>
							)}

							{/* Done summary */}
							{stepState(2) === "done" && (
								<div className="mt-3">
									{appliedPromo ? (
										<div className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2">
											<span className="text-sm font-semibold text-[#0a0a0a]">
												{appliedPromo.code}
											</span>
											<span className="font-mono tabular-nums text-sm font-semibold text-green-700">
												−{formatPrice(discountCents, "MYR")}
											</span>
										</div>
									) : (
										<p className="text-sm text-[#737373]">
											No promotion applied
										</p>
									)}
								</div>
							)}
						</StepCard>

						{/* ── STEP 3: Payment ────────────────────────────────────────── */}
						<StepCard
							n={hideCustomerStep ? 3 : 4}
							label={STEP_DEFS[3].label}
							stepLabel={hideCustomerStep ? "Step 3" : STEP_DEFS[3].stepLabel}
							state={stepState(3)}
							badge={<LockedBadge />}
							onEdit={() => setCurrentStep(3)}
						>
							{currentStep === 3 && (
								<div className="flex flex-col gap-5">
									<PaymentStep
										organizationId={organizationId}
										items={items}
										discountCents={discountCents}
										taxRateBps={taxRateBps}
										dueNowCents={dueNowCents}
										method={paymentMethod}
										paymentReference={paymentReference}
										amountTenderedCents={amountTenderedCents}
										tenderedTouched={tenderedTouched}
										selectedInstallmentPlanId={selectedInstallmentPlanId}
										preferredTrainerId={preferredTrainerId}
										onMethodChange={setPaymentMethod}
										onReferenceChange={setPaymentReference}
										onAmountTenderedChange={setAmountTenderedCents}
										onTenderedTouched={() => setTenderedTouched(true)}
										onInstallmentPlanChange={setSelectedInstallmentPlanId}
										onPreferredTrainerChange={setPreferredTrainerId}
									/>

									<div className="flex justify-between pt-1">
										<button
											type="button"
											onClick={() => setCurrentStep(2)}
											className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:border-[#a3a3a3]"
										>
											← Back
										</button>
										<button
											type="button"
											disabled={!(hasPaymentMethod && cashOk)}
											onClick={handleNext}
											className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
										>
											Review & Confirm →
										</button>
									</div>
								</div>
							)}

							{/* Done summary */}
							{stepState(3) === "done" && paymentMethod && (
								<div className="mt-3 flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2">
									<span className="text-sm font-semibold text-[#0a0a0a]">
										{formatPaymentLabel(paymentMethod)}
									</span>
									{paymentReference && (
										<span className="font-mono text-xs text-[#737373]">
											Ref: {paymentReference}
										</span>
									)}
								</div>
							)}
						</StepCard>

						{/* ── STEP 4: Confirm ─────────────────────────────────────────── */}
						<StepCard
							n={hideCustomerStep ? 4 : 5}
							label={STEP_DEFS[4].label}
							stepLabel={hideCustomerStep ? "Step 4" : STEP_DEFS[4].stepLabel}
							state={stepState(4)}
							badge={<LockedBadge />}
						>
							{currentStep === 4 && (
								<div className="flex flex-col gap-5">
									{/* Order recap table */}
									<div className="overflow-hidden rounded-xl border border-[#e5e5e5]">
										<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
											<span className="text-sm text-[#737373]">Customer</span>
											<span className="text-sm font-semibold text-[#0a0a0a]">
												{customerLabel ?? "Walk-in"}
											</span>
										</div>
										<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
											<span className="text-sm text-[#737373]">Items</span>
											<span className="text-sm font-semibold text-[#0a0a0a]">
												{items.length} item{items.length !== 1 ? "s" : ""}
											</span>
										</div>
										<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
											<span className="text-sm text-[#737373]">Payment</span>
											<span className="text-sm font-semibold text-[#0a0a0a]">
												{formatPaymentLabel(paymentMethod)}
											</span>
										</div>
										{discountCents > 0 && (
											<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
												<span className="text-sm text-green-700">
													Discount ({appliedPromo?.code})
												</span>
												<span className="font-mono tabular-nums text-sm text-green-700">
													−{formatPrice(discountCents, "MYR")}
												</span>
											</div>
										)}
										{taxCents > 0 && (
											<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
												<span className="text-sm text-[#737373]">
													{selectedTaxRate?.name ?? "Tax"} (
													{(taxRateBps / 100).toFixed(0)}%)
												</span>
												<span className="font-mono tabular-nums text-sm text-[#737373]">
													{formatPrice(taxCents, "MYR")}
												</span>
											</div>
										)}
										<div className="flex items-center justify-between bg-[#f3f3f3] px-4 py-3">
											<span className="text-base font-bold text-[#0a0a0a]">
												{selectedPlan
													? `Due Today (1/${selectedPlan.numInstallments})`
													: "Total"}
											</span>
											<span className="font-mono tabular-nums text-xl font-bold text-[#0a0a0a]">
												{formatPrice(dueNowCents, "MYR")}
											</span>
										</div>
									</div>

									{/* CartSummary (detailed line items) */}
									<CartSummary
										items={items}
										discountCents={discountCents}
										taxRateBps={taxRateBps}
										dueNowCents={dueNowCents}
										paymentMethod={paymentMethod}
										amountTenderedCents={amountTenderedCents}
									/>

									{notes && (
										<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
											<p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Notes
											</p>
											<p className="text-sm text-[#0a0a0a]">{notes}</p>
										</div>
									)}

									{/* ── Origination attribution (Task #24) ─────────────────── */}
									<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
										<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Attribution{" "}
											<span className="normal-case font-normal">
												(optional)
											</span>
										</p>
										<div className="flex flex-col gap-3">
											{/* Sold by */}
											<div className="flex flex-col gap-1.5">
												<Label className="text-xs font-medium text-[#0a0a0a]">
													Sold by
												</Label>
												<Select
													value={soldBy ?? "none"}
													onValueChange={(v) =>
														setSoldBy(v === "none" ? null : v)
													}
												>
													<SelectTrigger className="w-full max-w-xs border-[#e5e5e5] bg-white text-sm">
														<SelectValue placeholder="No attribution" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="none">No attribution</SelectItem>
														{(
															staffMembers as Array<{
																id: string;
																userId?: string;
																name?: string;
																role?: string;
															}>
														).map((m) => (
															<SelectItem
																key={m.userId ?? m.id}
																value={m.userId ?? m.id}
															>
																{m.name ?? m.id}
																{m.role ? ` (${m.role})` : ""}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>

											{/* Lead source */}
											<div className="flex flex-col gap-1.5">
												<Label className="text-xs font-medium text-[#0a0a0a]">
													Lead source{" "}
													<span className="font-normal text-[#737373]">
														(referrer)
													</span>
												</Label>
												<Select
													value={leadSourceUserId ?? "none"}
													onValueChange={(v) =>
														setLeadSourceUserId(v === "none" ? null : v)
													}
												>
													<SelectTrigger className="w-full max-w-xs border-[#e5e5e5] bg-white text-sm">
														<SelectValue placeholder="None" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="none">None</SelectItem>
														{(
															staffMembers as Array<{
																id: string;
																userId?: string;
																name?: string;
																role?: string;
															}>
														).map((m) => (
															<SelectItem
																key={m.userId ?? m.id}
																value={m.userId ?? m.id}
															>
																{m.name ?? m.id}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
									</div>

									<div className="rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] px-4 py-3 text-xs text-[#737373]">
										Review the order above before confirming. This action cannot
										be undone.
									</div>

									<div className="flex justify-between pt-1">
										<button
											type="button"
											onClick={() => setCurrentStep(3)}
											className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:border-[#a3a3a3]"
										>
											← Back
										</button>
										<Button
											disabled={!isReadyToSubmit || submitMutation.isPending}
											onClick={() => submitMutation.mutate()}
											className="min-w-44 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#262626] disabled:opacity-35"
											data-testid="pos-complete-sale-button"
										>
											{submitMutation.isPending ? (
												<>
													<LoadingSpinner size="sm" className="mr-2" />
													Processing...
												</>
											) : (
												<>
													Charge & Confirm
													<Check className="ml-1.5 h-4 w-4" />
												</>
											)}
										</Button>
									</div>
								</div>
							)}

							{/* Locked placeholder */}
							{stepState(4) === "idle" && (
								<div className="mt-4 flex h-12 items-center justify-center rounded-xl bg-[#f3f3f3] text-xs text-[#a3a3a3]">
									Complete previous steps to unlock
								</div>
							)}
						</StepCard>
					</div>

					{/* ── RIGHT: Live order panel ───────────────────────────────────── */}
					<div
						className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto [&::-webkit-scrollbar]:hidden"
						style={{ scrollbarWidth: "none" }}
					>
						{/* Live order summary */}
						<div className="flex flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
							{/* Header */}
							<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
								<p className="text-sm font-bold text-[#0a0a0a]">Live Order</p>
								<p className="font-mono text-[10px] text-[#737373]">
									{now.toLocaleString("en-MY", {
										hour: "2-digit",
										minute: "2-digit",
										second: "2-digit",
									})}
								</p>
							</div>

							{/* Step timeline */}
							<div className="flex-1 space-y-4 px-4 py-4">
								{/* Step 0: Customer */}
								{!hideCustomerStep && (
									<>
										<div className="flex items-start gap-3">
											<LiveDot state={stepState(0)} />
											<div className="flex-1">
												<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
													Customer
												</p>
												{stepState(0) === "done" ||
												stepState(0) === "active" ? (
													<p className="text-xs font-semibold text-[#0a0a0a]">
														{customerLabel ??
															(customerTypeMode === "walk_in"
																? "Walk-in"
																: "—")}
													</p>
												) : (
													<p className="text-xs text-[#a3a3a3]">Not selected</p>
												)}
											</div>
										</div>
										<div className="ml-[9px] h-4 w-px bg-[#e5e5e5]" />
									</>
								)}

								{/* Step 1: Items */}
								<div className="flex items-start gap-3">
									<LiveDot state={stepState(1)} />
									<div className="flex-1">
										<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Items {items.length > 0 ? `(${items.length})` : ""}
										</p>
										{items.length > 0 ? (
											<p className="text-xs text-[#404040]">
												{items.map((i) => i.description).join(", ")}
											</p>
										) : (
											<p className="text-xs text-[#a3a3a3]">None added</p>
										)}
									</div>
								</div>
								<div className="ml-[9px] h-4 w-px bg-[#e5e5e5]" />

								{/* Step 2: Promotions */}
								<div className="flex items-start gap-3">
									<LiveDot state={stepState(2)} />
									<div className="flex-1">
										<p
											className={cn(
												"text-[10px] font-bold uppercase tracking-widest",
												stepState(2) === "active"
													? "text-[#0a0a0a]"
													: "text-[#737373]",
											)}
										>
											Promotions
										</p>
										{appliedPromo ? (
											<p className="text-xs font-semibold text-amber-600">
												{appliedPromo.code} — saves{" "}
												{formatPrice(discountCents, "MYR")}
											</p>
										) : stepState(2) === "done" ? (
											<p className="text-xs text-[#737373]">None applied</p>
										) : null}
									</div>
								</div>
								<div className="ml-[9px] h-4 w-px bg-[#e5e5e5]" />

								{/* Step 3: Payment */}
								<div
									className={cn(
										"flex items-start gap-3",
										stepState(3) === "idle" && "opacity-40",
									)}
								>
									<LiveDot state={stepState(3)} />
									<div className="flex-1">
										<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Payment
										</p>
										{paymentMethod && (
											<p className="text-xs font-semibold text-[#0a0a0a]">
												{formatPaymentLabel(paymentMethod)}
											</p>
										)}
									</div>
								</div>
								<div className="ml-[9px] h-4 w-px bg-[#e5e5e5]" />

								{/* Step 4: Confirm */}
								<div
									className={cn(
										"flex items-start gap-3",
										stepState(4) === "idle" && "opacity-40",
									)}
								>
									<LiveDot state={stepState(4)} />
									<div>
										<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Confirm
										</p>
									</div>
								</div>
							</div>

							{/* Live totals */}
							<div className="border-t border-[#e5e5e5] px-4 py-4 space-y-1.5">
								<div className="flex justify-between text-xs text-[#737373]">
									<span>Items ({items.length})</span>
									<span className="font-mono tabular-nums">
										{formatPrice(subtotalCents, "MYR")}
									</span>
								</div>
								{discountCents > 0 && (
									<div className="flex justify-between text-xs text-amber-600">
										<span>Promo {appliedPromo?.code}</span>
										<span className="font-mono tabular-nums">
											−{formatPrice(discountCents, "MYR")}
										</span>
									</div>
								)}
								{taxCents > 0 && (
									<div className="flex justify-between text-xs text-[#737373]">
										<span>
											{selectedTaxRate?.name ?? "Tax"} (
											{(taxRateBps / 100).toFixed(0)}%)
										</span>
										<span className="font-mono tabular-nums">
											{formatPrice(taxCents, "MYR")}
										</span>
									</div>
								)}
								<hr className="border-t border-[#e5e5e5]" />
								<div className="flex justify-between text-base font-extrabold text-[#0a0a0a]">
									<span>{selectedPlan ? "Due Today" : "Est. Total"}</span>
									<span className="font-mono tabular-nums">
										{formatPrice(dueNowCents, "MYR")}
									</span>
								</div>
								{selectedPlan && totalCents !== dueNowCents && (
									<div className="flex justify-between text-xs text-[#737373]">
										<span>
											Full total ({selectedPlan.numInstallments} instalments)
										</span>
										<span className="font-mono tabular-nums">
											{formatPrice(
												Math.round(
													totalCents *
														(1 + (selectedPlan.pricePremiumBps ?? 0) / 10000),
												),
												"MYR",
											)}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* ── Print styles (injected once, harmless when not printing) ── */}
						<style>{`
							@media print {
								body * { visibility: hidden; }
								#pos-receipt-print, #pos-receipt-print * { visibility: visible; }
								#pos-receipt-print { position: absolute; left: 0; top: 0; }
							}
						`}</style>

						{/* Last Receipt Preview */}
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
							<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Last Receipt Preview
							</p>

							{/* Receipt block — given the print id so @media print can isolate it */}
							<div
								id="pos-receipt-print"
								className="rounded-xl bg-[#f3f3f3] p-3 font-mono text-[10px] text-[#737373] space-y-1"
							>
								{lastReceipt ? (
									<>
										<p className="text-center font-bold text-[11px] text-[#0a0a0a]">
											{lastReceipt.orgName.toUpperCase()}
										</p>
										<p className="text-center">
											{lastReceipt.timestamp.toLocaleString("en-MY", {
												dateStyle: "medium",
												timeStyle: "short",
											})}
										</p>
										<hr className="border-dashed border-[#e5e5e5]" />
										<p className="text-[9px] text-[#a3a3a3]">
											Customer: {lastReceipt.customerName}
										</p>
										<hr className="border-dashed border-[#e5e5e5]" />
										{lastReceipt.items.map((item) => (
											<div key={item.id} className="flex justify-between">
												<span className="truncate max-w-[120px]">
													{item.description} ×{item.quantity}
												</span>
												<span className="tabular-nums">
													{formatPrice(
														item.unitPriceCents * item.quantity,
														"MYR",
													)}
												</span>
											</div>
										))}
										<hr className="border-dashed border-[#e5e5e5]" />
										{lastReceipt.discountCents > 0 && (
											<div className="flex justify-between text-[#737373]">
												<span>Discount</span>
												<span className="tabular-nums">
													−{formatPrice(lastReceipt.discountCents, "MYR")}
												</span>
											</div>
										)}
										{lastReceipt.taxCents > 0 && (
											<div className="flex justify-between text-[#737373]">
												<span>Tax</span>
												<span className="tabular-nums">
													{formatPrice(lastReceipt.taxCents, "MYR")}
												</span>
											</div>
										)}
										<div className="flex justify-between font-bold text-[#0a0a0a] text-[11px]">
											<span>TOTAL</span>
											<span className="tabular-nums">
												{formatPrice(lastReceipt.totalCents, "MYR")}
											</span>
										</div>
										<hr className="border-dashed border-[#e5e5e5]" />
										<p className="text-center text-[9px]">
											Payment: {formatPaymentLabel(lastReceipt.paymentMethod)}
										</p>
										<p className="text-center text-[9px]">Thank you!</p>
									</>
								) : (
									<>
										<p className="text-center font-bold text-[11px] text-[#0a0a0a]">
											{userContext?.organizations
												.find((o) => o.id === organizationId)
												?.name?.toUpperCase() ?? "—"}
										</p>
										<p className="text-center">{today}</p>
										<hr className="border-dashed border-[#e5e5e5]" />
										<p className="text-center text-[9px] text-[#a3a3a3] italic">
											No transactions yet this session
										</p>
										<hr className="border-dashed border-[#e5e5e5]" />
										<p className="text-center text-[9px]">
											Complete a sale to see the receipt here
										</p>
									</>
								)}
							</div>

							<div className="mt-3 flex gap-2">
								<button
									type="button"
									disabled={!lastReceipt}
									onClick={() => window.print()}
									className={cn(
										"flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-1.5 text-xs font-medium text-[#0a0a0a] transition-colors",
										lastReceipt
											? "hover:bg-[#f3f3f3] cursor-pointer"
											: "opacity-40 cursor-not-allowed",
									)}
								>
									Print
								</button>
								<button
									type="button"
									disabled
									className="flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-1.5 text-xs font-medium text-[#0a0a0a] opacity-40 cursor-not-allowed"
								>
									Email
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* ── Clear cart dialog ──────────────────────────────────────────── */}
			<Dialog open={clearCartDialogOpen} onOpenChange={setClearCartDialogOpen}>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							POINT OF SALE
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Clear cart?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Changing the customer will clear all items from the cart. This
							cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => {
								setClearCartDialogOpen(false);
								pendingCustomerRef.current = null;
							}}
						>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={confirmClearCart}
						>
							Clear Cart & Continue
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
