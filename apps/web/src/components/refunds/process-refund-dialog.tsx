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
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type RefundMethod = "cash" | "card_reversal" | "bank_transfer" | "store_credit";

const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
	{ value: "cash", label: "Cash" },
	{ value: "card_reversal", label: "Card Reversal" },
	{ value: "bank_transfer", label: "Bank Transfer" },
	{ value: "store_credit", label: "Store Credit" },
];

// ─── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
	refundMethod: z.enum([
		"cash",
		"card_reversal",
		"bank_transfer",
		"store_credit",
	]),
	refundReference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ProcessRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	refundId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProcessRefundDialog({
	open,
	onOpenChange,
	organizationId,
	refundId,
}: ProcessRefundDialogProps) {
	const queryClient = useQueryClient();

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			refundMethod: "cash",
			refundReference: "",
		},
	});

	const isPending = form.formState.isSubmitting;
	const selectedMethod = form.watch("refundMethod");
	const requiresReference = selectedMethod !== "cash";

	async function onSubmit(values: FormValues) {
		try {
			await client.refunds.process({
				organizationId,
				id: refundId,
				refundMethod: values.refundMethod,
				refundReference: values.refundReference?.trim() || undefined,
			});

			toast.success("Refund marked as processed.");
			queryClient.invalidateQueries({ queryKey: ["refunds", organizationId] });
			onOpenChange(false);
			form.reset();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to process refund.";
			toast.error(message);
		}
	}

	function handleOpenChange(open: boolean) {
		if (!open) form.reset();
		onOpenChange(open);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Mark as Processed</DialogTitle>
					<DialogDescription>
						Record how this refund was issued to the customer.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						{/* Refund method — radio group rendered as button list */}
						<FormField
							control={form.control}
							name="refundMethod"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Refund Method <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<div className="grid grid-cols-2 gap-2">
											{REFUND_METHODS.map((m) => (
												<button
													key={m.value}
													type="button"
													onClick={() => field.onChange(m.value)}
													className={`rounded-md border px-3 py-2 font-medium text-sm transition-colors ${
														field.value === m.value
															? "border-primary bg-primary/10 text-primary"
															: "border-input bg-background text-foreground hover:bg-muted"
													}`}
												>
													{m.label}
												</button>
											))}
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Reference — optional for cash, shown for all with hint */}
						<FormField
							control={form.control}
							name="refundReference"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Reference{" "}
										{requiresReference ? (
											<span className="text-muted-foreground text-xs">
												(bank ref / auth code)
											</span>
										) : (
											<span className="text-muted-foreground text-xs">
												(optional for cash)
											</span>
										)}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={
												selectedMethod === "bank_transfer"
													? "e.g. TXN-20240419-001"
													: selectedMethod === "card_reversal"
														? "e.g. AUTH-123456"
														: "optional"
											}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Disclaimer for non-cash methods */}
						{selectedMethod !== "cash" && selectedMethod !== "store_credit" && (
							<p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground text-xs">
								Note: This records the refund in the system. The actual{" "}
								{selectedMethod === "card_reversal"
									? "Stripe reversal"
									: "bank transfer"}{" "}
								must be issued manually. Enter the reference code after it is
								processed.
							</p>
						)}

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
								{isPending ? "Processing…" : "Mark Processed"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
