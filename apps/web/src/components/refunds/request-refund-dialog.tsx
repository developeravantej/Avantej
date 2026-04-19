import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

// ─── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
	amountRm: z
		.string()
		.min(1, "Amount is required")
		.refine(
			(v) => Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) > 0,
			{
				message: "Enter a valid positive amount",
			},
		),
	taxAmountRm: z.string().optional(),
	reason: z.string().min(1, "Reason is required"),
	notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface RequestRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	/** Pre-fill targets (at least one required) */
	salesOrderId?: string;
	paymentId?: string;
	packageInstanceId?: string;
	/** Suggested amount (in cents) — pre-populated in amount field */
	suggestedAmountCents?: number;
	/** Optional customer info — used to show context summary */
	customerName?: string;
	customerId?: string;
	branchId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RequestRefundDialog({
	open,
	onOpenChange,
	organizationId,
	salesOrderId,
	paymentId,
	packageInstanceId,
	suggestedAmountCents,
	customerName,
	customerId,
	branchId,
}: RequestRefundDialogProps) {
	const queryClient = useQueryClient();

	// Derive a human-readable target label for context summary
	const targetLabel = salesOrderId
		? `Sale ${salesOrderId.slice(0, 8)}…`
		: paymentId
			? `Payment ${paymentId.slice(0, 8)}…`
			: packageInstanceId
				? `Package ${packageInstanceId.slice(0, 8)}…`
				: "Unknown target";

	const defaultAmountRm =
		suggestedAmountCents != null && suggestedAmountCents > 0
			? (suggestedAmountCents / 100).toFixed(2)
			: "";

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			amountRm: defaultAmountRm,
			taxAmountRm: "",
			reason: "",
			notes: "",
		},
	});

	const isPending = form.formState.isSubmitting;

	async function onSubmit(values: FormValues) {
		const amountCents = Math.round(Number.parseFloat(values.amountRm) * 100);
		const taxCents = values.taxAmountRm
			? Math.round(Number.parseFloat(values.taxAmountRm) * 100)
			: 0;

		try {
			await (client as any).refunds.request({
				organizationId,
				salesOrderId,
				paymentId,
				packageInstanceId,
				amountCents,
				taxAmountCents: taxCents,
				reason: values.reason,
				notes: values.notes?.trim() || undefined,
				customerId,
				customerName,
				branchId,
			});

			toast.success("Refund request submitted — pending approval.");
			queryClient.invalidateQueries({ queryKey: ["refunds", organizationId] });
			onOpenChange(false);
			form.reset();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to submit refund request.";
			toast.error(message);
		}
	}

	function handleOpenChange(open: boolean) {
		if (!open) form.reset();
		onOpenChange(open);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Request Refund</DialogTitle>
					<DialogDescription>
						Submit a refund request for review and approval.
					</DialogDescription>
				</DialogHeader>

				{/* Context summary */}
				<div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Target</span>
						<span className="font-medium font-mono">{targetLabel}</span>
					</div>
					{customerName && (
						<div className="flex justify-between">
							<span className="text-muted-foreground">Customer</span>
							<span className="font-medium">{customerName}</span>
						</div>
					)}
					{suggestedAmountCents != null && suggestedAmountCents > 0 && (
						<div className="flex justify-between">
							<span className="text-muted-foreground">Suggested amount</span>
							<span className="font-medium text-emerald-700">
								{formatPrice(suggestedAmountCents, "MYR")}
							</span>
						</div>
					)}
				</div>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						{/* Amount */}
						<FormField
							control={form.control}
							name="amountRm"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Refund Amount (RM){" "}
										<span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input
											type="number"
											min="0.01"
											step="0.01"
											placeholder="0.00"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Tax amount */}
						<FormField
							control={form.control}
							name="taxAmountRm"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Tax Amount (RM, optional)</FormLabel>
									<FormControl>
										<Input
											type="number"
											min="0"
											step="0.01"
											placeholder="0.00"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Reason */}
						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Reason <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Textarea
											rows={2}
											placeholder="Why is this refund being requested?"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Notes */}
						<FormField
							control={form.control}
							name="notes"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Additional Notes (optional)</FormLabel>
									<FormControl>
										<Textarea
											rows={2}
											placeholder="Any additional context…"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => handleOpenChange(false)}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? "Submitting…" : "Submit Request"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
