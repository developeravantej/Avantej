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
				<p key={i} className="text-sm text-destructive">
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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Mark as Paid</DialogTitle>
					<DialogDescription>
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
					className="space-y-5 py-2"
				>
					<form.Field name="paymentReference">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Payment Reference{" "}
									<span className="text-destructive">*</span>
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

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Saving…" : "Mark as Paid"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
