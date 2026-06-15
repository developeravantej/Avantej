import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/utils/orpc";

type RefundMethod = "cash" | "card_reversal" | "bank_transfer" | "store_credit";

const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
	{ value: "cash", label: "Cash" },
	{ value: "card_reversal", label: "Card Reversal" },
	{ value: "bank_transfer", label: "Bank Transfer" },
	{ value: "store_credit", label: "Store Credit" },
];

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

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-rose-600">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

export interface ProcessRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	refundId: string;
}

export function ProcessRefundDialog({
	open,
	onOpenChange,
	organizationId,
	refundId,
}: ProcessRefundDialogProps) {
	const queryClient = useQueryClient();

	const form = useForm({
		defaultValues: {
			refundMethod: "cash" as RefundMethod,
			refundReference: "",
		} as FormValues,
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			try {
				await client.refunds.process({
					organizationId,
					id: refundId,
					refundMethod: value.refundMethod,
					refundReference: value.refundReference?.trim() || undefined,
				});

				toast.success("Refund marked as processed.");
				queryClient.invalidateQueries({
					queryKey: ["refunds", organizationId],
				});
				onOpenChange(false);
				form.reset();
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Failed to process refund.";
				toast.error(message);
			}
		},
	});

	function handleOpenChange(open: boolean) {
		if (!open) form.reset();
		onOpenChange(open);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						REFUNDS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark as Processed
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Record how this refund was issued to the customer.
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<div className="px-6 pt-4 pb-2 overflow-y-auto space-y-4">
						<form.Field name="refundMethod">
							{(field) => (
								<div className="space-y-2">
									<Label>
										Refund Method <span className="text-rose-600">*</span>
									</Label>
									<div className="grid grid-cols-2 gap-2">
										{REFUND_METHODS.map((m) => (
											<button
												key={m.value}
												type="button"
												onClick={() => field.handleChange(m.value)}
												className={`rounded-md border px-3 py-2 font-medium text-sm transition-colors ${
													field.state.value === m.value
														? "border-primary bg-primary/10 text-primary"
														: "border-[#e5e5e5] bg-white text-[#0a0a0a] hover:bg-[#f3f3f3]"
												}`}
											>
												{m.label}
											</button>
										))}
									</div>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Subscribe selector={(state) => state.values.refundMethod}>
							{(selectedMethod) => (
								<>
									<form.Field name="refundReference">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>
													Reference{" "}
													{selectedMethod !== "cash" ? (
														<span className="text-[#737373] text-xs">
															(bank ref / auth code)
														</span>
													) : (
														<span className="text-[#737373] text-xs">
															(optional for cash)
														</span>
													)}
												</Label>
												<Input
													id={field.name}
													placeholder={
														selectedMethod === "bank_transfer"
															? "e.g. TXN-20240419-001"
															: selectedMethod === "card_reversal"
																? "e.g. AUTH-123456"
																: "optional"
													}
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									{selectedMethod !== "cash" &&
										selectedMethod !== "store_credit" && (
											<p className="rounded-md bg-[#f3f3f3]/50 px-3 py-2 text-[#737373] text-xs">
												Note: This records the refund in the system. The actual{" "}
												{selectedMethod === "card_reversal"
													? "Stripe reversal"
													: "bank transfer"}{" "}
												must be issued manually. Enter the reference code after
												it is processed.
											</p>
										)}
								</>
							)}
						</form.Subscribe>
					</div>

					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isPending) => (
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => handleOpenChange(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={isPending}
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
								>
									{isPending ? "Processing…" : "Mark Processed"}
								</Button>
							</DialogFooter>
						)}
					</form.Subscribe>
				</form>
			</DialogContent>
		</Dialog>
	);
}
