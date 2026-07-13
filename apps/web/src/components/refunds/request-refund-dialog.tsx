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
import { Textarea } from "@/components/ui/textarea";
import { centsToRm, formatPrice, rmToCents } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

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

export interface RequestRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	salesOrderId?: string;
	paymentId?: string;
	packageInstanceId?: string;
	suggestedAmountCents?: number;
	customerName?: string;
	customerId?: string;
	branchId?: string;
}

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

	const targetLabel = salesOrderId
		? `Sale ${salesOrderId.slice(0, 8)}…`
		: paymentId
			? `Payment ${paymentId.slice(0, 8)}…`
			: packageInstanceId
				? `Package ${packageInstanceId.slice(0, 8)}…`
				: "Unknown target";

	const defaultAmountRm =
		suggestedAmountCents != null && suggestedAmountCents > 0
			? centsToRm(suggestedAmountCents)
			: "";

	const form = useForm({
		defaultValues: {
			amountRm: defaultAmountRm,
			taxAmountRm: "",
			reason: "",
			notes: "",
		} as FormValues,
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			const amountCents = rmToCents(Number.parseFloat(value.amountRm));
			const taxCents = value.taxAmountRm
				? rmToCents(Number.parseFloat(value.taxAmountRm))
				: 0;

			try {
				await client.refunds.request({
					organizationId,
					salesOrderId,
					paymentId,
					packageInstanceId,
					amountCents,
					taxAmountCents: taxCents,
					reason: value.reason,
					notes: value.notes?.trim() || undefined,
					// CPR-08: customerId is derived server-side from the target record;
					// callers must NOT supply it. customerName + branchId stay as hints.
					customerName,
					branchId,
				});

				toast.success("Refund request submitted — pending approval.");
				queryClient.invalidateQueries({
					// AVANTEJ-12 (same defect class): match the oRPC list query key so a
					// newly requested refund appears without a manual reload.
					queryKey: orpc.refunds.list.key(),
				});
				onOpenChange(false);
				form.reset();
			} catch (err: unknown) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to submit refund request.";
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
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						REFUNDS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Request Refund
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Submit a refund request for review and approval.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-1 rounded-md bg-[#f3f3f3]/50 px-3 py-2 text-sm mb-4">
						<div className="flex justify-between">
							<span className="text-[#737373]">Target</span>
							<span className="font-medium font-mono">{targetLabel}</span>
						</div>
						{customerName && (
							<div className="flex justify-between">
								<span className="text-[#737373]">Customer</span>
								<span className="font-medium">{customerName}</span>
							</div>
						)}
						{suggestedAmountCents != null && suggestedAmountCents > 0 && (
							<div className="flex justify-between">
								<span className="text-[#737373]">Suggested amount</span>
								<span className="font-medium text-emerald-700">
									{formatPrice(suggestedAmountCents, "MYR")}
								</span>
							</div>
						)}
					</div>

					{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-4"
						id="request-refund-form"
					>
						<form.Field name="amountRm">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Refund Amount (RM) <span className="text-rose-600">*</span>
									</Label>
									<Input
										id={field.name}
										type="number"
										min="0.01"
										step="0.01"
										placeholder="0.00"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="taxAmountRm">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Tax Amount (RM, optional)</Label>
									<Input
										id={field.name}
										type="number"
										min="0"
										step="0.01"
										placeholder="0.00"
										value={field.state.value ?? ""}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="reason">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Reason <span className="text-rose-600">*</span>
									</Label>
									<Textarea
										id={field.name}
										rows={2}
										placeholder="Why is this refund being requested?"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="notes">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Additional Notes (optional)
									</Label>
									<Textarea
										id={field.name}
										rows={2}
										placeholder="Any additional context…"
										value={field.state.value ?? ""}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</form>
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
								form="request-refund-form"
								disabled={isPending}
								className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							>
								{isPending ? "Submitting…" : "Submit Request"}
							</Button>
						</DialogFooter>
					)}
				</form.Subscribe>
			</DialogContent>
		</Dialog>
	);
}
