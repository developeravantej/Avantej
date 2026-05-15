import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Send, Loader2, Copy, ExternalLink, CheckCircle2, AlertCircle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { client as orpcClient } from "@/utils/orpc";
import { ChargeDialog } from "./ChargeDialog";

type PaymentStatus = {
	id: string;
	paymentStatus: string;
	stripePaymentIntentId: string | null;
	stripePaymentLinkId: string | null;
	paymentLinkUrl: string | null;
	currency: string;
	sessionTotal: number | null;
	applicationFeeAmount: number | null;
	paidAt: Date | null;
	paymentFailureReason: string | null;
	paymentMethodType: string | null;
};

export function PaymentSection({
	organizationId,
	appointmentId,
}: {
	organizationId: string;
	appointmentId: string;
}) {
	const [chargeOpen, setChargeOpen] = useState(false);
	const [awaitingRefund, setAwaitingRefund] = useState(false);

	const statusQuery = useQuery({
		queryKey: ["payment-status", organizationId, appointmentId],
		queryFn: async () =>
			(await orpcClient.payments.getPaymentStatus({
				organizationId,
				appointmentId,
			})) as PaymentStatus,
		enabled: !!organizationId && !!appointmentId,
		refetchInterval: (q) => {
			const s = q.state.data?.paymentStatus;
			if (s === "pending" && q.state.data?.stripePaymentIntentId) return 3000;
			// Poll while waiting for charge.refunded webhook to flip paid -> refunded.
			if (awaitingRefund && s === "paid") return 3000;
			return false;
		},
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- refetched via refetchInterval on PI presence
	const sendLink = useMutation({
		mutationFn: async (regenerate: boolean) =>
			(await orpcClient.payments.sendPaymentLink({
				organizationId,
				appointmentId,
				regenerate,
			})) as { paymentLinkUrl: string; amount: number; currency: string; applicationFeeAmount: number },
		onSuccess: async (data) => {
			try {
				await navigator.clipboard.writeText(data.paymentLinkUrl);
				toast.success("Payment link generated + copied to clipboard");
			} catch {
				toast.success("Payment link generated");
			}
			statusQuery.refetch();
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to generate link");
		},
	});

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- refetched via refetchInterval on awaitingRefund + paid
	const refund = useMutation({
		mutationFn: async () =>
			(await orpcClient.payments.refund({
				organizationId,
				appointmentId,
			})) as { refundId: string; status: string; amount: number; currency: string },
		onMutate: () => {
			toast.loading("Refund requested…", { id: "refund-pending" });
		},
		onSuccess: (data) => {
			toast.dismiss("refund-pending");
			toast.success(`Refund issued (${data.refundId})`);
			setAwaitingRefund(true);
			statusQuery.refetch();
		},
		onError: (err: unknown) => {
			toast.dismiss("refund-pending");
			toast.error(err instanceof Error ? err.message : "Refund failed");
		},
	});

	// Stop polling once we observe the refunded status.
	if (awaitingRefund && statusQuery.data?.paymentStatus === "refunded") {
		// Defer to avoid setState during render.
		queueMicrotask(() => setAwaitingRefund(false));
	}

	const status = statusQuery.data;
	const isPaid = status?.paymentStatus === "paid";
	const isFailed = status?.paymentStatus === "failed";
	const hasLink = !!status?.paymentLinkUrl;

	return (
		<div className="px-5 pt-3 pb-3 border-t border-zinc-100 bg-white">
			<div className="flex items-center justify-between mb-2">
				<p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
					<CreditCard className="size-3.5" />
					Payment
				</p>
				<PaymentBadge status={status?.paymentStatus ?? "pending"} />
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between text-sm">
					<span className="text-zinc-500">Total</span>
					<span className="font-medium">
						{status?.sessionTotal != null
							? `${(status.sessionTotal / 100).toFixed(2)} ${status.currency ?? "MYR"}`
							: "—"}
					</span>
				</div>

				{isPaid && status?.paidAt && (
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>Paid</span>
						<span>{new Date(status.paidAt).toLocaleString()}</span>
					</div>
				)}

				{isPaid && (
					<div className="pt-1">
						<Button
							size="sm"
							variant="outline"
							className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
							onClick={() => {
								if (
									!window.confirm(
										"Refund this payment? This issues a full refund via Stripe and cannot be undone.",
									)
								)
									return;
								refund.mutate();
							}}
							disabled={refund.isPending || awaitingRefund}
						>
							{refund.isPending || awaitingRefund ? (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							) : (
								<Undo2 className="mr-1.5 size-3.5" />
							)}
							{awaitingRefund ? "Awaiting confirmation…" : "Refund"}
						</Button>
					</div>
				)}

				{isFailed && status?.paymentFailureReason && (
					<p className="rounded-md bg-red-50 p-2 text-red-900 text-xs">
						{status.paymentFailureReason}
					</p>
				)}

				{!isPaid && (
					<div className="flex gap-2 pt-1">
						<Button
							size="sm"
							className="flex-1"
							onClick={() => setChargeOpen(true)}
							disabled={statusQuery.isLoading}
						>
							<CreditCard className="mr-1.5 size-3.5" />
							Pay now
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="flex-1"
							onClick={() => sendLink.mutate(hasLink)}
							disabled={sendLink.isPending}
						>
							{sendLink.isPending ? (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							) : (
								<Send className="mr-1.5 size-3.5" />
							)}
							{hasLink ? "Regenerate link" : "Send link"}
						</Button>
					</div>
				)}

				{hasLink && status?.paymentLinkUrl && (
					<div className="rounded-md border border-zinc-200 p-2 space-y-1">
						<p className="text-zinc-500 text-[10px] uppercase tracking-wide">Payment link</p>
						<div className="flex items-center gap-1.5">
							<code className="flex-1 truncate text-xs">{status.paymentLinkUrl}</code>
							<button
								type="button"
								className="text-zinc-500 hover:text-zinc-900"
								onClick={async () => {
									if (!status.paymentLinkUrl) return;
									try {
										await navigator.clipboard.writeText(status.paymentLinkUrl);
										toast.success("Link copied");
									} catch {
										toast.error("Copy failed");
									}
								}}
							>
								<Copy className="size-3.5" />
							</button>
							<a
								href={status.paymentLinkUrl}
								target="_blank"
								rel="noreferrer"
								className="text-zinc-500 hover:text-zinc-900"
							>
								<ExternalLink className="size-3.5" />
							</a>
						</div>
					</div>
				)}
			</div>

			<ChargeDialog
				open={chargeOpen}
				onClose={() => setChargeOpen(false)}
				onPaid={() => statusQuery.refetch()}
				organizationId={organizationId}
				appointmentId={appointmentId}
				sessionTotalCents={status?.sessionTotal ?? 0}
			/>
		</div>
	);
}

function PaymentBadge({ status }: { status: string }) {
	if (status === "paid") {
		return (
			<Badge className="gap-1 bg-green-600 hover:bg-green-700">
				<CheckCircle2 className="size-3" /> Paid
			</Badge>
		);
	}
	if (status === "failed") {
		return (
			<Badge variant="destructive" className="gap-1">
				<AlertCircle className="size-3" /> Failed
			</Badge>
		);
	}
	if (status === "refunded") {
		return <Badge variant="secondary">Refunded</Badge>;
	}
	return <Badge variant="outline">Unpaid</Badge>;
}
