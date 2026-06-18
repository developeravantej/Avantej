import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useApiMutation } from "@/hooks/useApiMutation";
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

// ─── Schema ────────────────────────────────────────────────────────────────────

const markPaidSchema = z.object({
	paymentReference: z.string().trim().min(1, "Payment reference is required"),
});

type MarkPaidFormValues = z.infer<typeof markPaidSchema>;

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

interface MarkPaidDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedIds: string[];
	organizationId: string;
	onDone: () => void;
}

export function MarkPaidDialog({
	open,
	onOpenChange,
	selectedIds,
	organizationId,
	onDone,
}: MarkPaidDialogProps) {
	const count = selectedIds.length;

	const mutation = useApiMutation({
		mutationFn: (values: MarkPaidFormValues) =>
			client.commissionSplits.markPaidById({
				organizationId,
				ids: selectedIds,
				paymentReference: values.paymentReference,
			}),
		successMessage: `Marked ${count} commission split${count !== 1 ? "s" : ""} as paid.`,
		errorMessage: (err) =>
			err.message || "Failed to mark commission splits as paid.",
		onSuccess: () => {
			form.reset();
			onDone();
		},
	});

	const form = useForm({
		defaultValues: { paymentReference: "" } as MarkPaidFormValues,
		validators: { onSubmit: markPaidSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	function handleClose() {
		if (mutation.isPending) return;
		form.reset();
		onOpenChange(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION SUMMARY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark as Paid
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Record payment details for {count} commission split
						{count !== 1 ? "s" : ""}. This will move them to Paid status.
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="space-y-5 py-2">
							<form.Field name="paymentReference">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={field.name}>
											Payment Reference <span className="text-rose-600">*</span>
										</Label>
										<Input
											id={field.name}
											placeholder="Transaction ID, receipt no., bank transfer ref…"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>
						</div>
					</div>
				</form>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={mutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => form.handleSubmit()}
					>
						{mutation.isPending ? "Saving…" : "Mark as Paid"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
