import { useEffect, useMemo, useState } from "react";
import {
	loadStripe,
	type Stripe,
	type StripeElements,
} from "@stripe/stripe-js";
import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { client as orpcClient } from "@/utils/orpc";

type ChargeDialogProps = {
	open: boolean;
	onClose: () => void;
	onPaid: () => void;
	organizationId: string;
	appointmentId: string;
	sessionTotalCents: number;
};

type IntentResult = {
	clientSecret: string;
	paymentIntentId: string;
	stripeAccountId: string;
	amount: number;
	currency: string;
	applicationFeeAmount: number;
};

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
	| string
	| undefined;

// react-doctor-disable-next-line react-doctor/no-giant-component -- two-step payment dialog (intent creation + confirm); split would force prop drilling that obscures the flow
export function ChargeDialog({
	open,
	onClose,
	onPaid,
	organizationId,
	appointmentId,
	sessionTotalCents,
}: ChargeDialogProps) {
	const [intent, setIntent] = useState<IntentResult | null>(null);

	const createIntent = useMutation({
		mutationFn: async () =>
			(await orpcClient.payments.createPaymentIntent({
				organizationId,
				appointmentId,
			})) as IntentResult,
		onSuccess: (data) => setIntent(data),
		onError: (err: unknown) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to start payment",
			);
		},
	});

	useEffect(() => {
		if (open && !intent && !createIntent.isPending) {
			createIntent.mutate();
		}
		if (!open) {
			setIntent(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
		if (!intent || !publishableKey) return null;
		return loadStripe(publishableKey, {
			stripeAccount: intent.stripeAccountId,
		});
	}, [intent]);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						APPOINTMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Charge appointment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{intent
							? `${(intent.amount / 100).toFixed(2)} ${intent.currency}`
							: `${(sessionTotalCents / 100).toFixed(2)} (loading…)`}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{!publishableKey && (
						<p className="rounded-md bg-red-50 p-3 text-red-900 text-sm">
							Missing VITE_STRIPE_PUBLISHABLE_KEY — set it in apps/web/.env.
						</p>
					)}

					{createIntent.isPending && (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="size-6 animate-spin" />
						</div>
					)}

					{intent && stripePromise && (
						<Elements
							stripe={stripePromise}
							options={{ clientSecret: intent.clientSecret }}
						>
							<ChargeForm intent={intent} onPaid={onPaid} onClose={onClose} />
						</Elements>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ChargeForm({
	intent,
	onPaid,
	onClose,
}: {
	intent: IntentResult;
	onPaid: () => void;
	onClose: () => void;
}) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);

	const confirm = async () => {
		if (!stripe || !elements) return;
		setSubmitting(true);
		const { error } = await stripe.confirmPayment({
			elements: elements as StripeElements,
			confirmParams: { return_url: window.location.href },
			redirect: "if_required",
		});
		setSubmitting(false);
		if (error) {
			toast.error(error.message ?? "Payment failed");
			return;
		}
		toast.success("Payment submitted — confirming via webhook…");
		onPaid();
		onClose();
	};

	return (
		<div className="space-y-4">
			<PaymentElement />
			<p className="text-[#737373] text-xs">
				Application fee {(intent.applicationFeeAmount / 100).toFixed(2)}{" "}
				{intent.currency} remitted to Avantej.
			</p>
			<DialogFooter className="px-0 py-0 border-t-0 bg-transparent flex justify-end gap-2">
				<Button variant="outline" onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button
					onClick={confirm}
					disabled={submitting}
					className="flex-1 bg-[#0a0a0a] text-white hover:bg-[#262626]"
				>
					{submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
					Pay {(intent.amount / 100).toFixed(2)} {intent.currency}
				</Button>
			</DialogFooter>
		</div>
	);
}
