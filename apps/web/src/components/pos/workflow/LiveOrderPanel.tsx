import type {
	AppliedPromo,
	CartItem,
	CustomerType,
	PaymentMethod,
} from "@/components/pos/types";
import { toast } from "sonner";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { LiveDot } from "./step-primitives";
import { formatPaymentLabel } from "./helpers";

interface LastReceiptData {
	orgName: string;
	customerName: string;
	items: CartItem[];
	subtotalCents: number;
	discountCents: number;
	taxCents: number;
	totalCents: number;
	paymentMethod: PaymentMethod | null;
	timestamp: Date;
	// Stripe Payment Link for online sales — customer pays here; the
	// payment_intent.succeeded webhook completes the order.
	paymentLinkUrl: string | null;
}

interface InstallmentPlanOption {
	id: string;
	numInstallments: number;
	pricePremiumBps?: number | null;
}

interface TaxRateOption {
	id: string;
	name: string;
	rateInBasisPoints: number;
}

interface LiveOrderPanelProps {
	// Current order state
	hideCustomerStep: boolean;
	customerLabel: string | null;
	customerTypeMode: CustomerType;
	items: CartItem[];
	appliedPromo: AppliedPromo | null;
	paymentMethod: PaymentMethod | null;
	discountCents: number;
	taxCents: number;
	taxRateBps: number;
	selectedTaxRate: TaxRateOption | undefined;
	// Installment plan display — domain invariant: dueNowCents is shown, not totalCents
	selectedPlan: InstallmentPlanOption | undefined;
	dueNowCents: number;
	subtotalCents: number;
	totalCents: number;
	// Step states
	stepState: (step: 0 | 1 | 2 | 3 | 4) => "done" | "active" | "idle";
	now: Date;
	today: string;
	// Last receipt
	lastReceipt: LastReceiptData | null;
	organizationId: string;
	orgName: string | undefined;
}

export function LiveOrderPanel({
	hideCustomerStep,
	customerLabel,
	customerTypeMode,
	items,
	appliedPromo,
	paymentMethod,
	discountCents,
	taxCents,
	taxRateBps,
	selectedTaxRate,
	selectedPlan,
	dueNowCents,
	subtotalCents,
	totalCents,
	stepState,
	now,
	today,
	lastReceipt,
	orgName,
}: LiveOrderPanelProps) {
	return (
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
									{stepState(0) === "done" || stepState(0) === "active" ? (
										<p className="text-xs font-semibold text-[#0a0a0a]">
											{customerLabel ??
												(customerTypeMode === "walk_in" ? "Walk-in" : "—")}
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
					{/* DOMAIN INVARIANT: show dueNowCents (installment due), not totalCents */}
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
										{formatPrice(item.unitPriceCents * item.quantity, "MYR")}
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
								{orgName?.toUpperCase() ?? "—"}
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

				{/* Online sale: Stripe payment link — the customer completes payment
				    here; the webhook then flips the order to completed. */}
				{lastReceipt?.paymentLinkUrl && (
					<div
						data-testid="pos-payment-link"
						className="mt-3 space-y-2 rounded-xl border border-[#0a0a0a]/15 bg-[#f8f8f8] p-3"
					>
						<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Payment Link
						</p>
						<code className="block w-full truncate rounded bg-white px-2 py-1 text-[10px] text-[#0a0a0a]">
							{lastReceipt.paymentLinkUrl}
						</code>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(lastReceipt.paymentLinkUrl!);
									toast.success("Payment link copied");
								}}
								className="flex-1 cursor-pointer rounded-[10px] border border-[#e5e5e5] bg-white py-1.5 text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
							>
								Copy link
							</button>
							<a
								href={lastReceipt.paymentLinkUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-1.5 text-center text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
							>
								Open
							</a>
						</div>
					</div>
				)}

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
	);
}
